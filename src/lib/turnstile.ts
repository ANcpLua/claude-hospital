// Cloudflare Turnstile — on-demand token vendor for the Bun proxy.
//
//   1. `mountTurnstile(containerEl)` once at app bootstrap.
//   2. `await getTurnstileToken()` before any protected fetch.
//
// Tokens are single-use. Widget runs invisibly (Managed risk check); real
// challenges still surface when Cloudflare needs them.

interface TurnstileApi {
    render: (
        el: HTMLElement,
        opts: {
            sitekey: string;
            callback: (token: string) => void;
            "error-callback"?: (err: string) => void;
            "expired-callback"?: () => void;
            theme?: "light" | "dark" | "auto";
            size?: "normal" | "flexible" | "compact" | "invisible";
        },
    ) => string;
    reset: (widgetId: string) => void;
    remove: (widgetId: string) => void;
    execute: (widgetId: string) => void;
}

declare global {
    interface Window {
        turnstile?: TurnstileApi;
    }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TOKEN_TIMEOUT_MS = 15_000;

interface Waiter {
    resolve: (t: string) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

let scriptPromise: Promise<void> | null = null;
let widgetId: string | null = null;
let mountEl: HTMLElement | null = null;
let currentToken: string | null = null;
let pending: Waiter[] = [];

function loadScript(): Promise<void> {
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
        if (window.turnstile) {
            resolve();
            return;
        }
        const s = document.createElement("script");
        s.src = SCRIPT_URL;
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("turnstile-script-failed"));
        document.head.appendChild(s);
    });
    return scriptPromise;
}

function deliver(token: string): void {
    const waiter = pending.shift();
    if (!waiter) {
        currentToken = token;
        return;
    }
    clearTimeout(waiter.timer);
    waiter.resolve(token);
    // Still queued callers — kick the widget for the next token.
    if (pending.length > 0 && widgetId !== null) window.turnstile?.reset(widgetId);
}

function fail(err: Error): void {
    const waiters = pending;
    pending = [];
    for (const w of waiters) {
        clearTimeout(w.timer);
        w.reject(err);
    }
}

function ensureWidget(): void {
    if (widgetId !== null || !window.turnstile || !mountEl || !SITE_KEY) return;
    widgetId = window.turnstile.render(mountEl, {
        sitekey: SITE_KEY,
        theme: "auto",
        size: "invisible",
        callback: (token) => deliver(token),
        "error-callback": (err) => fail(new Error(`turnstile: ${err}`)),
        "expired-callback": () => {
            currentToken = null;
        },
    });
}

export function mountTurnstile(container: HTMLElement): void {
    if (mountEl === container) return;
    mountEl = container;
    loadScript()
        .then(() => ensureWidget())
        .catch(() => {
            /* surfaces on next getTurnstileToken() */
        });
}

export async function getTurnstileToken(): Promise<string> {
    if (!SITE_KEY) throw new Error("VITE_TURNSTILE_SITE_KEY not set");
    await loadScript();
    if (!mountEl) throw new Error("turnstile-not-mounted");
    ensureWidget();

    if (currentToken) {
        const t = currentToken;
        currentToken = null;
        if (widgetId !== null) window.turnstile?.reset(widgetId);
        return t;
    }

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending = pending.filter((w) => w.timer !== timer);
            reject(new Error("turnstile-timeout"));
        }, TOKEN_TIMEOUT_MS);
        pending.push({ resolve, reject, timer });
    });
}
