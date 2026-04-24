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

- **Client** — static Vite bundle in `dist/`, served by Bun.
- **Proxy** — `server/index.ts` (Bun): origin allowlist → per-IP sliding
  window (30/hr) → global daily cap (`DAILY_CAP`, default 1200) →
  Cloudflare Turnstile verify → forward to Gemini with `GEMINI_KEY`.
- **Secrets** — `GEMINI_KEY` and `TURNSTILE_SECRET` live as Fly secrets
  (`fly secrets set …`); never inlined into the client bundle.
- **Public site key** — `VITE_TURNSTILE_SITE_KEY` in `.env.production`
  and `fly.toml` `[build.args]`; safe to commit.

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
/Users/ancplua/framework/claude-hospital/.env. Current set: `animated-list`, `count-up`,
`custom-cursor`, `glitch-text`, `shiny-text`, `text-scatter`.

## Execution protocol

1. `npm run lint` (tsc --noEmit) and `npm run build` must stay green.
2. Verify any UI change at 375px before claiming done.
3. Don't add an LLM call anywhere outside a click handler.
4. Local dev: run `bun server/index.ts` (with `GEMINI_KEY` +
   `TURNSTILE_SECRET` in the local env) in one terminal and
   `npm run dev` in another; Vite proxies `/api/*` to `:8080`.
5. Deploy: `fly secrets set GEMINI_KEY=… TURNSTILE_SECRET=…` (one-time),
   then `fly deploy` from repo root. App: `claude-hospital`, region
   `fra`.

## Anti-patterns

- Hardcoded keys of any kind.
- `localStorage` for patient data (even synthetic — use IndexedDB).
- Importing a chart library for one chart (use inline SVG, see
  `components/TrendChart.tsx`).
- Comments that restate well-named code.
- Feature flags for a single-session change.
