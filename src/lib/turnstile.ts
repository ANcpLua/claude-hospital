// Cloudflare Turnstile — on-demand token vendor.
//
// Usage:
//   1. `mountTurnstile(containerEl)` once at app bootstrap.
//   2. `await getTurnstileToken()` before any protected fetch.
//
// Managed mode renders a ~65px badge into the container. Tokens are
// single-use; after handing one out we reset the widget so the next
// token is already being generated in the background.

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: (err: string) => void;
      "expired-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
      appearance?: "always" | "execute" | "interaction-only";
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

let scriptPromise: Promise<void> | null = null;
let widgetId: string | null = null;
let mountEl: HTMLElement | null = null;
let currentToken: string | null = null;
let pending: Array<{ resolve: (t: string) => void; reject: (e: Error) => void }> = [];

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
  currentToken = token;
  const waiters = pending;
  pending = [];
  for (const w of waiters) w.resolve(token);
}

function fail(err: Error): void {
  const waiters = pending;
  pending = [];
  for (const w of waiters) w.reject(err);
}

function ensureWidget(): void {
  if (widgetId !== null || !window.turnstile || !mountEl || !SITE_KEY) return;
  widgetId = window.turnstile.render(mountEl, {
    sitekey: SITE_KEY,
    theme: "auto",
    appearance: "always",
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
    pending.push({
      resolve: (token) => {
        currentToken = null;
        if (widgetId !== null) window.turnstile?.reset(widgetId);
        resolve(token);
      },
      reject,
    });
  });
}
