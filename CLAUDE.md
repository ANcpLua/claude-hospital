# Rheum Portal — agent guide

## What this is

SPA that rebuilds the six demos from the Anthropic *Claude Code in
Healthcare* webinar (Graham Walker, MD + Michał Nedoszytko, MD PhD,
2026-04-23). Synthetic data, no PHI, no tracking. Deployed to Fly.io
as a Bun image in Frankfurt — Bun (`server/index.ts`) serves the Vite
bundle out of `./dist` and fronts a thin proxy at `/api/gemini/generate`
that holds the shared Gemini key server-side.

Live: https://claude-hospital.fly.dev

## Architecture

- **Client** — static Vite bundle in `dist/`, served by Bun. Singleton
  Turnstile widget mounted once in `src/main.tsx` (off-screen, invisible)
  so route changes never re-spawn it.
- **Proxy** — `server/index.ts` (Bun): origin allowlist → owner-IP fast
  path OR (per-IP sliding window → Turnstile siteverify) → global daily
  cap → retried fetch to Gemini. Single pinned model (`GEMINI_MODEL`),
  no silent fallback. On `429`/`5xx` from Gemini we retry `RETRY_MAX`
  times with exponential backoff + jitter, then return a structured
  `503` with `{error:"upstream-overloaded", attempts, model, detail}`
  so the client can surface a clear message.
- **Secrets** — `GEMINI_KEY` and `TURNSTILE_SECRET` live as Fly secrets
  in prod and `.env` (gitignored) locally. Never inlined into the bundle.
- **Public site key** — `VITE_TURNSTILE_SITE_KEY` in `.env.production`,
  `.env`, and `fly.toml` `[build.args]`; safe to commit.

## Env vars (all optional unless flagged)

| Var                    | Default                     | Purpose                                          |
|------------------------|-----------------------------|--------------------------------------------------|
| `GEMINI_KEY`           | —                           | **Required.** Server-side Google AI Studio key.  |
| `TURNSTILE_SECRET`     | —                           | **Required.** Cloudflare Turnstile secret.       |
| `GEMINI_MODEL`         | `gemini-3-flash-preview`    | Pinned. Override in `fly.toml`/`.env`.           |
| `OWNER_IPS`            | (empty)                     | Comma list — IPs skipping per-IP cap + Turnstile.|
| `IP_LIMIT`             | `200`                       | Per-IP requests per window.                      |
| `IP_WINDOW_MINUTES`    | `60`                        | Sliding window length.                           |
| `DAILY_CAP`            | `1200`                      | Global daily ceiling (UTC).                      |
| `RETRY_MAX`            | `3`                         | Gemini retry attempts on 429/5xx.                |
| `RETRY_BASE_MS`        | `400`                       | Exponential backoff base (+ jitter).             |
| `GEMINI_TIMEOUT_MS`    | `20000`                     | Per-attempt Gemini timeout.                      |
| `TURNSTILE_TIMEOUT_MS` | `10000`                     | Turnstile siteverify timeout.                    |
| `ALLOWED_ORIGINS`      | localhost + fly.dev         | CORS allowlist.                                  |

## Hard constraints

- **Stack:** React 19, Vite 8, TypeScript 6 strict, Tailwind 4, Bun 1
  runtime. No `any`, no `@ts-ignore`, no null-forgiving `!`.
- **Shared Gemini key via proxy.** The key must stay server-side — never
  inline it into the bundle or ship it as a `VITE_*` var. New LLM calls
  go through `callLLM` / `callLLMStream` in `src/lib/llm.ts`.
- **No LLM call on mount or tab switch.** Every call originates from an
  explicit user click. Results cached per `(route, input-hash)` so a
  repeat click is a cache hit.
- **No PHI.** All datasets in `src/data` are synthetic.
- **Mobile-first.** Every route must work at 375×812; A11y AA.

## Routes

| Route         | Demo                                 | Source | Timestamp |
|---------------|--------------------------------------|--------|-----------|
| `/`           | Home grid                            | —      | —         |
| `/well-baby`  | Well-baby note generator             | Graham | 12:13     |
| `/postpartum` | 25-note analyzer (Sarah Connor)      | Graham | 15:00     |
| `/inhaler`    | Dude Where's My Inhaler — 3 personas | Graham | 17:30     |
| `/previsit`   | PreVisit intake conversation         | Michał | 25:00     |
| `/medduties`  | On-call scheduler                    | Michał | 28:30     |
| `/postvisit`  | PostVisit patient companion          | Michał | 34:00     |
| `/settings`   | OpenWeather BYOK (optional)          | —      | —         |

## ReactBits components

Installed from the starter tier via shadcn CLI in
`src/components/react-bits/`. Do not modify these files — they are
registry-sourced. License key lives in `REACTBITS_LICENSE_KEY` env at
/Users/ancplua/framework/claude-hospital/.env. Current set: `animated-list`, `count-up`, `custom-cursor`,
`glitch-text`, `glitter-warp`, `shiny-text`, `text-scatter`.

## Execution protocol

1. `npm run lint` (tsc --noEmit) and `npm run build` must stay green.
2. Verify any UI change at 375px before claiming done. Use Playwright
   for the loop and screenshot the working flow.
3. Don't add an LLM call anywhere outside a click handler.
4. Local dev (option A): copy `.env.example` → `.env` and fill keys,
   then in two terminals `bun server/index.ts` and `npm run dev`. Vite
   proxies `/api/*` to `:8080`.
5. Local dev (option B, prod-like): `docker compose up --build` reads
   `.env` and serves the built bundle on `:8080` exactly like Fly does.
6. Deploy: `fly secrets set GEMINI_KEY=… TURNSTILE_SECRET=…` (one-time;
   rotate by re-running), then `fly deploy` from repo root. App:
   `claude-hospital`, region `fra`. Health endpoint: `/api/health`
   returns `{ok, model, proxyReady, ownerIps}`.

## Anti-patterns

- Hardcoded keys of any kind.
- `localStorage` for patient data (even synthetic — use IndexedDB).
- Importing a chart library for one chart (use inline SVG, see
  `components/TrendChart.tsx`).
- Comments that restate well-named code.
- Feature flags for a single-session change.
