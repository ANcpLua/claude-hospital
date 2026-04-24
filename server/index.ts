// Rheum Portal — Bun proxy in front of Gemini.
//
// Serves the built Vite bundle from ./dist and exposes /api/gemini/generate.
// Per request: origin allowlist → owner-IP fast-path OR (per-IP sliding window
// → Turnstile siteverify) → daily cap (consumed only on accepted requests) →
// retried fetch to Gemini with the server-held key.
//
// Policy: Flash Lite only. No silent model fallback — when the cheap model is
// overloaded we retry, then surface the failure clearly.
//
// All tunables come from env so fly.toml / .env can drive behavior without code
// changes:
//   GEMINI_KEY              required — Fly secret
//   TURNSTILE_SECRET        required — Fly secret
//   GEMINI_MODEL            default gemini-flash-lite-latest
//   OWNER_IPS               comma list — IPs that skip rate-limit + Turnstile
//   IP_LIMIT                default 200
//   IP_WINDOW_MINUTES       default 60
//   DAILY_CAP               default 1200
//   RETRY_MAX               default 3
//   RETRY_BASE_MS           default 400 (exponential: 400, 800, 1600 …)
//   GEMINI_TIMEOUT_MS       default 20000
//   TURNSTILE_TIMEOUT_MS    default 10000
//   ALLOWED_ORIGINS         comma list (defaults below)
//   PORT                    default 8080

declare const Bun: {
    serve: (opts: {
        port: number;
        hostname?: string;
        fetch: (req: Request) => Response | Promise<Response>;
    }) => { stop: () => void };
    file: (path: string) => {
        exists: () => Promise<boolean>;
        size: number;
    } & Blob;
};

declare const process: {
    env: Record<string, string | undefined>;
};

function num(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw.trim().length === 0) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
}

function csv(name: string, fallback: string): ReadonlyArray<string> {
    return (process.env[name] ?? fallback)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

const PORT = num("PORT", 8080);
const GEMINI_KEY = (process.env.GEMINI_KEY ?? "").trim();
const TURNSTILE_SECRET = (process.env.TURNSTILE_SECRET ?? "").trim();
const DAILY_CAP = num("DAILY_CAP", 1200);
const IP_LIMIT = num("IP_LIMIT", 200);
const IP_WINDOW_MS = num("IP_WINDOW_MINUTES", 60) * 60 * 1000;
const RETRY_MAX = num("RETRY_MAX", 3);
const RETRY_BASE_MS = num("RETRY_BASE_MS", 400);
const GEMINI_TIMEOUT_MS = num("GEMINI_TIMEOUT_MS", 20_000);
const TURNSTILE_TIMEOUT_MS = num("TURNSTILE_TIMEOUT_MS", 10_000);
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";
const OWNER_IPS = new Set<string>(csv("OWNER_IPS", ""));
const DIST = "./dist";

const DEFAULT_ORIGINS =
    "https://claude-hospital.fly.dev,http://localhost:5173,http://localhost:5174,http://localhost:8080";
const ALLOWED_ORIGINS = new Set<string>(csv("ALLOWED_ORIGINS", DEFAULT_ORIGINS));

const PROXY_READY = GEMINI_KEY.length > 0 && TURNSTILE_SECRET.length > 0;
if (!PROXY_READY) {
    const missing = [
        GEMINI_KEY.length === 0 ? "GEMINI_KEY" : null,
        TURNSTILE_SECRET.length === 0 ? "TURNSTILE_SECRET" : null,
    ].filter((v): v is string => v !== null);
    console.warn(
        `[proxy] DEGRADED — missing ${missing.join(", ")}. Static site serves; /api/gemini/generate returns 503.`,
    );
}

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface CallBody {
    system?: string;
    messages?: Array<{ role: string; content: string }>;
    maxTokens?: number;
    temperature?: number;
    responseFormat?: "text" | "json";
    turnstileToken?: string;
}

const ipLog = new Map<string, number[]>();
const IP_LOG_MAX = 10_000;
let today = todayUtc();
let dayCount = 0;

function todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
}

function isOwner(ip: string): boolean {
    return OWNER_IPS.has(ip);
}

function checkIp(ip: string): boolean {
    if (isOwner(ip)) return true;
    const now = Date.now();
    const arr = (ipLog.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
    if (arr.length >= IP_LIMIT) {
        ipLog.set(ip, arr);
        return false;
    }
    arr.push(now);
    ipLog.set(ip, arr);
    return true;
}

function sweepIpLog(): void {
    const cutoff = Date.now() - IP_WINDOW_MS;
    for (const [ip, arr] of ipLog) {
        const trimmed = arr.filter((t) => t > cutoff);
        if (trimmed.length === 0) ipLog.delete(ip);
        else if (trimmed.length !== arr.length) ipLog.set(ip, trimmed);
    }
    if (ipLog.size > IP_LOG_MAX) ipLog.clear();
}

setInterval(sweepIpLog, IP_WINDOW_MS);

function checkDaily(): boolean {
    const t = todayUtc();
    if (t !== today) {
        today = t;
        dayCount = 0;
    }
    if (dayCount >= DAILY_CAP) return false;
    dayCount += 1;
    return true;
}

function clientIp(req: Request): string {
    return (
        req.headers.get("fly-client-ip") ??
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "unknown"
    );
}

function corsHeaders(origin: string | null): Record<string, string> {
    const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
    return {
        "access-control-allow-origin": allowed,
        vary: "origin",
    };
}

function json(body: unknown, status: number, origin: string | null): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            ...corsHeaders(origin),
        },
    });
}

function uuid(): string {
    return crypto.randomUUID();
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TURNSTILE_TIMEOUT_MS);
    try {
        const r = await fetch(TURNSTILE_URL, {
            method: "POST",
            headers: {"content-type": "application/x-www-form-urlencoded"},
            body: new URLSearchParams({
                secret: TURNSTILE_SECRET,
                response: token,
                remoteip: ip,
                idempotency_key: uuid(),
            }),
            signal: ctrl.signal,
        });
        const data = (await r.json()) as { success?: boolean; "error-codes"?: string[] };
        if (data.success !== true) {
            console.warn(
                `[turnstile] verify failed: ${(data["error-codes"] ?? ["no-codes"]).join(",")}`,
            );
        }
        return data.success === true;
    } catch (e) {
        console.warn(`[turnstile] verify threw: ${errMsg(e)}`);
        return false;
    } finally {
        clearTimeout(timer);
    }
}

interface UpstreamResult {
    readonly status: number;
    readonly body: string;
    readonly attempts: number;
}

async function callGeminiOnce(payload: string): Promise<{ status: number; body: string }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);
    try {
        const r = await fetch(GEMINI_URL, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-goog-api-key": GEMINI_KEY,
            },
            body: payload,
            signal: ctrl.signal,
        });
        const body = await r.text();
        return {status: r.status, body};
    } finally {
        clearTimeout(timer);
    }
}

function shouldRetry(status: number): boolean {
    return status === 429 || (status >= 500 && status <= 599);
}

async function callGeminiWithRetry(payload: string): Promise<UpstreamResult> {
    let lastStatus = 0;
    let lastBody = "";
    for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
        try {
            const r = await callGeminiOnce(payload);
            lastStatus = r.status;
            lastBody = r.body;
            if (r.status >= 200 && r.status < 300) {
                if (attempt > 1) {
                    console.warn(`[llm] recovered after ${attempt} attempts (model=${GEMINI_MODEL})`);
                }
                return {status: r.status, body: r.body, attempts: attempt};
            }
            if (!shouldRetry(r.status)) {
                console.warn(`[llm] non-retryable ${r.status}: ${r.body.slice(0, 200)}`);
                return {status: r.status, body: r.body, attempts: attempt};
            }
            console.warn(
                `[llm] attempt ${attempt}/${RETRY_MAX} got ${r.status} — backing off`,
            );
        } catch (e) {
            lastStatus = 0;
            lastBody = JSON.stringify({error: {message: errMsg(e)}});
            console.warn(`[llm] attempt ${attempt}/${RETRY_MAX} threw: ${errMsg(e)}`);
        }
        if (attempt < RETRY_MAX) {
            const backoff = RETRY_BASE_MS * Math.pow(2, attempt - 1);
            const jitter = Math.floor(Math.random() * RETRY_BASE_MS);
            await new Promise((res) => setTimeout(res, backoff + jitter));
        }
    }
    console.error(
        `[llm] EXHAUSTED ${RETRY_MAX} attempts — last status=${lastStatus} model=${GEMINI_MODEL}`,
    );
    return {status: lastStatus || 503, body: lastBody, attempts: RETRY_MAX};
}

function handleOptions(req: Request): Response {
    const origin = req.headers.get("origin");
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return new Response(null, {status: 403});
    return new Response(null, {
        status: 204,
        headers: {
            ...corsHeaders(origin),
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type",
            "access-control-max-age": "86400",
        },
    });
}

async function handleGenerate(req: Request): Promise<Response> {
    const origin = req.headers.get("origin");
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
        return json({error: "origin-rejected"}, 403, origin);
    }
    if (!PROXY_READY) {
        return json({error: "proxy-disabled"}, 503, origin);
    }
    const ip = clientIp(req);
    const owner = isOwner(ip);
    if (!checkIp(ip)) return json({error: "rate-limit"}, 429, origin);

    let body: CallBody;
    try {
        body = (await req.json()) as CallBody;
    } catch {
        return json({error: "bad-json"}, 400, origin);
    }

    const system = body.system ?? "";
    const messages = body.messages ?? [];
    if (messages.length === 0) return json({error: "empty-messages"}, 400, origin);

    if (!owner) {
        const token = body.turnstileToken?.trim() ?? "";
        if (!token) return json({error: "missing-token"}, 400, origin);
        if (!(await verifyTurnstile(token, ip))) {
            return json({error: "turnstile-failed"}, 403, origin);
        }
    }

    if (!checkDaily()) return json({error: "daily-cap"}, 429, origin);

    const payload = JSON.stringify({
        system_instruction: {parts: [{text: system}]},
        contents: messages.map((m) => ({
            role: m.role === "user" ? "user" : "model",
            parts: [{text: m.content}],
        })),
        generationConfig: {
            maxOutputTokens: body.maxTokens ?? 1024,
            temperature: body.temperature ?? 0.2,
            ...(body.responseFormat === "json" ? {responseMimeType: "application/json"} : {}),
        },
    });

    const upstream = await callGeminiWithRetry(payload);
    const headers: Record<string, string> = {
        "content-type": "application/json; charset=utf-8",
        "x-llm-attempts": String(upstream.attempts),
        "x-llm-model": GEMINI_MODEL,
        ...corsHeaders(origin),
    };
    if (upstream.status >= 500 || upstream.status === 429) {
        return new Response(
            JSON.stringify({
                error: "upstream-overloaded",
                status: upstream.status,
                attempts: upstream.attempts,
                model: GEMINI_MODEL,
                detail: upstream.body.slice(0, 400),
            }),
            {status: 503, headers},
        );
    }
    return new Response(upstream.body, {status: upstream.status, headers});
}

async function serveStatic(pathname: string): Promise<Response> {
    const clean = pathname.split("?")[0] ?? "/";
    const target = clean === "/" ? "/index.html" : clean;
    const file = Bun.file(`${DIST}${target}`);
    const exists = await file.exists();
    if (exists) {
        const immutable = /\.(?:js|css|svg|png|woff2?|jpg|jpeg|webp|ico)$/.test(target);
        return new Response(file as unknown as BodyInit, {
            headers: {
                "cache-control": immutable
                    ? "public, max-age=604800, immutable"
                    : "no-cache",
            },
        });
    }
    return new Response(Bun.file(`${DIST}/index.html`) as unknown as BodyInit, {
        headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-cache",
        },
    });
}

function errMsg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

Bun.serve({
    port: PORT,
    hostname: "0.0.0.0",
    async fetch(req) {
        const url = new URL(req.url);
        if (req.method === "OPTIONS") return handleOptions(req);
        if (url.pathname === "/api/gemini/generate" && req.method === "POST") {
            return handleGenerate(req);
        }
        if (url.pathname === "/api/health") {
            return new Response(
                JSON.stringify({
                    ok: true,
                    model: GEMINI_MODEL,
                    proxyReady: PROXY_READY,
                    ownerIps: OWNER_IPS.size,
                }),
                {headers: {"content-type": "application/json"}},
            );
        }
        if (req.method !== "GET" && req.method !== "HEAD") {
            return new Response(null, {status: 405});
        }
        return serveStatic(url.pathname);
    },
});

console.log(
    `[proxy] :${PORT} · model=${GEMINI_MODEL} · cap=${DAILY_CAP}/day · per-IP ${IP_LIMIT}/${IP_WINDOW_MS / 60000}min · retries=${RETRY_MAX} · owners=${OWNER_IPS.size}`,
);
