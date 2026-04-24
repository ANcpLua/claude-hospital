export function cacheGet<T>(ns: string, key: string): T | null {
  try {
    const raw = localStorage.getItem(`${ns}/${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function cacheSet<T>(ns: string, key: string, value: T): void {
  try {
    localStorage.setItem(`${ns}/${key}`, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

// FNV-1a 32-bit. Collisions are acceptable — two near-identical inputs
// sharing a cache slot just means one overwrites the other.
export function hash32(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}
