import { useState } from "react";
import { Check, AlertCircle } from "lucide-react";
import { callLLM, getByok, notifyByokChange } from "../lib/llm";
import { fetchAqi, getOpenWeatherKey, setOpenWeatherKey } from "../lib/aqi";

const KEY = "meduni-byok";

type TestResult =
  | { readonly kind: "idle" }
  | { readonly kind: "running" }
  | { readonly kind: "ok"; readonly ms: number; readonly preview: string }
  | { readonly kind: "err"; readonly message: string };

export function Settings() {
  const [geminiKey, setGeminiKey] = useState<string>(() => getByok()?.key ?? "");
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestResult>({ kind: "idle" });
  const [owmKey, setOwmKey] = useState<string>(() => getOpenWeatherKey());
  const [owmSaved, setOwmSaved] = useState(false);
  const [owmTest, setOwmTest] = useState<TestResult>({ kind: "idle" });

  function persistGemini(next: string) {
    localStorage.setItem(KEY, JSON.stringify({ provider: "google", key: next }));
    notifyByokChange();
  }

  async function runOwmTest() {
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

  async function runTest() {
    persistGemini(geminiKey.trim());
    setTest({ kind: "running" });
    const t0 = performance.now();
    const r = await callLLM({
      system: "Reply with OK.",
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 10,
    });
    const ms = Math.round(performance.now() - t0);
    setTest(
      r.ok
        ? { kind: "ok", ms, preview: r.text.slice(0, 60) }
        : {
            kind: "err",
            message: r.reason === "no-key" ? "No key configured." : (r.error ?? r.reason),
          },
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-ink-600 dark:text-ink-300">
          Bring-your-own-key for the optional LLM features. The demo uses
          Google Gemini (free tier) — grab a key from Google AI Studio. Keys
          stay in this browser's localStorage and are sent only to Google.
        </p>
      </header>

      <section className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 space-y-4">
        <h2 className="font-semibold text-ink-800 dark:text-ink-100 text-sm">
          Google Gemini API key
        </h2>
        <label className="block text-sm">
          <span className="block text-ink-600 dark:text-ink-300 text-xs mb-0.5">
            API key
          </span>
          <input
            type="password"
            autoComplete="off"
            className="w-full rounded-md border border-ink-300 dark:border-ink-700 p-2 font-mono text-xs"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
          />
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-1">
            Model: <code>gemini-3.1-flash-lite-preview</code>. Free tier from{" "}
            <a
              className="underline"
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
            >
              aistudio.google.com
            </a>
            .
          </p>
        </label>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => {
              persistGemini(geminiKey.trim());
              setSaved(true);
              setTimeout(() => setSaved(false), 1200);
            }}
            className="bg-teal-600 dark:bg-teal-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-teal-700 dark:hover:bg-teal-400"
          >
            Save
          </button>
          <button
            type="button"
            onClick={runTest}
            disabled={test.kind === "running"}
            className="border border-ink-300 dark:border-ink-700 text-ink-700 dark:text-ink-200 px-4 py-2 rounded-md text-sm font-medium hover:bg-cream-50 dark:hover:bg-ink-800 disabled:opacity-50"
          >
            {test.kind === "running" ? "Testing…" : "Test key"}
          </button>
          {saved && <span className="text-xs text-emerald-700">Saved</span>}
          {test.kind === "ok" && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
              <Check size={12} strokeWidth={1.75} aria-hidden /> OK · {test.ms} ms{test.preview ? ` · "${test.preview.trim()}"` : ""}
            </span>
          )}
          {test.kind === "err" && (
            <span className="inline-flex items-center gap-1 text-xs text-rose-700 dark:text-rose-400 break-all">
              <AlertCircle size={12} strokeWidth={1.75} aria-hidden /> {test.message}
            </span>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 space-y-3">
        <h2 className="font-semibold text-ink-800 dark:text-ink-100 text-sm">
          OpenWeather (optional · used by the Inhaler demo)
        </h2>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Free tier supports browser calls. Without a key, the Inhaler demo
          falls back to a synthetic dataset.
        </p>
        <label className="block text-sm">
          <span className="block text-ink-600 dark:text-ink-300 text-xs mb-0.5">API key</span>
          <input
            type="password"
            autoComplete="off"
            className="w-full rounded-md border border-ink-300 dark:border-ink-700 p-2 font-mono text-xs"
            value={owmKey}
            onChange={(e) => setOwmKey(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => {
              setOpenWeatherKey(owmKey.trim());
              setOwmSaved(true);
              setTimeout(() => setOwmSaved(false), 1200);
            }}
            className="bg-teal-600 dark:bg-teal-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-teal-700 dark:hover:bg-teal-400"
          >
            Save
          </button>
          <button
            type="button"
            onClick={runOwmTest}
            disabled={owmTest.kind === "running"}
            className="border border-ink-300 dark:border-ink-700 text-ink-700 dark:text-ink-200 px-4 py-2 rounded-md text-sm font-medium hover:bg-cream-50 dark:hover:bg-ink-800 disabled:opacity-50"
          >
            {owmTest.kind === "running" ? "Testing…" : "Test key"}
          </button>
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
        <p>
          This site does not ship any analytics, telemetry, or tracking. Every
          patient shown is synthetic. No PHI is stored anywhere outside your
          own browser (IndexedDB + localStorage). Clear site data to reset.
        </p>
      </section>
    </div>
  );
}
