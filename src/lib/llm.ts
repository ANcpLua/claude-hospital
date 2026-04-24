import { getTurnstileToken } from "./turnstile";

export interface Message {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface CallOpts {
  readonly system: string;
  readonly messages: ReadonlyArray<Message>;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly responseFormat?: "text" | "json";
}

export type CallReason =
  | "network"
  | "provider-error"
  | "rate-limit"
  | "daily-cap"
  | "turnstile";

export type Result =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: CallReason; readonly error?: string };

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.2;
const PROXY_URL = "/api/gemini/generate";

const REASON_COPY: Record<CallReason, string> = {
  network: "Network error reaching the demo proxy.",
  "provider-error": "Upstream model error.",
  "rate-limit": "Too many requests — slow down for a minute.",
  "daily-cap": "Daily demo limit reached — try again tomorrow.",
  turnstile: "Bot check failed — refresh the page and retry.",
};

export function reasonMessage(reason: CallReason): string {
  return REASON_COPY[reason];
}

export function safeParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

interface GoogleResponse {
  readonly candidates?: ReadonlyArray<{
    readonly content?: { readonly parts?: ReadonlyArray<{ readonly text?: string }> };
  }>;
  readonly error?: { readonly message?: string };
}

interface ProxyErrorBody {
  readonly error?: string;
}

export async function* callLLMStream(opts: CallOpts): AsyncIterable<string> {
  const r = await callLLM(opts);
  if (!r.ok) throw Object.assign(new Error(r.error ?? r.reason), { reason: r.reason });
  if (r.text.length > 0) yield r.text;
}

export async function callLLM(opts: CallOpts): Promise<Result> {
  let token: string;
  try {
    token = await getTurnstileToken();
  } catch (e) {
    return { ok: false, reason: "turnstile", error: errMsg(e) };
  }

  let r: Response;
  try {
    r = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system: opts.system,
        messages: opts.messages,
        maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
        responseFormat: opts.responseFormat,
        turnstileToken: token,
      }),
    });
  } catch (e) {
    return { ok: false, reason: "network", error: errMsg(e) };
  }

  const text = await r.text();
  if (!r.ok) {
    const kind = safeParse<ProxyErrorBody>(text)?.error ?? "";
    if (r.status === 429 && kind === "daily-cap") return fail("daily-cap");
    if (r.status === 429) return fail("rate-limit");
    if (r.status === 403 && kind === "turnstile-failed") return fail("turnstile");
    return { ok: false, reason: "provider-error", error: kind || text.slice(0, 200) };
  }

  const data = safeParse<GoogleResponse>(text);
  if (!data) return { ok: false, reason: "provider-error", error: "invalid upstream response" };
  if (data.error?.message) {
    return { ok: false, reason: "provider-error", error: data.error.message };
  }
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return { ok: true, text: parts.map((p) => p.text ?? "").join("") };
}

function fail(reason: CallReason): Result {
  return { ok: false, reason, error: REASON_COPY[reason] };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
