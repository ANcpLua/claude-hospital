import { useEffect, useMemo, useState } from "react";
import { Activity, Baby, Copy, Download, HeartPulse, Sparkles, Weight } from "lucide-react";
import {
  PROFILE_LABELS,
  SCREENINGS,
  type Profile,
} from "../lib/screening";
import { callLLM, useLlmAvailable } from "../lib/llm";
import { Link } from "react-router-dom";
import { DashboardHeader } from "../components/DashboardHeader";

interface Baby {
  readonly babyFirstName: string;
  readonly motherAgeYears: number;
  readonly gestationalWeeks: number;
  readonly delivery: "vaginal" | "c-section";
  readonly apgar1: number;
  readonly apgar5: number;
  readonly birthWeightG: number;
  readonly temperatureC: number;
  readonly hrBpm: number;
  readonly rrBpm: number;
  readonly spo2: number;
  readonly feeding: "breast" | "formula" | "mixed";
  readonly profile: Profile;
}

const DEFAULTS: Baby = {
  babyFirstName: "",
  motherAgeYears: 29,
  gestationalWeeks: 39,
  delivery: "vaginal",
  apgar1: 8,
  apgar5: 9,
  birthWeightG: 3320,
  temperatureC: 36.8,
  hrBpm: 142,
  rrBpm: 44,
  spo2: 98,
  feeding: "breast",
  profile: "california",
};

const NARRATIVE_SYSTEM = `You are a neonatology assistant drafting the Assessment and Plan sections of a well-baby nursery note. You will receive the structured inputs as JSON. Output exactly two paragraphs labelled "Assessment:" and "Plan:" with no other headings or lists. Never invent numbers that aren't in the input. If any input is abnormal, name it explicitly and briefly say why. Max 120 words total.`;

interface NarrativeSections {
  readonly assessment: string;
  readonly plan: string;
}

function parseNarrative(raw: string): NarrativeSections | null {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const re = /Assessment\s*:?\s*([\s\S]*?)\n\s*Plan\s*:?\s*([\s\S]*)$/i;
  const m = text.match(re);
  if (!m) return null;
  return { assessment: m[1].trim(), plan: m[2].trim() };
}

type NarrativeState =
  | { readonly status: "default" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly sections: NarrativeSections }
  | { readonly status: "error"; readonly message: string };

const NARRATIVE_CACHE_KEY = "meduni-wellbaby-narrative-v1";

function hashInput(b: Baby): string {
  return [
    b.gestationalWeeks,
    b.delivery,
    b.apgar1,
    b.apgar5,
    b.birthWeightG,
    b.temperatureC,
    b.hrBpm,
    b.rrBpm,
    b.spo2,
    b.feeding,
    b.profile,
    b.motherAgeYears,
  ].join("|");
}

function loadNarrativeCache(): Record<string, NarrativeSections> {
  try {
    const raw = localStorage.getItem(NARRATIVE_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, NarrativeSections>;
  } catch {
    return {};
  }
}

function saveNarrativeCache(c: Record<string, NarrativeSections>): void {
  try {
    localStorage.setItem(NARRATIVE_CACHE_KEY, JSON.stringify(c));
  } catch {
    /* empty */
  }
}

export function WellBaby() {
  const [b, setB] = useState<Baby>(DEFAULTS);
  const [narrative, setNarrative] = useState<NarrativeState>({ status: "default" });
  const [cache, setCache] = useState<Record<string, NarrativeSections>>(loadNarrativeCache);
  const llmReady = useLlmAvailable();

  const note = useMemo(() => generateNote(b, narrative), [b, narrative]);
  const outOfRange = b.gestationalWeeks < 32 || b.gestationalWeeks > 42;

  useEffect(() => {
    const hit = cache[hashInput(b)];
    if (hit) {
      setNarrative({ status: "ready", sections: hit });
    } else {
      setNarrative((cur) =>
        cur.status === "loading" ? cur : { status: "default" },
      );
    }
  }, [b, cache]);

  async function generateNarrative() {
    const key = hashInput(b);
    const hit = cache[key];
    if (hit) {
      setNarrative({ status: "ready", sections: hit });
      return;
    }
    setNarrative({ status: "loading" });
    const { gestationalWeeks, delivery, apgar1, apgar5, birthWeightG, temperatureC, hrBpm, rrBpm, spo2, feeding, profile, motherAgeYears } = b;
    const r = await callLLM({
      system: NARRATIVE_SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify(
            { gestationalWeeks, delivery, apgar1, apgar5, birthWeightG, temperatureC, hrBpm, rrBpm, spo2, feeding, screeningProfile: profile, motherAgeYears },
            null,
            2,
          ),
        },
      ],
      maxTokens: 240,
      temperature: 0.2,
    });
    if (!r.ok) {
      setNarrative({ status: "error", message: r.error ?? r.reason });
      return;
    }
    const parsed = parseNarrative(r.text);
    if (!parsed) {
      setNarrative({
        status: "error",
        message: "LLM output didn't include Assessment / Plan headings.",
      });
      return;
    }
    const next = { ...cache, [key]: parsed };
    setCache(next);
    saveNarrativeCache(next);
    setNarrative({ status: "ready", sections: parsed });
  }

  function copyNote() {
    void navigator.clipboard.writeText(note);
  }

  function downloadNote() {
    const safe = (b.babyFirstName || "well-baby-note").replace(/[^a-zA-Z0-9_-]/g, "-");
    const today = new Date().toISOString().slice(0, 10);
    const fname = `${safe.toLowerCase()}-${today}.txt`;
    const blob = new Blob([note], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <DashboardHeader
        kicker="Nursery · deterministic template"
        title="Well-baby note generator"
        blurb="Pediatrics intake to nursery note. Numbers stay deterministic; the Assessment and Plan paragraphs can be drafted by an LLM if you have configured a key."
        metrics={[
          { label: "GA", value: b.gestationalWeeks, suffix: " wk", icon: Baby, tone: "teal" },
          { label: "APGAR 5", value: b.apgar5, suffix: "/10", icon: HeartPulse },
          { label: "Weight", value: b.birthWeightG / 1000, decimals: 2, suffix: " kg", icon: Weight },
          { label: "SpO₂", value: b.spo2, suffix: "%", icon: Activity, tone: b.spo2 < 95 ? "rose" : "emerald", shiny: b.spo2 >= 95 },
        ]}
      />

      {outOfRange && (
        <div
          role="alert"
          className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900"
        >
          Outside term range ({b.gestationalWeeks} weeks) — confirm with neonatology before using this template.
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <form className="space-y-4 rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5">
          <Row label="Baby's first name (optional, used in filename)" htmlFor="baby-name">
            <input
              id="baby-name"
              type="text"
              value={b.babyFirstName}
              onChange={(e) => setB({ ...b, babyFirstName: e.target.value })}
              className="w-full rounded-md border border-ink-300 dark:border-ink-700 p-2 text-sm"
            />
          </Row>
          <Row label="Gestational age (weeks)" htmlFor="ga">
            <NumInput
              id="ga"
              value={b.gestationalWeeks}
              onChange={(v) => setB({ ...b, gestationalWeeks: v })}
              min={22}
              max={44}
            />
          </Row>
          <Row label="Delivery" htmlFor="delivery">
            <Select
              id="delivery"
              value={b.delivery}
              onChange={(v) => setB({ ...b, delivery: v as Baby["delivery"] })}
              options={[
                { v: "vaginal", l: "Vaginal" },
                { v: "c-section", l: "C-section" },
              ]}
            />
          </Row>
          <Row label="APGAR 1 min / 5 min">
            <div className="flex gap-2">
              <NumInput
                id="apgar1"
                aria-label="APGAR 1 minute"
                value={b.apgar1}
                onChange={(v) => setB({ ...b, apgar1: v })}
                min={0}
                max={10}
              />
              <NumInput
                id="apgar5"
                aria-label="APGAR 5 minute"
                value={b.apgar5}
                onChange={(v) => setB({ ...b, apgar5: v })}
                min={0}
                max={10}
              />
            </div>
          </Row>
          <Row label="Birth weight (g)" htmlFor="bw">
            <NumInput
              id="bw"
              value={b.birthWeightG}
              onChange={(v) => setB({ ...b, birthWeightG: v })}
              min={400}
              max={6000}
              step={10}
            />
          </Row>
          <Row label="Temp (°C) / HR / RR / SpO₂">
            <div className="grid grid-cols-4 gap-2">
              <NumInput
                id="temp"
                aria-label="Temperature Celsius"
                value={b.temperatureC}
                onChange={(v) => setB({ ...b, temperatureC: v })}
                min={32}
                max={42}
                step={0.1}
              />
              <NumInput
                id="hr"
                aria-label="Heart rate"
                value={b.hrBpm}
                onChange={(v) => setB({ ...b, hrBpm: v })}
                min={60}
                max={220}
              />
              <NumInput
                id="rr"
                aria-label="Respiratory rate"
                value={b.rrBpm}
                onChange={(v) => setB({ ...b, rrBpm: v })}
                min={10}
                max={100}
              />
              <NumInput
                id="spo2"
                aria-label="SpO2"
                value={b.spo2}
                onChange={(v) => setB({ ...b, spo2: v })}
                min={50}
                max={100}
              />
            </div>
          </Row>
          <Row label="Feeding" htmlFor="feeding">
            <Select
              id="feeding"
              value={b.feeding}
              onChange={(v) => setB({ ...b, feeding: v as Baby["feeding"] })}
              options={[
                { v: "breast", l: "Breast" },
                { v: "formula", l: "Formula" },
                { v: "mixed", l: "Mixed" },
              ]}
            />
          </Row>
          <Row label="Screening profile">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SCREENINGS) as ReadonlyArray<Profile>).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setB({ ...b, profile: p })}
                  aria-pressed={b.profile === p}
                  className={`flex-1 min-w-[6rem] text-sm px-3 py-2 rounded-md border ${
                    b.profile === p
                      ? "bg-teal-600 dark:bg-teal-500 text-white border-teal-600 dark:border-teal-400"
                      : "bg-white dark:bg-ink-900 text-ink-700 dark:text-ink-200 border-ink-300 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-800"
                  }`}
                >
                  {PROFILE_LABELS[p]}
                </button>
              ))}
            </div>
          </Row>

          <div className="pt-2 flex flex-wrap gap-2 items-center">
            {llmReady ? (
              <button
                type="button"
                onClick={generateNarrative}
                disabled={narrative.status === "loading"}
                className="inline-flex items-center gap-1.5 bg-teal-600 dark:bg-teal-500 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-teal-700 dark:hover:bg-teal-400 disabled:opacity-50"
              >
                <Sparkles size={14} />
                {narrative.status === "loading" ? "Drafting…"
                  : narrative.status === "ready" ? "Regenerate narrative"
                  : "Generate narrative with LLM"}
              </button>
            ) : (
              <Link
                to="/settings"
                className="text-xs text-teal-700 dark:text-teal-400 underline underline-offset-2"
              >
                Add a key in Settings to draft the narrative with an LLM
              </Link>
            )}
            <button
              type="button"
              onClick={copyNote}
              className="inline-flex items-center gap-1.5 border border-ink-300 dark:border-ink-700 bg-white dark:bg-ink-900 text-ink-700 dark:text-ink-200 px-3 py-2 rounded-md text-sm hover:bg-ink-50 dark:hover:bg-ink-800"
            >
              <Copy size={14} /> Copy note
            </button>
            <button
              type="button"
              onClick={downloadNote}
              className="inline-flex items-center gap-1.5 border border-ink-300 dark:border-ink-700 bg-white dark:bg-ink-900 text-ink-700 dark:text-ink-200 px-3 py-2 rounded-md text-sm hover:bg-ink-50 dark:hover:bg-ink-800"
            >
              <Download size={14} /> Download .txt
            </button>
          </div>

          {narrative.status === "error" && (
            <p className="text-xs text-rose-700">{narrative.message}</p>
          )}
        </form>

        <article className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 font-serif text-sm text-ink-800 dark:text-ink-100 whitespace-pre-wrap leading-relaxed">
          {note}
        </article>
      </div>

      <section className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5">
        <h2 className="font-semibold text-ink-800 dark:text-ink-100 mb-2 text-sm">
          Screening checklist — {PROFILE_LABELS[b.profile]}
        </h2>
        <ul className="flex flex-wrap gap-1.5 text-xs">
          {SCREENINGS[b.profile].map((s) => (
            <li
              key={s}
              className="rounded-full border border-teal-600/30 bg-teal-50 dark:bg-teal-900/20 text-teal-800 dark:text-teal-200 px-2.5 py-1"
            >
              {s}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function generateNote(b: Baby, narrative: NarrativeState): string {
  const weight = (b.birthWeightG / 1000).toFixed(2);
  const delivery = b.delivery === "vaginal" ? "SVD" : "Cesarean section";
  const termTag =
    b.gestationalWeeks < 37 ? "preterm" : b.gestationalWeeks > 41 ? "post-term" : "term (AGA)";
  const ready = narrative.status === "ready" ? narrative.sections : null;

  const assessment = ready?.assessment
    ?? `${termTag} infant, ${delivery.toLowerCase()}.\n${b.apgar5 >= 7 ? "Uneventful transition." : "Delayed transition — monitor."}\nVitals within expected range.`;
  const plan = ready?.plan
    ?? `Routine nursery care. ${b.feeding === "breast" ? "Breastfeeding support." : "Formula per parents."}\nDischarge at 48 h if screens negative and feeding established.`;

  return `WELL-BABY NURSERY NOTE

Gestational age: ${b.gestationalWeeks} weeks
Delivery: ${delivery}
APGAR: ${b.apgar1} / ${b.apgar5}
Birth weight: ${weight} kg

Vitals
  Temp ${b.temperatureC} °C · HR ${b.hrBpm} · RR ${b.rrBpm} · SpO₂ ${b.spo2}%

Feeding: ${b.feeding === "mixed" ? "breast + formula" : b.feeding}

Assessment
${indent(assessment)}

Screening (${PROFILE_LABELS[b.profile]} panel)
${SCREENINGS[b.profile].map((s) => "  · " + s).join("\n")}

Plan
${indent(plan)}`;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `  ${line}` : line))
    .join("\n");
}

function Row({
  label,
  htmlFor,
  children,
}: {
  readonly label: string;
  readonly htmlFor?: string;
  readonly children: React.ReactNode;
}) {
  if (htmlFor) {
    return (
      <label htmlFor={htmlFor} className="block text-sm">
        <span className="block text-ink-600 dark:text-ink-300 text-xs mb-1">{label}</span>
        {children}
      </label>
    );
  }
  return (
    <fieldset className="block text-sm">
      <legend className="block text-ink-600 dark:text-ink-300 text-xs mb-1">{label}</legend>
      {children}
    </fieldset>
  );
}

function NumInput({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  "aria-label": ariaLabel,
}: {
  readonly id?: string;
  readonly value: number;
  readonly onChange: (v: number) => void;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly "aria-label"?: string;
}) {
  return (
    <input
      id={id}
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-md border border-ink-300 dark:border-ink-700 p-2"
      aria-label={ariaLabel}
    />
  );
}

function Select({
  id,
  value,
  onChange,
  options,
}: {
  readonly id?: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly options: ReadonlyArray<{ readonly v: string; readonly l: string }>;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-ink-300 dark:border-ink-700 p-2"
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );
}
