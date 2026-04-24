import { useSyncExternalStore } from "react";

export interface ByokConfig {
  readonly key: string;
}

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
      readonly reason: "no-key" | "network" | "provider-error";
      readonly error?: string;
    };

const STORAGE_KEY = "meduni-byok";
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.2;

// Gemini 3.1 Flash-Lite Preview — cheapest multimodal with fastest
// performance. Bump to whichever flash-tier ID is current on AI Studio if
// Google rotates the preview tag.
const GOOGLE_MODEL = "gemini-3.1-flash-lite-preview";

export function getByok(): ByokConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ByokConfig>;
    return typeof parsed?.key === "string" ? { key: parsed.key } : null;
  } catch {
    return null;
  }
}

export function useLlmAvailable(): boolean {
  return useSyncExternalStore(subscribeByok, hasKey, hasKey);
}

function subscribeByok(notify: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) notify();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("meduni-byok-change", notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("meduni-byok-change", notify);
  };
}

function hasKey(): boolean {
  return (getByok()?.key.trim().length ?? 0) > 0;
}

export function notifyByokChange(): void {
  window.dispatchEvent(new Event("meduni-byok-change"));
}

export async function callLLM(opts: CallOpts): Promise<Result> {
  const cfg = getByok();
  if (!cfg || cfg.key.trim().length === 0) return { ok: false, reason: "no-key" };
  return callGoogle(cfg.key, opts);
}

export function callLLMStream(opts: CallOpts): AsyncIterable<string> {
  const cfg = getByok();
  return {
    [Symbol.asyncIterator]() {
      if (!cfg || cfg.key.trim().length === 0) return errorIterator("no-key");
      return streamGoogleFallback(cfg.key, opts);
    },
  };
}

function errorIterator(reason: "no-key" | "network" | "provider-error"): AsyncIterator<string> {
  return {
    next: () =>
      Promise.reject(
        Object.assign(new Error(`llm stream unavailable: ${reason}`), { reason }),
      ),
  };
}

interface GoogleResponse {
  readonly candidates?: ReadonlyArray<{
    readonly content?: { readonly parts?: ReadonlyArray<{ readonly text?: string }> };
  }>;
  readonly error?: { readonly message?: string };
}

async function callGoogle(key: string, opts: CallOpts): Promise<Result> {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:generateContent?key=${encodeURIComponent(
        key,
      )}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: opts.system }] },
          contents: opts.messages.map((m) => ({
            role: m.role === "user" ? "user" : "model",
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            maxOutputTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
            temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
            ...(opts.responseFormat === "json"
              ? { responseMimeType: "application/json" }
              : {}),
          },
        }),
      },
    );
    if (!r.ok) return { ok: false, reason: "provider-error", error: await safeText(r) };
    const data = (await r.json()) as GoogleResponse;
    if (data.error?.message) {
      return { ok: false, reason: "provider-error", error: data.error.message };
    }
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    return { ok: true, text: parts.map((p) => p.text ?? "").join("") };
  } catch (e) {
    return { ok: false, reason: "network", error: errMsg(e) };
  }
}

async function* streamGoogleFallback(
  key: string,
  opts: CallOpts,
): AsyncIterator<string> {
  const r = await callGoogle(key, opts);
  if (!r.ok) {
    throw Object.assign(new Error(r.error ?? r.reason), { reason: r.reason });
  }
  if (r.text.length > 0) yield r.text;
}

async function safeText(r: Response): Promise<string> {
  try {
    return await r.text();
  } catch {
    return `${r.status} ${r.statusText}`;
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
