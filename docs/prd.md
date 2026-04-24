# PRD — Six Demos · Claude Code in Healthcare

- **Status:** shipped
- **Author:** alex_nachtmann@yahoo.com
- **Last update:** 2026-04-24
- **Live:** https://claude-hospital.fly.dev
- **Repo:** `github.com/ANcpLua/claude-hospital` (private)

## 1. Source material

Anthropic on-demand webinar *Claude Code in Healthcare: How Physicians
Build with AI* (2026-04-23, 1 h 01 m). Hosts:

- Dr.Daisy Hollman — Claude Code team, Anthropic
- Graham Walker, MD — emergency physician, MDCalc founder
- Michał Nedoszytko, MD PhD — interventional cardiologist, PostVisit.ai

Graham framed his three as "simple examples to lower activation energy,
not polished products." Michał framed his three as existing or
hackathon-shipped systems.

## 2. Why this exists

A single-screen, interactive reconstruction of the six demos. Clean-room
React/TS, no PHI. The backend is a single-purpose Bun proxy that fronts
the shared Gemini key — no database, no auth, no user state on the
server. Reference implementation + scaffolding target; each demo is a
separable module.

No institutional affiliation. No named patients. No commercial intent.

## 3. Routes

| # | Route | Demo | Source | Webinar |
|---|---|---|---|---|
| — | `/` | Home grid | — | — |
| 1 | `/well-baby` | Well-baby note generator | Graham | 12:13 |
| 2 | `/postpartum` | 25-note analyzer (Sarah Connor) | Graham | 15:00 |
| 3 | `/inhaler` | Dude Where's My Inhaler — 3 personas | Graham | 17:30 |
| 4 | `/previsit` | Conversational pre-visit intake | Michał | 25:00 |
| 5 | `/medduties` | On-call shift scheduler | Michał | 28:30 |
| 6 | `/postvisit` | Post-visit patient companion | Michał | 34:00 |
| — | `/settings` | Optional OpenWeather BYOK (Inhaler AQI) | — | — |

## 4. Non-goals

- **No EHR integration.** FHIR read may appear as paste-in JSON
  (PostVisit) but never as a project-wide concern.
- **No compliance certification.** HIPAA / GDPR / EU AI Act conformance
  is out of scope; synthetic data only.
- **No authentication.** No accounts, no multi-tenancy.
- **No mobile-native app.** Responsive web only.
- **No analytics / tracking.** Zero third-party scripts.

## 5. Architecture

```
┌──────────────────────────────────────────────────────┐
│  React 19 · Vite 8 · TypeScript 6 strict · Tailwind 4 │
│  react-router-dom 7 · HashRouter · lucide-react      │
│  ReactBits starter (shadcn registry)                 │
├──────────────────────────────────────────────────────┤
│  Static SPA — nothing renders server-side.           │
│  Persistence: IndexedDB (chat, scribe, guidelines)   │
│                 + localStorage (OpenWeather key,     │
│                 theme, wishes, per-route caches)     │
│  LLM: browser → /api/gemini/generate (Bun proxy)     │
│        → Google Gemini; shared key held server-side. │
│        Client entry: src/lib/llm.ts (callLLM,        │
│        callLLMStream, useLlmAvailable).              │
│  Bot check: Cloudflare Turnstile token on every      │
│        proxy call (src/lib/turnstile.ts).            │
│  Speech: Web Speech API via src/lib/speech.ts        │
│  Charts: inline SVG (components/TrendChart.tsx)      │
├──────────────────────────────────────────────────────┤
│  Deploy: Fly.io · Frankfurt · oven/bun:1-slim        │
│          Bun serves dist/ and hosts the proxy.       │
│          auto-stop to zero machines when idle.       │
└──────────────────────────────────────────────────────┘
```

Every demo is a single route file in `src/routes/`, backed by:
- `src/lib/` — shared helpers (llm, speech, cache, scheduler, etc.)
- `src/data/` — synthetic datasets
- `src/components/` — shared UI, plus `react-bits/` from the starter
  registry.

**Invariants:**

1. **Deterministic numbers, LLM prose.** The LLM never fabricates a
   vital, lab, dose, or shift. Numbers come from structured input or a
   TS solver; the LLM only writes narrative.
2. **Graceful fallback.** Every demo ships a deterministic path that
   works without LLM output. If the proxy fails (rate-limit, daily
   cap, provider error, Turnstile), the UI shows an honest error —
   never a fabricated clinical answer.
3. **No LLM on mount.** Every LLM call is behind an explicit user click
   and is cached per `(route, input-hash)`.
4. **No PHI over the wire.** Speech stays on-device via Web Speech API;
   only the post-transcription text goes to Gemini via the proxy.
5. **Shared key, not BYOK for Gemini.** Gemini credentials live as Fly
   secrets and never ship in the client bundle. OpenWeather is the
   only user-supplied key, and only for the Inhaler AQI feed.

## 6. Visual flavor

- Accent: MedUni medical teal `#0891b2` (`--color-teal-600`) on warm
  off-white (`--color-cream-50`). Route-specific accents allowed and
  used: emerald (PostVisit), orange (Inhaler), rose (Postpartum),
  indigo (MedDuties).
- Display type: Source Serif 4 italic (`.display`). Body: Inter. Mono:
  JetBrains Mono.
- Dark mode: class-based `@custom-variant dark` on `<html>.dark`;
  toggle persisted in `localStorage["meduni-theme"]`.
- ReactBits used: `shiny-text`, `count-up`, `animated-list`,
  `custom-cursor`, `glitch-text`, `text-scatter`.

## 7. LLM contract

Shared server-side Gemini key, proxied through the Bun server. Clients
post to `/api/gemini/generate`; the proxy verifies a Cloudflare
Turnstile token, applies a per-IP sliding window and a global daily
cap, then forwards to Google.

- **Model pin:** `GEMINI_MODEL = "gemini-flash-latest"` in
  `server/index.ts`. This is an alias — Google rotates what it
  resolves to (today: `gemini-3-flash-preview`). Bump the constant if
  answer quality or rate limits shift unexpectedly.
- **Secrets:** `GEMINI_KEY` and `TURNSTILE_SECRET` as Fly secrets;
  never inlined into the bundle, never shipped as `VITE_*`. The
  Turnstile *site* key (`VITE_TURNSTILE_SITE_KEY`) is public and may
  ship in the client.
- **Rate limits:** per-IP 30 requests/hour sliding window; global
  `DAILY_CAP` (default 1200/day). Overrun returns
  `{error: "rate-limit" | "daily-cap"}` with HTTP 429.
- **Degraded mode:** if `GEMINI_KEY` or `TURNSTILE_SECRET` is missing
  at startup, the static site still serves and `/api/gemini/generate`
  returns HTTP 503 — no crash loop.

Client entry (`src/lib/llm.ts`) exports: `callLLM`, `callLLMStream`,
`useLlmAvailable`, plus the `Message`, `CallOpts`, and `Result` types.
There is no client-side Gemini BYOK. The legacy
`localStorage["meduni-byok"]` entry is cleaned up on Settings mount.

The one remaining user-supplied key is OpenWeather, managed at
`/settings` via `src/lib/aqi.ts` (`getOpenWeatherKey`,
`setOpenWeatherKey`). It powers only the Inhaler route's live AQI
feed; every other demo runs on shared credentials.

## 8. Deployment

- Fly.io, app `claude-hospital`, region `fra`, auto-stop enabled.
- `fly.toml` + `Dockerfile`: multi-stage `node:20-alpine` build of the
  Vite bundle → `oven/bun:1-slim` runtime running
  `bun server/index.ts`. One container serves both the static bundle
  and `/api/gemini/generate`.
- One-time: `fly secrets set GEMINI_KEY=… TURNSTILE_SECRET=…`.
- Deploy: `fly deploy` from repo root.

## 9. Definition of done

- All seven routes load; no horizontal scroll at 375 px.
- Proxy healthy: Postpartum streams two cited summaries; PreVisit chats
  through intake; MedDuties parses natural-language intents; PostVisit
  answers per-recommendation questions; Inhaler composes cohort SMS
  drafts.
- Proxy degraded (rate-limit / daily-cap / provider error / Turnstile):
  every demo surfaces a human-readable error and falls back to its
  deterministic path. No fabricated clinical content on failure.
- Inhaler AQI: without an OpenWeather key, reference sites render from
  synthetic data; with a key, live per-site AQI appears inline.
- `npm run lint` and `npm run build` zero-error.
- `fly deploy` produces a working URL within 2 minutes.
