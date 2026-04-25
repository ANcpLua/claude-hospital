// Pure logic extracted from index.ts so tests can exercise it without
// booting Bun. Everything here is deterministic given inputs + injected
// state — no module-level mutation, no env reads, no fetch.

export interface RateLimit {
    readonly limit: number;
    readonly windowMs: number;
}

/**
 * Sliding-window rate-limit check.
 * Mutates `log` in place: removes expired timestamps, appends `now` on accept.
 * Returns true if accepted (under limit), false if rejected.
 */
export function checkRate(
    log: Map<string, number[]>,
    key: string,
    now: number,
    {limit, windowMs}: RateLimit,
): boolean {
    const arr = (log.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) {
        log.set(key, arr);
        return false;
    }
    arr.push(now);
    log.set(key, arr);
    return true;
}

export function sweepRateLog(
    log: Map<string, number[]>,
    now: number,
    windowMs: number,
    maxKeys: number,
): void {
    const cutoff = now - windowMs;
    for (const [key, arr] of log) {
        const trimmed = arr.filter((t) => t > cutoff);
        if (trimmed.length === 0) log.delete(key);
        else if (trimmed.length !== arr.length) log.set(key, trimmed);
    }
    if (log.size > maxKeys) log.clear();
}

export interface DailyState {
    day: string;
    count: number;
}

export function todayUtc(now: Date): string {
    return now.toISOString().slice(0, 10);
}

/**
 * Global daily counter. Resets count when day rolls over.
 * Returns true if accepted (under cap), false if rejected.
 * Mutates `state` in place.
 */
export function checkDaily(state: DailyState, cap: number, now: Date): boolean {
    const t = todayUtc(now);
    if (t !== state.day) {
        state.day = t;
        state.count = 0;
    }
    if (state.count >= cap) return false;
    state.count += 1;
    return true;
}

export function shouldRetry(status: number): boolean {
    return status === 429 || (status >= 500 && status <= 599);
}

export interface RetryConfig {
    readonly maxAttempts: number;
    readonly baseMs: number;
    readonly sleep: (ms: number) => Promise<void>;
    readonly random: () => number;
}

export interface AttemptResult {
    readonly status: number;
    readonly body: string;
}

export interface RetryOutcome extends AttemptResult {
    readonly attempts: number;
}

/**
 * Generic retry-with-backoff over a single attempt function.
 * - 2xx: returns immediately.
 * - 429/5xx: backs off `baseMs * 2^(n-1) + jitter` and retries up to maxAttempts.
 * - Other 4xx: returns the response without retrying.
 * - Throws inside attempt: counts as a failed attempt; retried.
 * After exhausting attempts the last result (or 503 if all threw) is returned.
 */
export async function callWithRetry(
    attempt: () => Promise<AttemptResult>,
    cfg: RetryConfig,
    log?: (level: "warn" | "error", msg: string) => void,
): Promise<RetryOutcome> {
    let last: AttemptResult = {status: 0, body: ""};
    for (let n = 1; n <= cfg.maxAttempts; n++) {
        try {
            const r = await attempt();
            last = r;
            if (r.status >= 200 && r.status < 300) {
                if (n > 1) log?.("warn", `recovered after ${n} attempts`);
                return {...r, attempts: n};
            }
            if (!shouldRetry(r.status)) {
                log?.("warn", `non-retryable ${r.status}`);
                return {...r, attempts: n};
            }
            log?.("warn", `attempt ${n}/${cfg.maxAttempts} got ${r.status} — backing off`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            last = {status: 0, body: JSON.stringify({error: {message: msg}})};
            log?.("warn", `attempt ${n}/${cfg.maxAttempts} threw: ${msg}`);
        }
        if (n < cfg.maxAttempts) {
            const backoff = cfg.baseMs * Math.pow(2, n - 1);
            const jitter = Math.floor(cfg.random() * cfg.baseMs);
            await cfg.sleep(backoff + jitter);
        }
    }
    log?.("error", `EXHAUSTED ${cfg.maxAttempts} attempts — last status=${last.status}`);
    return {status: last.status || 503, body: last.body, attempts: cfg.maxAttempts};
}
