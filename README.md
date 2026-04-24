# Claude Code, in a Hospital

Static reconstruction of the six demos from the Anthropic *Claude Code in
Healthcare* webinar (Graham Walker, MD + Michał Nedoszytko, MD PhD,
2026-04-23). React 19 + Vite 6 + TypeScript strict + Tailwind 4. No
backend, no PHI, no tracking.

**Live:** https://claude-hospital.fly.dev

## Routes

| Route | Demo |
|---|---|
| `/` | Home grid |
| `/well-baby` | Well-baby note generator (Graham, 12:13) |
| `/postpartum` | 25-note analyzer (Graham, 15:00) |
| `/inhaler` | Dude Where's My Inhaler — 3 personas (Graham, 17:30) |
| `/previsit` | PreVisit intake conversation (Michał, 25:00) |
| `/medduties` | On-call scheduler (Michał, 28:30) |
| `/postvisit` | PostVisit patient companion (Michał, 34:00) |
| `/settings` | BYOK Google Gemini key |

## Local

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # produces dist/
npm run preview    # serve dist at http://localhost:4173
npm run lint       # tsc --noEmit
```

## Deploy

```bash
fly deploy         # from repo root
```

App: `claude-hospital`, region `fra`, auto-stop, single
`shared-cpu-1x` VM with 256 MB. Expect a ~1 s cold start after idle.

## LLM

Bring your own Google Gemini key (AI Studio free tier). Paste into
`/settings`; stored only in `localStorage["meduni-byok"]`. Requests go
browser → Google directly, never proxied. No LLM call fires on mount or
tab switch; everything is click-triggered and cached per
`(route, input-hash)`.

## Structure

```
src/
  App.tsx                 routing
  routes/                 one file per demo
  lib/                    llm, speech, cache, scheduler, triage, …
  components/             shared UI
  components/react-bits/  starter-tier ReactBits (do not edit)
  data/                   synthetic datasets
docs/
  prd.md                  product scope
```

## Stack

- React 19 · TypeScript 5 strict · Vite 6
- Tailwind CSS 4 (CSS-based `@theme`, no config file)
- react-router-dom 7 with `HashRouter`
- IndexedDB for chat/scribe/guidelines; localStorage for BYOK key,
  theme, schedule wishes, and per-view caches
- ReactBits starter-tier components via shadcn registry
- Lucide icons; inline SVG charts (no chart lib)

## License

TBD. The six demos that inspired this are each owned by their original
authors (Walker → drgrahamwalker.com / MDCalc; Nedoszytko →
previsit.ai, medduties.com, postvisit.ai). This portal is clean-room
scaffolded and shares no code with them.
