// Rheum Portal — Bun proxy in front of Gemini.
//
// Serves the built Vite bundle from ./dist and exposes /api/gemini/generate
// with: origin allowlist → per-IP sliding window → global daily cap →
// Cloudflare Turnstile verify → forward to Gemini with the server-held key.
//
// Env:
//   GEMINI_KEY         (required) — Fly secret, Google AI Studio key
//   TURNSTILE_SECRET   (required) — Fly secret, Turnstile secret key
//   DAILY_CAP          (optional) — global daily requests, default 1200
//   PORT               (optional) — default 8080

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
  exit: (code?: number) => never;
};

const PORT = Number(process.env.PORT ?? 8080);
const GEMINI_KEY = mustEnv("GEMINI_KEY");
const TURNSTILE_SECRET = mustEnv("TURNSTILE_SECRET");
const DAILY_CAP = Number(process.env.DAILY_CAP ?? 1200);
const DIST = "./dist";

const ALLOWED_ORIGINS = new Set<string>([
  "https://claude-hospital.fly.dev",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:8080",
]);

const IP_LIMIT = 30;
const IP_WINDOW_MS = 60 * 60 * 1000;

const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
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
let today = todayUtc();
let dayCount = 0;

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    console.error(`[fatal] missing env: ${name}`);
    process.exit(1);
  }
  return v;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function checkIp(ip: string): boolean {
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

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  try {
    const r = await fetch(TURNSTILE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    const data = (await r.json()) as { success?: boolean; "error-codes"?: string[] };
    return data.success === true;
  } catch {
    return false;
  }
}

function handleOptions(req: Request): Response {
  const origin = req.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
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
    return json({ error: "origin-rejected" }, 403, origin);
  }
  const ip = clientIp(req);
  if (!checkIp(ip)) return json({ error: "rate-limit" }, 429, origin);
  if (!checkDaily()) return json({ error: "daily-cap" }, 429, origin);

  let body: CallBody;
  try {
    body = (await req.json()) as CallBody;
  } catch {
    return json({ error: "bad-json" }, 400, origin);
  }

  const token = body.turnstileToken?.trim() ?? "";
  if (!token) return json({ error: "missing-token" }, 400, origin);
  if (!(await verifyTurnstile(token, ip))) {
    return json({ error: "turnstile-failed" }, 403, origin);
  }

  const system = body.system ?? "";
  const messages = body.messages ?? [];
  if (messages.length === 0) return json({ error: "empty-messages" }, 400, origin);

  let upstream: Response;
  try {
    upstream = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          maxOutputTokens: body.maxTokens ?? 1024,
          temperature: body.temperature ?? 0.2,
          ...(body.responseFormat === "json" ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
  } catch (e) {
    return json({ error: "upstream-network", detail: errMsg(e) }, 502, origin);
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
  });
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
    if (url.pathname === "/api/health") return new Response("ok");
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response(null, { status: 405 });
    }
    return serveStatic(url.pathname);
  },
});

console.log(`[rheum-proxy] listening on :${PORT} · cap=${DAILY_CAP}/day`);
