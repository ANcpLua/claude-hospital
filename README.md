# Claude Code, in a Hospital

Static reconstruction of the six demos from the Anthropic *Claude Code in
Healthcare* webinar (Graham Walker, MD + Michał Nedoszytko, MD PhD,
2026-04-23). React 19 · Vite 8 · TypeScript 6 strict · Tailwind 4 · Bun
proxy on Fly.io.

- **Live:** https://claude-hospital.fly.dev
- **Source webinar:** https://anthropic.ondemand.goldcast.io/on-demand/ee5e1e18-1ace-4c7f-a20f-c4a69bb7247f
- **Spec:** [`docs/prd.md`](docs/prd.md)

## Routes

| Route         | Demo                                  | Source · timestamp |
|---------------|---------------------------------------|--------------------|
| `/`           | Home grid                             | —                  |
| `/well-baby`  | Well-baby note generator              | Walker · 12:13     |
| `/postpartum` | 25-note analyzer (Sarah Connor)       | Walker · 15:00     |
| `/inhaler`    | Dude, Where's My Inhaler — 3 personas | Walker · 17:30     |
| `/previsit`   | PreVisit intake conversation          | Nedoszytko · 25:00 |
| `/medduties`  | On-call shift scheduler               | Nedoszytko · 28:30 |
| `/postvisit`  | PostVisit patient companion           | Nedoszytko · 34:00 |
| `/settings`   | OpenWeather BYOK (Inhaler AQI only)   | —                  |

## Local

```bash
npm install
npm run dev          # Vite on :5173, proxies /api/* to Bun on :8080
bun server/index.ts  # in another shell
npm run build
npm run lint         # tsc --noEmit
```

For full LLM behavior set `GEMINI_KEY` and `TURNSTILE_SECRET` in `.env`.
Without them the proxy returns 503 and every route falls back to its
deterministic path.

## Deploy

```bash
fly secrets set GEMINI_KEY=… TURNSTILE_SECRET=…   # one-time
fly deploy                                         # from repo root
```

App `claude-hospital`, region `fra`, auto-stop, single `shared-cpu-1x`
VM with 256 MB. ~1 s cold start after idle.

## Architecture

One Bun container serves the static `dist/` and a `/api/gemini/generate`
proxy. The browser posts a Cloudflare Turnstile token + the prompt; the
proxy verifies the token, applies a per-IP sliding window + global daily
cap, and forwards to Google. Shared `GEMINI_KEY` lives only as a Fly
secret. The single user-supplied key is OpenWeather (Inhaler AQI), kept
in `localStorage`.

Per-route caching by `(route, input-hash)` means a repeat click is a
cache hit, never a re-call. No LLM call fires on mount or tab switch.

## License

MIT — see [`LICENSE`](LICENSE).
