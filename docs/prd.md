# PRD — Six Demos · Claude Code in Healthcare

- **Status:** shipped
- **Author:** alex_nachtmann@yahoo.com
- **Last update:** 2026-04-24
- **Live:** https://claude-hospital.fly.dev
- **Repo:** `github.com/ANcpLua/claude-hospital` (private)

## 1. Source material

Anthropic on-demand webinar *Claude Code in Healthcare: How Physicians
Build with AI* (2026-04-23, 1 h 01 m). Hosts:

- Daisy Hollman — Claude Code team, Anthropic
- Graham Walker, MD — emergency physician, MDCalc founder
- Michał Nedoszytko, MD PhD — interventional cardiologist, PostVisit.ai

Graham framed his three as "simple examples to lower activation energy,
not polished products." Michał framed his three as existing or
hackathon-shipped systems.

## 2. Why this exists

A single-screen, interactive reconstruction of the six demos. Clean-room
React/TS, no PHI, no backend. Reference implementation + scaffolding
target — each demo is a separable module.

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
| — | `/settings` | BYOK Google Gemini key | — | — |

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
│  React 19 · Vite 6 · TypeScript strict · Tailwind 4  │
│  react-router-dom 7 · HashRouter · lucide-react      │
│  ReactBits starter (shadcn registry)                 │
├──────────────────────────────────────────────────────┤
│  Static SPA — nothing renders server-side.           │
│  Persistence: IndexedDB (chat, scribe, guidelines)   │
│                 + localStorage (BYOK key, theme,     │
│                 wishes, caches)                      │
│  LLM: BYOK client → Google Gemini                    │
│        via src/lib/llm.ts                            │
│  Speech: Web Speech API via src/lib/speech.ts        │
│  Charts: inline SVG (components/TrendChart.tsx)      │
├──────────────────────────────────────────────────────┤
│  Deploy: Fly.io · Frankfurt · nginx:alpine           │
│          auto-stop to zero machines when idle        │
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
2. **Graceful fallback.** Every demo works without a key. A key
   unlocks richer output, never gates the walkthrough.
3. **No LLM on mount.** Every LLM call is behind an explicit user click
   and is cached per `(route, input-hash)`.
4. **No PHI over the wire.** Speech stays on-device via Web Speech API;
   only the post-transcription text goes to Gemini.

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

## 7. BYOK LLM contract

`localStorage["meduni-byok"] = JSON.stringify({provider: "google", key})`

- Google Gemini only — the one provider with a free tier that a BYOK
  demo can depend on.
- Model constant: `GOOGLE_MODEL = "gemini-3.1-flash-lite-preview"` in
  `src/lib/llm.ts`. If Google rotates the preview tag, bump the
  constant to whichever flash-tier ID is current on AI Studio.
- Key stays client-side. Never proxied. Requests go browser →
  `generativelanguage.googleapis.com` directly.

Exports: `callLLM`, `callLLMStream`, `useLlmAvailable`, `getByok`,
`notifyByokChange`.

## 8. Deployment

- Fly.io, app `claude-hospital`, region `fra`, auto-stop enabled.
- `fly.toml` + `Dockerfile` (multi-stage node build → nginx:alpine).
- `fly deploy` from repo root.

## 9. Definition of done

- All seven routes load; no horizontal scroll at 375 px.
- Without a key: every demo shows deterministic output and a "Configure
  in Settings" nudge.
- With a key: Postpartum streams two cited summaries; PreVisit chats
  through intake; MedDuties parses natural-language intents; PostVisit
  answers per-recommendation questions; Inhaler composes cohort SMS
  drafts.
- `npm run lint` and `npm run build` zero-error.
- `fly deploy` produces a working URL within 2 minutes.
