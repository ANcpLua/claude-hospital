import { callLLM } from "./llm";

export type ExtractResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

export interface ExtractOpts<T> {
  readonly system: string;
  readonly user: string;
  readonly validate: (raw: unknown) => T | null;
  readonly maxTokens?: number;
}

export async function extractJson<T>(opts: ExtractOpts<T>): Promise<ExtractResult<T>> {
  const r = await callLLM({
    system: `${opts.system}\n\nRespond ONLY with a single JSON object that matches the requested schema. Do not include explanations, code fences, or any text before or after the JSON.`,
    messages: [{ role: "user", content: opts.user }],
    maxTokens: opts.maxTokens ?? 600,
    temperature: 0,
    responseFormat: "json",
  });
  if (!r.ok) return { ok: false, reason: r.error ?? r.reason };
  const parsed = parseJsonLoose(r.text);
  if (parsed === null) return { ok: false, reason: "could not parse JSON from response" };
  const value = opts.validate(parsed);
  if (value === null) return { ok: false, reason: "JSON did not match schema" };
  return { ok: true, value };
}

function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim();
  const candidates: string[] = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) candidates.push(fence[1]);
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

export function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function asBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

export function asStringArray(v: unknown): ReadonlyArray<string> | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string" && item.trim().length > 0) out.push(item.trim());
  }
  return out;
}

export function asObjectArray<T>(
  v: unknown,
  mapItem: (raw: Record<string, unknown>) => T | null,
): ReadonlyArray<T> | null {
  if (!Array.isArray(v)) return null;
  const out: T[] = [];
  for (const item of v) {
    if (typeof item !== "object" || item === null) continue;
    const mapped = mapItem(item as Record<string, unknown>);
    if (mapped) out.push(mapped);
  }
  return out;
}
