# PRD — Six Demos · Claude Code in Healthcare

- **Status:** shipped (mostly; see §10 for the bits I'd redo)
- **Author:** alex_nachtmann@yahoo.com
- **Last touched:** 2026-04-27
- **Live:** https://claude-hospital.fly.dev
- **Repo:** `github.com/ANcpLua/claude-hospital` (private)

## 1. Source material

Anthropic on-demand webinar *Claude Code in Healthcare: How Physicians
Build with AI* (2026-04-23, 1 h 01 m). Hosts:

- Dr. Daisy Hollman — Claude Code team, Anthropic
- Graham Walker, MD (emergency physician, MDCalc founder)
- Michał Nedoszytko, MD PhD (interventional cardiologist, PostVisit.ai)

Graham framed his three as "simple examples to lower activation energy,
not polished products." Michał's three are existing or hackathon-shipped
systems.

## 2. Why this exists

A single-screen, interactive reconstruction of the six demos. Clean-room
React/TS, no PHI. The backend is a single-purpose Bun proxy that fronts
the shared Gemini key. No database, no auth, no user state on the
server. Each demo is a separable module so the repo doubles as
scaffolding for the next one.

No institutional affiliation. No named patients. Nothing commercial.

## 3. Routes

| # | Route         | Demo                                    | Source | Webinar |
|---|---------------|-----------------------------------------|--------|---------|
| — | `/`           | Home grid                               | —      | —       |
| 1 | `/well-baby`  | Well-baby note generator                | Graham | 12:13   |
| 2 | `/postpartum` | 25-note analyzer (Sarah Connor)         | Graham | 15:00   |
| 3 | `/inhaler`    | Dude Where's My Inhaler (3 personas)    | Graham | 17:30   |
| 4 | `/previsit`   | Conversational pre-visit intake         | Michał | 25:00   |
| 5 | `/medduties`  | On-call shift scheduler                 | Michał | 28:30   |
| 6 | `/postvisit`  | Post-visit patient companion            | Michał | 34:00   |
| — | `/settings`   | Optional OpenWeather BYOK (Inhaler AQI) | —      | —       |

## 4. Non-goals

- **No EHR integration.** FHIR read shows up as paste-in JSON in
  PostVisit; that's the whole story.
- **No compliance certification.** HIPAA, GDPR, EU AI Act — none of it.
  Synthetic data only.
- No authentication. No accounts, no multi-tenancy.
- No mobile-native app; responsive web only.
- Zero analytics, zero third-party scripts.

## 5. Architecture

```
┌──────────────────────────────────────────────────────┐
│  React 19 · Vite 8 · TypeScript 6 strict · Tailwind 4 │
│  react-router-dom 7 · HashRouter · lucide-react      │
│  ReactBits starter (shadcn registry)                 │
├──────────────────────────────────────────────────────┤
│  Static SPA. Nothing renders server-side.            │
│  Persistence: IndexedDB (chat, scribe, guidelines)   │
│                 + localStorage (OpenWeather key,     │
│                 theme, wishes, per-route caches)     │
│  LLM: browser → /api/gemini/generate (Bun proxy)     │
│        → Google Gemini; shared key held server-side. │
│        Client entry: src/lib/llm.ts (callLLM,        │
│        callLLMStream, useLlmAvailable).              │
│  Bot check: dropped after the first week (see §10);  │
│        rate-limit + daily-cap carry the load now.    │
│  Speech: Web Speech API via src/lib/speech.ts        │
│  Charts: inline SVG (components/TrendChart.tsx)      │
├──────────────────────────────────────────────────────┤
│  Deploy: Fly.io · Frankfurt · oven/bun:1-slim        │
│          Bun serves dist/ and hosts the proxy.       │
│          auto-stop to zero machines when idle.       │
└──────────────────────────────────────────────────────┘
```

Every demo is a single route file in `src/routes/`, backed by:

- `src/lib/` for shared helpers (llm, speech, cache, scheduler, …)
- `src/data/` for the synthetic datasets
- `src/components/` for shared UI, plus `react-bits/` from the starter
  registry. Don't edit anything inside `react-bits/`.

**Invariants:**

1. **The LLM writes prose, the code owns the numbers.** Vitals, labs,
   doses, shifts come from structured input or a TS solver. The LLM
   only fills in the narrative around them.
2. **Graceful fallback.** Every demo ships a deterministic path that
   works without LLM output. If the proxy fails (rate-limit, daily
   cap, provider error), the UI surfaces a real error message instead
   of inventing a clinical answer.
3. **No LLM on mount.** Every call is behind an explicit user click,
   cached per `(route, input-hash)`.
4. **No PHI over the wire.** Speech stays on-device via Web Speech API.
   Only the post-transcription text goes to Gemini via the proxy.
5. **Shared Gemini key.** It lives as a Fly secret and never ships in
   the bundle. OpenWeather is the one user-supplied key, and only the
   Inhaler route uses it.

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
post to `/api/gemini/generate`. The proxy applies a per-IP sliding
window plus a global daily cap, then forwards to Google.

- **Model pin:** `GEMINI_MODEL = "gemini-3-flash-preview"` in
  `server/index.ts`. Bump the constant if answer quality or rate limits
  shift. We pin a specific preview rather than `*-latest` because the
  free-tier quota for `gemini-3-flash-preview` is much tighter than the
  alias suggests; surprised me once, see Gotchas in `CLAUDE.md`.
- **Secrets:** `GEMINI_KEY` as a Fly secret, never inlined.
- **Rate limits:** per-IP `IP_LIMIT` (default 200) per `IP_WINDOW_MINUTES`
  (default 60). Global `DAILY_CAP` (default 1200/day). Overrun returns
  `{error: "rate-limit" | "daily-cap"}` with HTTP 429.
- **Degraded mode:** if `GEMINI_KEY` is missing at startup, the static
  site still serves and `/api/gemini/generate` returns HTTP 503. No
  crash loop, just a 503.

Client entry: `src/lib/llm.ts` exports `callLLM`, `callLLMStream`, plus
the `Message`, `CallOpts`, and `Result` types. There is no client-side
Gemini BYOK. The legacy `localStorage["meduni-byok"]` entry is cleaned
up on Settings mount (kept for users who saved a key during the brief
week BYOK was supported).

OpenWeather is the one remaining user-supplied key, managed at
`/settings` via `src/lib/aqi.ts`. Inhaler uses it; nothing else does.

## 8. Deployment

- Fly.io, app `claude-hospital`, region `fra`, auto-stop enabled.
- `fly.toml` + `Dockerfile`: multi-stage `node:20-alpine` build of the
  Vite bundle → `oven/bun:1-slim` runtime running
  `bun server/index.ts`. One container, both jobs.
- One-time: `fly secrets set GEMINI_KEY=…`.
- Deploy: `fly deploy` from repo root.

## 9. Definition of done

- All seven routes load. No horizontal scroll at 375 px.
- Proxy healthy: Postpartum streams two cited summaries, PreVisit chats
  through intake, MedDuties parses natural-language intents, PostVisit
  answers per-recommendation questions, Inhaler composes cohort SMS
  drafts.
- Proxy degraded (rate-limit, daily-cap, provider error): every demo
  surfaces a human-readable error and falls back to its deterministic
  path. Never a fabricated clinical answer on failure.
- Inhaler AQI: without an OpenWeather key, reference sites render from
  synthetic data. With a key, live per-site AQI appears inline.
- `npm run lint` and `npm run build` zero-error.
- `fly deploy` produces a working URL within ~2 minutes.

## 10. What I'd change if I had another weekend

- **Postpartum streaming.** Currently we accumulate into one buffer
  and re-render on every chunk. It works, but the source-citation
  parser runs only on the final string, so chips pop in at the end
  rather than as they're written. Streaming-aware parser would be
  nicer.
- **PreVisit fallback transcript.** The hard-coded fallback script
  (FALLBACK_SCRIPT in `PreVisit.tsx`) is sturdy but mechanical. A real
  fallback would replay the last successful session for that patient.
- **MedDuties solver.** Greedy with a swap-based balancer. Fine at
  N=4 docs, would be embarrassing at N=20. A proper ILP or constraint
  solver belongs here, but solo-dev YAGNI.
- **Mobile QA.** Verified at 375×812 in DevTools. Real device testing
  is sparse and I know it.

## 11. Stuff that bit me

Turnstile got pulled after a week. The widget choked on Safari ITP at
launch and kept the proxy alive on Chrome only, which is the opposite
of what bot-protection should do. Rate-limit + daily-cap was good
enough on its own and the bots haven't found the demo anyway.

Gemini 3's thinking-budget defaults to "on" and silently eats output
tokens. For clinical templates this means the response runs out before
the visible text starts. Disabled in `server/index.ts` via
`thinkingConfig: {thinkingBudget: 0}`. Cost me an afternoon.

R3F's `<Canvas>` inlines `position: relative` on its host div, which
breaks `BlackHole`'s own `children` slot. The PreVisit header overlays
its title as a sibling of `<Suspense>`, not as a `<Canvas>` child.

## 12. TODO (probably never)

- Print stylesheet for the PostVisit summary. The `.print-a4` class
  exists in `index.css` but only one component uses it.
- Per-demo "open in webinar at this timestamp" deep-link.
- A second OpenWeather provider as fallback.
