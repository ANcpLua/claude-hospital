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
  readonly stream?: boolean;
  readonly responseFormat?: "text" | "json";
}

export type Result =
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false;
      readonly reason:
        | "no-key"
        | "network"
        | "provider-error"
        | "rate-limit"
        | "daily-cap"
        | "turnstile";
      readonly error?: string;
    };

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.2;
const PROXY_URL = "/api/gemini/generate";

interface GoogleResponse {
  readonly candidates?: ReadonlyArray<{
    readonly content?: { readonly parts?: ReadonlyArray<{ readonly text?: string }> };
  }>;
  readonly error?: { readonly message?: string };
}

interface ProxyErrorBody {
  readonly error?: string;
}

export function useLlmAvailable(): boolean {
  return true;
}

export async function callLLM(opts: CallOpts): Promise<Result> {
  return callViaProxy(opts);
}

export function callLLMStream(opts: CallOpts): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]() {
      return streamFallback(opts);
    },
  };
}

async function* streamFallback(opts: CallOpts): AsyncIterator<string> {
  const r = await callViaProxy(opts);
  if (!r.ok) throw Object.assign(new Error(r.error ?? r.reason), { reason: r.reason });
  if (r.text.length > 0) yield r.text;
}

async function callViaProxy(opts: CallOpts): Promise<Result> {
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
    const parsed = safeParse<ProxyErrorBody>(text);
    const kind = parsed?.error ?? "";
    if (r.status === 429 && kind === "daily-cap") {
      return { ok: false, reason: "daily-cap", error: "Daily demo limit reached — try again tomorrow." };
    }
    if (r.status === 429) {
      return { ok: false, reason: "rate-limit", error: "Too many requests — slow down." };
    }
    if (r.status === 403 && kind === "turnstile-failed") {
      return { ok: false, reason: "turnstile", error: "Bot check failed." };
    }
    return { ok: false, reason: "provider-error", error: kind.length > 0 ? kind : text.slice(0, 200) };
  }

  const data = safeParse<GoogleResponse>(text);
  if (!data) return { ok: false, reason: "provider-error", error: "invalid upstream response" };
  if (data.error?.message) {
    return { ok: false, reason: "provider-error", error: data.error.message };
  }
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return { ok: true, text: parts.map((p) => p.text ?? "").join("") };
}

function safeParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
