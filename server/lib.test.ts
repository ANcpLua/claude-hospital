import {describe, expect, it, vi} from "vitest";
import {
    type AttemptResult,
    type RetryConfig,
    callWithRetry,
    checkDaily,
    checkRate,
    shouldRetry,
    sweepRateLog,
    todayUtc,
} from "./lib";

const HOUR = 60 * 60 * 1000;
const RATE = {limit: 3, windowMs: HOUR};

describe("checkRate (sliding-window)", () => {
    it("accepts up to limit, rejects beyond, then accepts again after window slides", () => {
        const log = new Map<string, number[]>();
        const t0 = 1_000_000;
        expect(checkRate(log, "1.1.1.1", t0, RATE)).toBe(true);
        expect(checkRate(log, "1.1.1.1", t0 + 1, RATE)).toBe(true);
        expect(checkRate(log, "1.1.1.1", t0 + 2, RATE)).toBe(true);
        expect(checkRate(log, "1.1.1.1", t0 + 3, RATE)).toBe(false);
        expect(checkRate(log, "1.1.1.1", t0 + HOUR + 10, RATE)).toBe(true);
    });

    it("isolates IPs", () => {
        const log = new Map<string, number[]>();
        const t = 1_000_000;
        for (let i = 0; i < RATE.limit; i++) {
            expect(checkRate(log, "a", t + i, RATE)).toBe(true);
        }
        expect(checkRate(log, "a", t + 100, RATE)).toBe(false);
        expect(checkRate(log, "b", t + 100, RATE)).toBe(true);
    });
});

describe("sweepRateLog", () => {
    it("evicts keys whose timestamps all expired", () => {
        // Cutoff at now=2*HOUR with windowMs=HOUR → keep entries > HOUR.
        const log = new Map<string, number[]>([
            ["expired", [1, 2, 3]],
            ["mixed", [10, HOUR + 5]],
            ["fresh", [HOUR + 10]],
        ]);
        sweepRateLog(log, 2 * HOUR, HOUR, 1000);
        expect(log.has("expired")).toBe(false);
        expect(log.get("mixed")).toEqual([HOUR + 5]);
        expect(log.get("fresh")).toEqual([HOUR + 10]);
    });

    it("clears entirely when over maxKeys", () => {
        const log = new Map<string, number[]>();
        for (let i = 0; i < 10; i++) log.set(`k${i}`, [Date.now()]);
        sweepRateLog(log, Date.now(), HOUR, 5);
        expect(log.size).toBe(0);
    });
});

describe("checkDaily", () => {
    it("counts up to cap then rejects", () => {
        const state = {day: "2026-04-25", count: 0};
        const now = new Date("2026-04-25T12:00:00Z");
        expect(checkDaily(state, 2, now)).toBe(true);
        expect(checkDaily(state, 2, now)).toBe(true);
        expect(checkDaily(state, 2, now)).toBe(false);
        expect(state.count).toBe(2);
    });

    it("resets on UTC day rollover", () => {
        const state = {day: "2026-04-25", count: 5};
        const next = new Date("2026-04-26T00:00:01Z");
        expect(checkDaily(state, 5, next)).toBe(true);
        expect(state.day).toBe("2026-04-26");
        expect(state.count).toBe(1);
    });
});

describe("todayUtc", () => {
    it("formats YYYY-MM-DD in UTC regardless of locale", () => {
        expect(todayUtc(new Date("2026-04-25T23:59:59.999Z"))).toBe("2026-04-25");
        expect(todayUtc(new Date("2026-04-26T00:00:00.000Z"))).toBe("2026-04-26");
    });
});

describe("shouldRetry", () => {
    it.each([
        [200, false],
        [204, false],
        [301, false],
        [400, false],
        [403, false],
        [404, false],
        [429, true],
        [500, true],
        [502, true],
        [503, true],
        [599, true],
        [600, false],
    ])("status %i → %s", (status, expected) => {
        expect(shouldRetry(status)).toBe(expected);
    });
});

function cfg(overrides?: Partial<RetryConfig>): RetryConfig {
    return {
        maxAttempts: 3,
        baseMs: 100,
        sleep: vi.fn().mockResolvedValue(undefined),
        random: () => 0,
        ...overrides,
    };
}

describe("callWithRetry", () => {
    it("returns immediately on first 2xx — no sleep", async () => {
        const c = cfg();
        const attempt = vi.fn(async (): Promise<AttemptResult> => ({status: 200, body: "ok"}));
        const r = await callWithRetry(attempt, c);
        expect(r).toEqual({status: 200, body: "ok", attempts: 1});
        expect(attempt).toHaveBeenCalledTimes(1);
        expect(c.sleep).not.toHaveBeenCalled();
    });

    it("retries 503 then succeeds — counts attempts and uses exponential backoff", async () => {
        const c = cfg();
        const attempt = vi
            .fn<() => Promise<AttemptResult>>()
            .mockResolvedValueOnce({status: 503, body: "overloaded"})
            .mockResolvedValueOnce({status: 503, body: "overloaded"})
            .mockResolvedValueOnce({status: 200, body: "ok"});
        const r = await callWithRetry(attempt, c);
        expect(r).toEqual({status: 200, body: "ok", attempts: 3});
        expect(c.sleep).toHaveBeenCalledTimes(2);
        expect(c.sleep).toHaveBeenNthCalledWith(1, 100);
        expect(c.sleep).toHaveBeenNthCalledWith(2, 200);
    });

    it("does NOT retry on non-retryable 4xx", async () => {
        for (const status of [400, 403, 404]) {
            const c = cfg();
            const attempt = vi.fn(async (): Promise<AttemptResult> => ({status, body: "no"}));
            const r = await callWithRetry(attempt, c);
            expect(r.attempts).toBe(1);
            expect(c.sleep).not.toHaveBeenCalled();
        }
    });

    it("exhausts retries on persistent 503 — returns last response with maxAttempts", async () => {
        const c = cfg();
        const attempt = vi.fn(async (): Promise<AttemptResult> => ({status: 503, body: "overloaded"}));
        const r = await callWithRetry(attempt, c);
        expect(r).toEqual({status: 503, body: "overloaded", attempts: 3});
        expect(attempt).toHaveBeenCalledTimes(3);
        expect(c.sleep).toHaveBeenCalledTimes(2);
    });

    it("treats thrown errors as failed attempts and retries", async () => {
        const c = cfg();
        const attempt = vi
            .fn<() => Promise<AttemptResult>>()
            .mockRejectedValueOnce(new Error("network down"))
            .mockResolvedValueOnce({status: 200, body: "ok"});
        const r = await callWithRetry(attempt, c);
        expect(r.status).toBe(200);
        expect(r.attempts).toBe(2);
    });

    it("if every attempt throws, returns 503 with the last error message in body", async () => {
        const c = cfg({maxAttempts: 2});
        const attempt = vi
            .fn<() => Promise<AttemptResult>>()
            .mockRejectedValue(new Error("boom"));
        const r = await callWithRetry(attempt, c);
        expect(r.status).toBe(503);
        expect(r.attempts).toBe(2);
        expect(JSON.parse(r.body)).toEqual({error: {message: "boom"}});
    });

    it("applies jitter from random()", async () => {
        const c = cfg({random: () => 0.5});
        const attempt = vi
            .fn<() => Promise<AttemptResult>>()
            .mockResolvedValueOnce({status: 503, body: ""})
            .mockResolvedValueOnce({status: 200, body: "ok"});
        await callWithRetry(attempt, c);
        expect(c.sleep).toHaveBeenCalledWith(150);
    });

    it("calls log callback on retry and exhaustion", async () => {
        const log = vi.fn();
        const c = cfg({maxAttempts: 2});
        const attempt = vi.fn(async (): Promise<AttemptResult> => ({status: 503, body: ""}));
        await callWithRetry(attempt, c, log);
        expect(log).toHaveBeenCalledWith("warn", expect.stringContaining("attempt 1/2 got 503"));
        expect(log).toHaveBeenCalledWith("error", expect.stringContaining("EXHAUSTED 2"));
    });
});
