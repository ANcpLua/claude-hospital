// Bun proxy — serves Vite bundle, proxies /api/gemini/generate.
// Rate-limited per IP, daily cap, server-held key. Config via env.

import {
    type AttemptResult,
    type DailyState,
    type RateLimit,
    checkDaily,
    checkRate,
    callWithRetry,
    sweepRateLog,
    todayUtc,
} from "./lib";

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
const DAILY_CAP = num("DAILY_CAP", 1200);
const IP_LIMIT = num("IP_LIMIT", 200);
const IP_WINDOW_MS = num("IP_WINDOW_MINUTES", 60) * 60 * 1000;
const RETRY_MAX = num("RETRY_MAX", 3);
const RETRY_BASE_MS = num("RETRY_BASE_MS", 400);
const GEMINI_TIMEOUT_MS = num("GEMINI_TIMEOUT_MS", 20_000);
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";
const OWNER_IPS = new Set<string>(csv("OWNER_IPS", ""));
const DIST = "./dist";

const DEFAULT_ORIGINS =
    "https://claude-hospital.fly.dev,http://localhost:5173,http://localhost:5174,http://localhost:8080";
const ALLOWED_ORIGINS = new Set<string>(csv("ALLOWED_ORIGINS", DEFAULT_ORIGINS));

const PROXY_READY = GEMINI_KEY.length > 0;
if (!PROXY_READY) {
    console.warn(
        `[proxy] DEGRADED: missing GEMINI_KEY. Static site serves; /api/gemini/generate returns 503.`,
    );
}

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface CallBody {
    system?: string;
    messages?: Array<{ role: string; content: string }>;
    maxTokens?: number;
    temperature?: number;
    responseFormat?: "text" | "json";
}

const ipLog = new Map<string, number[]>();
const IP_LOG_MAX = 10_000;
const IP_RATE: RateLimit = {limit: IP_LIMIT, windowMs: IP_WINDOW_MS};
const daily: DailyState = {day: todayUtc(new Date()), count: 0};

function isOwner(ip: string): boolean {
    return OWNER_IPS.has(ip);
}

function checkIp(ip: string): boolean {
    if (isOwner(ip)) return true;
    return checkRate(ipLog, ip, Date.now(), IP_RATE);
}

setInterval(() => sweepRateLog(ipLog, Date.now(), IP_WINDOW_MS, IP_LOG_MAX), IP_WINDOW_MS);

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

async function callGeminiOnce(payload: string): Promise<AttemptResult> {
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
        return {status: r.status, body: await r.text()};
    } finally {
        clearTimeout(timer);
    }
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

    if (!checkDaily(daily, DAILY_CAP, new Date())) {
        return json({error: "daily-cap"}, 429, origin);
    }

    const payload = JSON.stringify({
        system_instruction: {parts: [{text: system}]},
        contents: messages.map((m) => ({
            role: m.role === "user" ? "user" : "model",
            parts: [{text: m.content}],
        })),
        generationConfig: {
            maxOutputTokens: body.maxTokens ?? 1024,
            temperature: body.temperature ?? 0.2,
            // Gemini 3 thinking eats output tokens silently — disable so maxOutputTokens maps 1:1 to visible text.
            thinkingConfig: {thinkingBudget: 0},
            ...(body.responseFormat === "json" ? {responseMimeType: "application/json"} : {}),
        },
    });

    const upstream = await callWithRetry(
        () => callGeminiOnce(payload),
        {
            maxAttempts: RETRY_MAX,
            baseMs: RETRY_BASE_MS,
            sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
            random: Math.random,
        },
        (level, msg) => (level === "error" ? console.error : console.warn)(`[llm] ${msg} (model=${GEMINI_MODEL})`),
    );
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
