import {useEffect, useMemo, useState} from "react";
import {RefreshCw, Send, Shuffle, Sparkles} from "lucide-react";
import {aqiColor, type AqiReading, fetchAqi, isAqiKeyAvailable, SEED_READINGS, useHospitalAqi,} from "../lib/aqi";
import {callLLM} from "../lib/llm";
import {TrendChart} from "../components/TrendChart";
import {type AustriaHospital, AustriaMap} from "../components/AustriaMap";
import {CountUp} from "../components/react-bits/count-up";
import HalftoneWave from "../components/react-bits/halftone-wave";

type Persona = "gen-z" | "pulmonologist" | "public-health";

interface CohortPatient {
    readonly name: string;
    readonly dx: string;
    readonly risk: "high" | "moderate" | "low";
    readonly zip: string;
    readonly lastFev1: string;
    readonly phone: string;
}

const COHORT: ReadonlyArray<CohortPatient> = [
    {
        name: "Anna K.",
        dx: "Severe persistent asthma",
        risk: "high",
        zip: "1010",
        lastFev1: "62%",
        phone: "+43660000123",
    },
    {
        name: "Jakob M.",
        dx: "COPD GOLD 3",
        risk: "high",
        zip: "1010",
        lastFev1: "48%",
        phone: "+43660000456",
    },
    {
        name: "Lena T.",
        dx: "Moderate persistent asthma",
        risk: "moderate",
        zip: "4020",
        lastFev1: "74%",
        phone: "+43660000789",
    },
    {
        name: "Clemens P.",
        dx: "Exercise-induced asthma",
        risk: "low",
        zip: "8010",
        lastFev1: "88%",
        phone: "+43660000987",
    },
];

const RISK_ORDER: Record<CohortPatient["risk"], number> = {high: 0, moderate: 1, low: 2};

const AUSTRIA_HOSPITAL_HOTSPOTS: ReadonlyArray<AustriaHospital> = [
    {name: "AKH Wien", city: "Vienna", lat: 48.220, lng: 16.351, aqi: 78},
    {name: "Rudolfstiftung", city: "Vienna", lat: 48.200, lng: 16.394, aqi: 71},
    {name: "Hanusch-KH", city: "Vienna", lat: 48.194, lng: 16.298, aqi: 74},
    {name: "Kepler Uniklinikum", city: "Linz", lat: 48.297, lng: 14.311, aqi: 66},
    {name: "Uniklinik Salzburg", city: "Salzburg", lat: 47.797, lng: 13.045, aqi: 52},
    {name: "Uniklinik Innsbruck", city: "Innsbruck", lat: 47.267, lng: 11.388, aqi: 44},
    {name: "Uniklinik Graz", city: "Graz", lat: 47.081, lng: 15.455, aqi: 63},
    {name: "Klinikum Klagenfurt", city: "Klagenfurt", lat: 46.620, lng: 14.313, aqi: 55},
    {name: "LKH Feldkirch", city: "Vorarlberg", lat: 47.240, lng: 9.597, aqi: 41},
    {name: "Uni-KH St. Pölten", city: "St. Pölten", lat: 48.205, lng: 15.629, aqi: 62},
];

const SMS_SYSTEM = `Write a 3-sentence SMS for the named patient with their condition and last FEV1, given today's local AQI. Tell them what to do today. End the message with the literal phrase "Reply STOP to opt out."`;

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

function randomNudge(): number {
    return Math.round((Math.random() * 40) - 20);
}

const FALLBACK_READING: AqiReading = SEED_READINGS[0] ?? {
    zip: "1010",
    city: "Vienna",
    aqi: 50,
    dominant: "PM2.5",
    hours24: [],
};

export function Inhaler() {
    const aqiKey = isAqiKeyAvailable();
    const [persona, setPersona] = useState<Persona>("public-health");
    const [testOffset, setTestOffset] = useState(0);
    const [zip, setZip] = useState("1010");
    const [nudges, setNudges] = useState<Record<string, number>>({});
    const [seeds, setSeeds] = useState<ReadonlyArray<AqiReading>>(SEED_READINGS);
    const [aqiLoading, setAqiLoading] = useState(false);

    useEffect(() => {
        if (!aqiKey) return;
        setAqiLoading(true);
        void Promise.all(
            SEED_READINGS.map(async (s) => {
                const r = await fetchAqi(s.zip);
                return r ?? s;
            }),
        ).then((next) => {
            setSeeds(next);
            setAqiLoading(false);
        });
    }, [aqiKey]);

    const reading = useMemo<AqiReading>(() => {
        const base = seeds.find((s) => s.zip === zip) ?? seeds[0] ?? FALLBACK_READING;
        const nudge = nudges[base.zip] ?? 0;
        return {...base, aqi: clamp(base.aqi + testOffset + nudge, 0, 300)};
    }, [seeds, zip, testOffset, nudges]);

    function randomizeAll() {
        const next: Record<string, number> = {};
        for (const s of seeds) next[s.zip] = randomNudge();
        setNudges(next);
    }

    return (
        <div id="inhaler-route" className="space-y-6">
            <header
                className="flex items-start justify-between flex-wrap gap-3 border-b border-orange-200/60 dark:border-orange-900/50 pb-4">
                <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-orange-700 dark:text-orange-300 font-medium">
                        Air-quality triage · 3 personas · 1 feed
                    </p>
                    <h1 className="display text-3xl sm:text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-100">
                        Dude, Where's My Inhaler?
                    </h1>
                    <p className="max-w-xl text-sm text-ink-600 dark:text-ink-300">
                        Same AQI reading, three UIs: a Gen-Z patient card, a pulmonologist
                        cohort console, and a state-level hot-spot map. Add an OpenWeather
                        key in Settings for live data; otherwise the synthetic seed
                        dataset drives everything.
                    </p>
                </div>
                <div
                    role="tablist"
                    aria-label="Persona"
                    className="flex gap-1 rounded-lg border border-orange-200 dark:border-orange-900/60 bg-orange-50/60 dark:bg-orange-950/30 p-1 flex-wrap"
                >
                    {(
                        [
                            ["gen-z", "Gen-Z patient"],
                            ["pulmonologist", "Millennial pulmonologist"],
                            ["public-health", "Public health"],
                        ] as ReadonlyArray<readonly [Persona, string]>
                    ).map(([k, label]) => (
                        <button
                            key={k}
                            role="tab"
                            aria-selected={persona === k}
                            onClick={() => setPersona(k)}
                            className={`px-3 py-1.5 text-sm rounded-md transition ${
                                persona === k
                                    ? "bg-orange-600 dark:bg-orange-500 text-white shadow-sm"
                                    : "text-ink-700 dark:text-ink-200 hover:bg-orange-100/80 dark:hover:bg-orange-900/30"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </header>

            {!aqiKey && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Synthetic AQI dataset · add an OpenWeather key in Settings to fetch
                    live data by ZIP.
                </div>
            )}

            <section id="inhaler-aqi-card"
                     className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-4 flex flex-wrap gap-3 items-end text-sm">
                <label className="block">
                    <span className="block text-xs text-ink-500 dark:text-ink-400 mb-0.5">ZIP</span>
                    <select
                        value={zip}
                        onChange={(e) => setZip(e.target.value)}
                        className="border border-ink-300 dark:border-ink-700 rounded-md p-1.5"
                    >
                        {seeds.map((s) => (
                            <option key={s.zip} value={s.zip}>
                                {s.zip} · {s.city}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block flex-1 min-w-[14rem]">
          <span className="block text-xs text-ink-500 dark:text-ink-400 mb-0.5">
            Testing-mode AQI offset: {testOffset > 0 ? "+" : ""}
              {testOffset}
          </span>
                    <input
                        type="range"
                        min={-50}
                        max={150}
                        step={5}
                        value={testOffset}
                        onChange={(e) => setTestOffset(Number(e.target.value))}
                        className="w-full accent-teal-600 dark:accent-teal-400"
                    />
                </label>
                <button
                    type="button"
                    onClick={randomizeAll}
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-ink-300 dark:border-ink-700 bg-white dark:bg-ink-900 hover:bg-cream-50 dark:hover:bg-ink-800"
                >
                    <Shuffle size={14}/> Randomize ±20
                </button>
                {aqiLoading && (
                    <div className="text-xs text-ink-500 dark:text-ink-400 inline-flex items-center gap-1">
                        <RefreshCw size={12} className="animate-spin"/> Fetching live data…
                    </div>
                )}
                <div className="text-right">
                    <div className="text-xs text-ink-500 dark:text-ink-400">Current AQI</div>
                    <CountUp
                        to={reading.aqi}
                        duration={0.8}
                        className={`text-2xl font-semibold tabular-nums ${aqiColor(reading.aqi)}`}
                    />
                </div>
            </section>

            {persona === "gen-z" && <GenZPatient reading={reading}/>}
            {persona === "pulmonologist" && (
                <Cohort seeds={seeds} reading={reading}/>
            )}
            {persona === "public-health" && (
                <PublicHealth baseAqi={reading.aqi} seeds={seeds}/>
            )}
        </div>
    );
}

interface GenZAdvice {
    readonly label: string;
    readonly emoji: string;
    readonly tone: string;
    readonly hook: string;
    readonly body: string;
}

function genZAdvice(aqi: number): GenZAdvice {
    if (aqi <= 50) {
        return {
            label: "Green light",
            emoji: "🟢",
            tone: "bg-emerald-50 border-emerald-300 text-emerald-900",
            hook: "Air's clean — touch grass, bestie.",
            body: "Outdoor run, bike, pickup game — all cleared. Still pack the inhaler, but you probably won't need it today.",
        };
    }
    if (aqi <= 100) {
        return {
            label: "Yellow light",
            emoji: "🟡",
            tone: "bg-amber-50 border-amber-300 text-amber-900",
            hook: "Mid. Don't push max effort outside.",
            body: "Short walks fine, hot yoga fine, but skip the hill sprints. Keep the rescue inhaler in your pocket, not your backpack.",
        };
    }
    if (aqi <= 150) {
        return {
            label: "Orange light",
            emoji: "🟠",
            tone: "bg-orange-50 border-orange-300 text-orange-900",
            hook: "Not it. Train indoors today.",
            body: "Gym, home workout, or chill. If you HAVE to be outside, mask up and pre-dose your controller. Any chest tightness → rescue inhaler, then text your doc.",
        };
    }
    return {
        label: "Red light",
        emoji: "🔴",
        tone: "bg-rose-50 border-rose-300 text-rose-900",
        hook: "Stay inside. For real.",
        body: "Close the windows, crank the air purifier if you have one, pre-dose your controller. If your chest feels tight even at rest — rescue inhaler + call the on-call line. Don't tough it out.",
    };
}

function GenZPatient({reading}: { readonly reading: AqiReading }) {
    const advice = genZAdvice(reading.aqi);
    return (
        <section className="space-y-4">
            <article
                className={`rounded-xl border p-5 space-y-2 ${advice.tone}`}
            >
                <div className="flex items-center gap-3">
                    <span className="text-3xl leading-none">{advice.emoji}</span>
                    <div>
                        <div className="text-xs uppercase tracking-wide opacity-70">
                            Today · {reading.city} · AQI {reading.aqi} · {advice.label}
                        </div>
                        <h2 className="text-lg font-semibold">{advice.hook}</h2>
                    </div>
                </div>
                <p className="text-sm leading-relaxed">{advice.body}</p>
            </article>

            <article
                className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-4 space-y-2">
                <h3 className="text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">
                    Quick vibe check
                </h3>
                <ul className="text-sm space-y-1.5">
                    <li>
                        <strong>Outdoor cardio:</strong>{" "}
                        {reading.aqi <= 50
                            ? "go off, king/queen."
                            : reading.aqi <= 100
                                ? "walk pace only."
                                : reading.aqi <= 150
                                    ? "inside today."
                                    : "hard no."}
                    </li>
                    <li>
                        <strong>Rescue inhaler:</strong>{" "}
                        {reading.aqi <= 50 ? "pocket, as backup." : "pocket, ready."}
                    </li>
                    <li>
                        <strong>Controller (daily):</strong>{" "}
                        {reading.aqi > 100
                            ? "take it EARLY today before going out."
                            : "take as prescribed."}
                    </li>
                    <li>
                        <strong>When to call:</strong> chest tight at rest, rescue inhaler used more than 2× in a day,
                        or lips/fingers turning blue.
                    </li>
                </ul>
            </article>

            <article
                className="rounded-lg border border-ink-200 dark:border-ink-800 bg-cream-50 dark:bg-ink-950 p-4 text-xs text-ink-600 dark:text-ink-300">
                Dominant pollutant right now: <strong>{reading.dominant}</strong>. Use
                the test slider above to see how the advice changes as the air gets
                worse — same data, different recommendation.
            </article>
        </section>
    );
}

interface SmsDraft {
    readonly patient: CohortPatient;
    readonly localAqi: number;
    readonly text: string;
}

function Cohort({
                    seeds,
                    reading,
                }: {
    readonly seeds: ReadonlyArray<AqiReading>;
    readonly reading: AqiReading;
}) {
    const [sortBy, setSortBy] = useState<"risk" | "aqi" | "fev1">("risk");
    const [drafts, setDrafts] = useState<ReadonlyArray<SmsDraft> | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const ordered = useMemo(() => {
        const withAqi = COHORT.map((p) => ({
            p,
            aqi: p.zip === reading.zip ? reading.aqi : (seeds.find((s) => s.zip === p.zip)?.aqi ?? 40),
        }));
        switch (sortBy) {
            case "aqi":
                return withAqi.sort((a, b) => b.aqi - a.aqi);
            case "fev1":
                return withAqi.sort((a, b) => parseInt(a.p.lastFev1) - parseInt(b.p.lastFev1));
            default:
                return withAqi.sort((a, b) => RISK_ORDER[a.p.risk] - RISK_ORDER[b.p.risk]);
        }
    }, [reading, seeds, sortBy]);

    async function composeSms() {
        setLoading(true);
        setError(null);
        setDrafts(null);
        try {
            const out: SmsDraft[] = [];
            for (const {p, aqi} of ordered) {
                const r = await callLLM({
                    system: SMS_SYSTEM,
                    messages: [
                        {
                            role: "user",
                            content: `patientName=${p.name}; condition=${p.dx}; lastFev1=${p.lastFev1}; aqi=${aqi}`,
                        },
                    ],
                    maxTokens: 160,
                    temperature: 0.4,
                });
                out.push({
                    patient: p,
                    localAqi: aqi,
                    text: r.ok ? r.text.trim() : deterministicSms(p, aqi),
                });
            }
            setDrafts(out);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setDrafts(
                ordered.map(({p, aqi}) => ({
                    patient: p,
                    localAqi: aqi,
                    text: deterministicSms(p, aqi),
                })),
            );
        } finally {
            setLoading(false);
        }
    }

    function sendOne(d: SmsDraft) {
        const url = `sms:${d.patient.phone}?body=${encodeURIComponent(d.text)}`;
        window.location.href = url;
    }

    return (
        <section
            className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-semibold text-ink-800 dark:text-ink-100 text-sm">
                    Cohort · sorted by {sortBy}
                </h2>
                <div className="flex gap-1 text-xs">
                    {(
                        [
                            ["risk", "Risk"],
                            ["aqi", "Local AQI"],
                            ["fev1", "Last FEV₁"],
                        ] as ReadonlyArray<readonly ["risk" | "aqi" | "fev1", string]>
                    ).map(([k, label]) => (
                        <button
                            key={k}
                            type="button"
                            onClick={() => setSortBy(k)}
                            aria-pressed={sortBy === k}
                            className={`px-2 py-1 rounded border ${
                                sortBy === k
                                    ? "bg-teal-600 dark:bg-teal-500 text-white border-teal-600 dark:border-teal-400"
                                    : "bg-white dark:bg-ink-900 text-ink-700 dark:text-ink-200 border-ink-300 dark:border-ink-700 hover:bg-cream-50 dark:hover:bg-ink-800"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            <table className="w-full text-sm">
                <thead className="text-xs text-ink-500 dark:text-ink-400 uppercase tracking-wide">
                <tr>
                    <th className="text-left py-1">Patient</th>
                    <th className="text-left py-1">Dx</th>
                    <th className="text-left py-1">Risk</th>
                    <th className="text-left py-1">Last FEV₁</th>
                    <th className="text-left py-1">Local AQI</th>
                </tr>
                </thead>
                <tbody>
                {ordered.map(({p, aqi}) => (
                    <tr key={p.name} className="border-t border-ink-100 dark:border-ink-800">
                        <td className="py-2">{p.name}</td>
                        <td>{p.dx}</td>
                        <td>
                            <RiskChip risk={p.risk}/>
                        </td>
                        <td className="tabular-nums">{p.lastFev1}</td>
                        <td className={`tabular-nums ${aqiColor(aqi)}`}>{aqi}</td>
                    </tr>
                ))}
                </tbody>
            </table>
            <div className="flex gap-2 flex-wrap">
                <button
                    type="button"
                    onClick={composeSms}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 bg-teal-600 dark:bg-teal-500 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-teal-700 dark:hover:bg-teal-400 disabled:opacity-50"
                >
                    <Sparkles size={14}/>
                    {loading ? "Drafting…" : "Bulk-compose SMS preview"}
                </button>
            </div>
            {error && (
                <p className="text-xs text-rose-700">{error}</p>
            )}
            {drafts && drafts.length > 0 && (
                <SmsPreview drafts={drafts} onSend={sendOne}/>
            )}
        </section>
    );
}

function SmsPreview({
                        drafts,
                        onSend,
                    }: {
    readonly drafts: ReadonlyArray<SmsDraft>;
    readonly onSend: (d: SmsDraft) => void;
}) {
    return (
        <div className="border border-ink-200 dark:border-ink-800 rounded-md bg-cream-50 dark:bg-ink-950 p-3 space-y-3">
            <h3 className="text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">
                SMS drafts (preview only — confirm to send each one)
            </h3>
            <ul className="space-y-2">
                {drafts.map((d) => (
                    <li
                        key={d.patient.name}
                        className="rounded-md border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-3 text-sm space-y-1"
                    >
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                <div className="font-semibold">{d.patient.name}</div>
                                <div className="text-xs text-ink-500 dark:text-ink-400">
                                    {d.patient.phone} · local AQI {d.localAqi}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => onSend(d)}
                                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-teal-600 dark:bg-teal-500 text-white hover:bg-teal-700 dark:hover:bg-teal-400"
                            >
                                <Send size={12}/> Send
                            </button>
                        </div>
                        <p className="text-ink-800 dark:text-ink-100 whitespace-pre-wrap">{d.text}</p>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function DataSourceBadge({
                             hasKey,
                             loading,
                             liveCount,
                             failedCount,
                         }: {
    readonly hasKey: boolean;
    readonly loading: boolean;
    readonly liveCount: number;
    readonly failedCount: number;
}) {
    if (!hasKey) {
        return (
            <span
                className="rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-0.5">
        Mock · no OWM key
      </span>
        );
    }
    if (loading && liveCount === 0) {
        return (
            <span
                className="rounded-full bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300 text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-0.5">
        Loading…
      </span>
        );
    }
    return (
        <span
            className="rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-0.5"
            title={failedCount > 0 ? `${failedCount} site(s) hidden due to fetch failure` : "All sites live"}
        >
      Live · OWM {liveCount}
            {failedCount > 0 ? ` (${failedCount} hidden)` : ""}
    </span>
    );
}

function PublicHealth({
                          baseAqi,
                          seeds,
                      }: {
    readonly baseAqi: number;
    readonly seeds: ReadonlyArray<AqiReading>;
}) {
    const [selected, setSelected] = useState<string | null>(null);
    const live = useHospitalAqi(AUSTRIA_HOSPITAL_HOTSPOTS);

    const adjusted = useMemo(() => {
        if (live.hasKey) {
            return AUSTRIA_HOSPITAL_HOTSPOTS.flatMap((h) => {
                const reading = live.results.get(h.name);
                return reading ? [{...h, aqi: reading.aqi}] : [];
            }).sort((a, b) => b.aqi - a.aqi);
        }
        return AUSTRIA_HOSPITAL_HOTSPOTS.map((h) => ({
            ...h,
            aqi: clamp(h.aqi + (baseAqi - 51), 0, 300),
        })).sort((a, b) => b.aqi - a.aqi);
    }, [baseAqi, live.hasKey, live.results]);

    const selectedHospital = adjusted.find((h) => h.name === selected) ?? null;
    const trend = useMemo(() => {
        if (!selectedHospital) return null;
        const liveReading = live.results.get(selectedHospital.name);
        if (liveReading && liveReading.hours24.length > 0) {
            return [...liveReading.hours24];
        }
        const anchor = seeds[0];
        if (!anchor) return null;
        const ratio = selectedHospital.aqi / Math.max(1, anchor.aqi);
        return anchor.hours24.map((v) => Math.round(v * ratio));
    }, [selectedHospital, seeds, live.results]);

    const worstCount = adjusted.filter((h) => h.aqi > 100).length;
    const advisoryTone = advisoryToneFor(selectedHospital?.aqi);
    const advisoryText = advisoryTextFor;

    return (
        <section
            className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 space-y-4">
            <div className="space-y-1">
                <div className="flex items-center flex-wrap gap-2">
                    <h2 className="font-semibold text-ink-900 dark:text-ink-100">
                        Public-health console · Austria
                    </h2>
                    <DataSourceBadge
                        hasKey={live.hasKey}
                        loading={live.loading}
                        liveCount={live.liveCount}
                        failedCount={live.failedCount}
                    />
                </div>
                <p className="text-sm text-ink-600 dark:text-ink-300">
                    You're the state health officer.{" "}
                    {live.hasKey ? `${adjusted.length} live site${adjusted.length === 1 ? "" : "s"}` : "Ten reference sites"}.{" "}
                    <strong>Click any circle on the map</strong> (or any row below) to see that
                    region's 24-h AQI forecast, a plain-language advisory, and a
                    suggested next step. Currently <strong className="tabular-nums">{worstCount}</strong>
                    {" "}of {adjusted.length} sites are above AQI 100.
                    {live.hasKey && live.failedCount > 0 ? (
                        <span className="block mt-1 text-rose-700 dark:text-rose-300">
              {live.failedCount} site{live.failedCount === 1 ? "" : "s"} hidden — OWM call failed. Check your API key or rate limits.
            </span>
                    ) : null}
                </p>
            </div>

            <div className="relative overflow-hidden rounded-lg">
                <div
                    className="hidden dark:block absolute inset-0 pointer-events-none opacity-30"
                    aria-hidden="true"
                >
                    <HalftoneWave
                        width="100%"
                        height="100%"
                        speed={0.25}
                        gridDensity={48}
                        dotSize={0.42}
                        softness={0.55}
                        scrollX={0.05}
                        scrollY={0.02}
                        colorA={worstCount >= 3 ? "#fb923c" : "#5eead4"}
                        colorB={worstCount >= 3 ? "#ef4444" : "#22d3ee"}
                        backgroundColor="#0b1220"
                        opacity={0.6}
                    />
                </div>
                <div className="relative">
                    <AustriaMap
                        hospitals={adjusted}
                        onSelect={(h) => setSelected(h.name)}
                        selectedName={selected ?? undefined}
                    />
                </div>
            </div>

            {selectedHospital && trend ? (
                <div
                    className={`rounded-lg border-2 p-4 space-y-3 shadow-sm ${advisoryTone}`}
                    role="status"
                    aria-live="polite"
                >
                    <div className="flex items-start flex-wrap justify-between gap-3">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] opacity-70 font-medium">
                                Selected site
                            </p>
                            <h3 className="text-xl font-semibold">
                                {selectedHospital.name}{" "}
                                <span className="opacity-70 text-base font-normal">
                  · {selectedHospital.city}
                </span>
                            </h3>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] uppercase tracking-[0.18em] opacity-70 font-medium">
                                Current AQI
                            </p>
                            <div className="text-4xl font-semibold tabular-nums leading-none">
                                <CountUp
                                    to={selectedHospital.aqi}
                                    duration={0.6}
                                    className="tabular-nums"
                                />
                            </div>
                        </div>
                    </div>
                    <p className="text-sm font-medium">{advisoryText(selectedHospital.aqi)}</p>
                    <div
                        className="rounded-md bg-white/60 dark:bg-ink-950/60 p-2 border border-white/80 dark:border-ink-800">
                        <p className="text-[11px] uppercase tracking-wide opacity-70 mb-1">
                            Next 24 h · predicted AQI
                        </p>
                        <TrendChart
                            values={trend}
                            ariaLabel={`24-hour AQI forecast for ${selectedHospital.name}`}
                            yMax={Math.max(...trend, 200)}
                            height={100}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setSelected(null)}
                        className="text-xs underline underline-offset-2 opacity-70 hover:opacity-100"
                    >
                        Clear selection
                    </button>
                </div>
            ) : (
                <div
                    className="rounded-md border border-dashed border-ink-300 dark:border-ink-700 bg-cream-50/60 dark:bg-ink-950/60 p-4 text-center text-sm text-ink-500 dark:text-ink-400">
                    ← Tap a circle on the map or a row below to load the advisory
                </div>
            )}

            <ul className="space-y-1.5">
                {adjusted.map((h) => (
                    <li
                        key={h.name}
                        className={`flex items-center gap-3 rounded-md py-2 px-2 transition-colors ${
                            selected === h.name
                                ? "bg-teal-50 dark:bg-teal-500/10 ring-2 ring-teal-500 dark:ring-teal-400"
                                : "border-b border-ink-100 dark:border-ink-800 rounded-none"
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => setSelected(h.name)}
                            className="flex-1 text-left"
                        >
                            <strong>{h.name}</strong>{" "}
                            <span className="text-ink-500 dark:text-ink-400 text-sm">· {h.city}</span>
                        </button>
                        <span className={`tabular-nums font-semibold ${aqiColor(h.aqi)}`}>
              {h.aqi}
            </span>
                        <span className="w-32 bg-cream-100 dark:bg-ink-800 rounded h-2">
              <span
                  className="block h-2 rounded bg-teal-600 dark:bg-teal-500"
                  style={{width: `${Math.min(100, (h.aqi / 200) * 100)}%`}}
              />
            </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

const RISK_TONES: Record<CohortPatient["risk"], string> = {
    high: "bg-rose-100 text-rose-800 border-rose-200",
    moderate: "bg-amber-100 text-amber-800 border-amber-200",
    low: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

function RiskChip({risk}: { readonly risk: CohortPatient["risk"] }) {
    return (
        <span className={`text-xs px-2 py-0.5 rounded-md border ${RISK_TONES[risk]}`}>
      {risk}
    </span>
    );
}

function advisoryToneFor(aqi: number | undefined): string {
    if (aqi === undefined) return "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200";
    if (aqi > 150) return "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-900 text-rose-900 dark:text-rose-200";
    if (aqi > 100) return "bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-900 text-orange-900 dark:text-orange-200";
    if (aqi > 50) return "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-900 text-amber-900 dark:text-amber-200";
    return "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200";
}

function advisoryTextFor(aqi: number): string {
    if (aqi > 150) return "Unhealthy. Escalate regional advisory. Page sensitive-group outreach now.";
    if (aqi > 100) return "Unhealthy for sensitive groups. Issue an advisory to asthma / COPD patients in this region.";
    if (aqi > 50) return "Moderate. Monitor trends; advise sensitive individuals to limit prolonged outdoor effort.";
    return "Good. No action needed at the regional level.";
}

function deterministicSms(p: CohortPatient, aqi: number): string {
    const advice =
        aqi > 100
            ? "stay indoors today and pre-treat with your controller before going out."
            : aqi > 50
                ? "limit outdoor cardio and keep your rescue inhaler with you."
                : "no extra precautions today — keep your inhaler with you as usual.";
    return `Hi ${p.name.split(" ")[0]}, today's AQI in your ZIP is ${aqi} (${p.dx}, last FEV₁ ${p.lastFev1}). With your history, please ${advice} Reply STOP to opt out.`;
}
