import { useEffect, useState } from "react";
import { Check, AlertCircle, Pencil, Trash2 } from "lucide-react";
import { fetchAqi, getOpenWeatherKey, setOpenWeatherKey } from "../lib/aqi";

type TestResult =
  | { readonly kind: "idle" }
  | { readonly kind: "running" }
  | { readonly kind: "ok"; readonly ms: number; readonly preview: string }
  | { readonly kind: "err"; readonly message: string };

type Mode = "masked" | "editing";

function maskTail(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length === 0) return "";
  if (trimmed.length <= 4) return "••••";
  return `••••••••${trimmed.slice(-4)}`;
}

export function Settings() {
  // One-shot cleanup: previous BYOK Gemini entry is now obsolete.
  useEffect(() => {
    if (localStorage.getItem("meduni-byok") !== null) {
      localStorage.removeItem("meduni-byok");
    }
  }, []);

  const [owmMode, setOwmMode] = useState<Mode>(() =>
    getOpenWeatherKey().trim().length > 0 ? "masked" : "editing",
  );
  const [owmDraft, setOwmDraft] = useState("");
  const [owmMask, setOwmMask] = useState<string>(() => maskTail(getOpenWeatherKey()));
  const [owmSaved, setOwmSaved] = useState(false);
  const [owmTest, setOwmTest] = useState<TestResult>({ kind: "idle" });

  function commitOwm(next: string) {
    const trimmed = next.trim();
    if (trimmed.length === 0) return false;
    setOpenWeatherKey(trimmed);
    setOwmMask(maskTail(trimmed));
    setOwmMode("masked");
    setOwmDraft("");
    return true;
  }

  function removeOwm() {
    setOpenWeatherKey("");
    setOwmMask("");
    setOwmDraft("");
    setOwmMode("editing");
    setOwmTest({ kind: "idle" });
  }

  async function runOwmTest() {
    if (owmMode === "editing" && owmDraft.trim().length > 0) commitOwm(owmDraft);
    setOwmTest({ kind: "running" });
    const t0 = performance.now();
    const r = await fetchAqi("1010");
    const ms = Math.round(performance.now() - t0);
    setOwmTest(
      r
        ? { kind: "ok", ms, preview: `${r.city} · AQI ${r.aqi}` }
        : { kind: "err", message: "Fetch failed — check the key, or the rate limit." },
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-ink-600 dark:text-ink-300">
          The Gemini-powered demos use a shared key held server-side — you
          don't need to configure anything to try them. The one optional key
          below is OpenWeather, used only by the Inhaler demo's AQI feed.
        </p>
      </header>

      <section className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 space-y-3">
        <h2 className="font-semibold text-ink-800 dark:text-ink-100 text-sm">
          OpenWeather (optional · used by the Inhaler demo)
        </h2>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Free tier supports browser calls. Without a key, the Inhaler demo
          falls back to a synthetic dataset.
        </p>

        {owmMode === "masked" ? (
          <div className="space-y-2">
            <span className="block text-ink-600 dark:text-ink-300 text-xs mb-0.5">
              API key
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <code
                className="font-mono text-xs px-2 py-1.5 rounded-md bg-cream-50 dark:bg-ink-950 border border-ink-200 dark:border-ink-800 text-ink-700 dark:text-ink-200 select-none"
                aria-label="Saved key, masked"
              >
                {owmMask}
              </code>
              <span className="text-[11px] text-ink-500 dark:text-ink-400">
                Saved · only the last 4 characters are shown.
              </span>
            </div>
          </div>
        ) : (
          <label className="block text-sm">
            <span className="block text-ink-600 dark:text-ink-300 text-xs mb-0.5">API key</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={owmMask ? `Replace saved key (${owmMask})` : ""}
              className="w-full rounded-md border border-ink-300 dark:border-ink-700 p-2 font-mono text-xs bg-white dark:bg-ink-950"
              value={owmDraft}
              onChange={(e) => setOwmDraft(e.target.value)}
            />
          </label>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          {owmMode === "masked" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setOwmDraft("");
                  setOwmMode("editing");
                }}
                className="inline-flex items-center gap-1.5 border border-ink-300 dark:border-ink-700 text-ink-700 dark:text-ink-200 px-4 py-2 rounded-md text-sm font-medium hover:bg-cream-50 dark:hover:bg-ink-800"
              >
                <Pencil size={12} strokeWidth={1.75} aria-hidden /> Edit
              </button>
              <button
                type="button"
                onClick={runOwmTest}
                disabled={owmTest.kind === "running"}
                className="border border-ink-300 dark:border-ink-700 text-ink-700 dark:text-ink-200 px-4 py-2 rounded-md text-sm font-medium hover:bg-cream-50 dark:hover:bg-ink-800 disabled:opacity-50"
              >
                {owmTest.kind === "running" ? "Testing…" : "Test key"}
              </button>
              <button
                type="button"
                onClick={removeOwm}
                className="inline-flex items-center gap-1.5 text-rose-700 dark:text-rose-400 px-2 py-2 rounded-md text-sm font-medium hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                <Trash2 size={12} strokeWidth={1.75} aria-hidden /> Remove
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  if (commitOwm(owmDraft)) {
                    setOwmSaved(true);
                    setTimeout(() => setOwmSaved(false), 1200);
                  }
                }}
                disabled={owmDraft.trim().length === 0}
                className="bg-teal-600 dark:bg-teal-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-teal-700 dark:hover:bg-teal-400 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={runOwmTest}
                disabled={owmTest.kind === "running" || owmDraft.trim().length === 0}
                className="border border-ink-300 dark:border-ink-700 text-ink-700 dark:text-ink-200 px-4 py-2 rounded-md text-sm font-medium hover:bg-cream-50 dark:hover:bg-ink-800 disabled:opacity-50"
              >
                {owmTest.kind === "running" ? "Testing…" : "Save & test"}
              </button>
              {owmMask.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setOwmDraft("");
                    setOwmMode("masked");
                  }}
                  className="text-ink-600 dark:text-ink-300 px-2 py-2 rounded-md text-sm font-medium hover:bg-cream-50 dark:hover:bg-ink-800"
                >
                  Cancel
                </button>
              )}
            </>
          )}
          {owmSaved && <span className="text-xs text-emerald-700">Saved</span>}
          {owmTest.kind === "ok" && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
              <Check size={12} strokeWidth={1.75} aria-hidden /> {owmTest.ms} ms · {owmTest.preview}
            </span>
          )}
          {owmTest.kind === "err" && (
            <span className="inline-flex items-center gap-1 text-xs text-rose-700 dark:text-rose-400 break-all">
              <AlertCircle size={12} strokeWidth={1.75} aria-hidden /> {owmTest.message}
            </span>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-ink-200 dark:border-ink-800 bg-cream-50 dark:bg-ink-950 p-5 text-sm text-ink-600 dark:text-ink-300">
        <h2 className="font-semibold text-ink-800 dark:text-ink-100 mb-1">Privacy note</h2>
        <p className="mb-2">
          Every patient, note, and schedule shown on this site is synthetic. No
          real PHI is stored anywhere; your own draft text stays in this
          browser (IndexedDB + localStorage) and is cleared when you clear site
          data.
        </p>
        <p>
          The Gemini demos send your prompt through our thin Bun proxy on
          Fly.io, which adds the shared API key and forwards the request to
          Google. The proxy keeps no logs of prompt content. Your IP is held
          in memory only to enforce a per-IP request cap and is discarded on
          restart. A Cloudflare Turnstile check runs once per session to keep
          bots out of the shared key; no cookies or analytics are used.
        </p>
      </section>
    </div>
  );
}
