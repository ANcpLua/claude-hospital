# Rheum Portal — agent guide

## What this is

Static SPA that rebuilds the six demos from the Anthropic *Claude Code in
Healthcare* webinar (Graham Walker, MD + Michał Nedoszytko, MD PhD,
2026-04-23). Synthetic data, no backend, no PHI, no tracking. Deployed
to Fly.io as nginx:alpine in Frankfurt.

Live: https://claude-hospital.fly.dev

## Hard constraints

- **Stack:** React 19, Vite 8, TypeScript 6 strict, Tailwind 4. No `any`,
  no `@ts-ignore`, no null-forgiving `!`.
- **Zero backend.** Static bundle served by nginx. No server-side
  rendering, no API routes, no shared state.
- **BYOK LLM only.** Google Gemini is the one supported provider (see
  `src/lib/llm.ts`). Key in `localStorage["meduni-byok"]`. Never
  proxied. Requests go browser → `generativelanguage.googleapis.com`.
- **No LLM call on mount or tab switch.** Every call originates from an
  explicit user click. Results cached per `(route, input-hash)` so a
  repeat click is a cache hit.
- **No PHI.** All datasets in `src/data/` are synthetic.
- **No tracking.** Zero analytics, zero cookies beyond the theme + BYOK
  entries in localStorage.
- **Mobile-first.** Every route must work at 375×812; A11y AA.

## Routes

| Route | Demo | Source | Timestamp |
|---|---|---|---|
| `/` | Home grid | — | — |
| `/well-baby` | Well-baby note generator | Graham | 12:13 |
| `/postpartum` | 25-note analyzer (Sarah Connor) | Graham | 15:00 |
| `/inhaler` | Dude Where's My Inhaler — 3 personas | Graham | 17:30 |
| `/previsit` | PreVisit intake conversation | Michał | 25:00 |
| `/medduties` | On-call scheduler | Michał | 28:30 |
| `/postvisit` | PostVisit patient companion | Michał | 34:00 |
| `/settings` | BYOK Gemini key | — | — |

## ReactBits components

Installed from the starter tier via shadcn CLI in
`src/components/react-bits/`. Do not modify these files — they are
registry-sourced. License key lives in `REACTBITS_LICENSE_KEY` env at
install time only. Current set: `animated-list`, `count-up`,
`custom-cursor`, `glitch-text`, `shiny-text`, `text-scatter`.

## Design tokens

- Accent: MedUni medical teal `#0891b2` on warm off-white
  `--color-cream-50`. Route-specific accents allowed (emerald for
  PostVisit, orange for Inhaler, rose for Postpartum, indigo for
  MedDuties) — use sparingly.
- Display type: Source Serif 4 italic (`.display` utility).
- Body: Inter. Mono: JetBrains Mono.
- Dark mode: class-based via `@custom-variant dark` on `<html>.dark`,
  persisted in `localStorage["meduni-theme"]`.

## Execution protocol

1. `npm run lint` (tsc --noEmit) and `npm run build` must stay green.
2. Verify any UI change at 375px before claiming done.
3. Don't add an LLM call anywhere outside a click handler.
4. Deploy: `fly deploy` from repo root. App: `claude-hospital`,
   region `fra`.

## Anti-patterns

- Hardcoded keys of any kind.
- `localStorage` for patient data (even synthetic — use IndexedDB).
- Importing a chart library for one chart (use inline SVG, see
  `components/TrendChart.tsx`).
- Comments that restate well-named code.
- Feature flags for a single-session change.
- Any provider other than Google Gemini in `src/lib/llm.ts`.
