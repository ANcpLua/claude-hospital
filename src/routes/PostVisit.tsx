import {lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
    Activity,
    Download,
    FileText,
    Mic,
    MicOff,
    Phone,
    Send,
    Trash2,
    Upload,
} from "lucide-react";
import {callLLM, useLlmAvailable} from "../lib/llm";
import {useSpeech} from "../lib/speech";
import {asStringArray, extractJson} from "../lib/extract";
import CustomCursor from "../components/react-bits/custom-cursor";
import {triage, type TriageResult} from "../lib/triage";
import {VISITS, type Visit} from "../data/visits";
import {cacheGet, cacheSet, hash32} from "../lib/cache";

// Code-split: three.js adds ~800 kB raw. Only pay for it on this route.
const GlitterWarp = lazy(() => import("../components/react-bits/glitter-warp"));

type Tab = "recap" | "scribe" | "connect" | "contact";

interface ChatMsg {
    readonly id: number;
    readonly from: "ai" | "patient";
    readonly text: string;
    readonly error?: boolean;
}

interface ScribeExtract {
    readonly symptoms: ReadonlyArray<string>;
    readonly medication_questions: ReadonlyArray<string>;
    readonly side_effects: ReadonlyArray<string>;
    readonly next_steps: ReadonlyArray<string>;
}

const EMPTY_EXTRACT: ScribeExtract = {
    symptoms: [],
    medication_questions: [],
    side_effects: [],
    next_steps: [],
};

interface GuidelineFile {
    readonly id: string;
    readonly name: string;
    readonly size: number;
    readonly type: string;
    readonly addedAt: string;
}

const GUIDELINE_DB = "meduni-postvisit";
const GUIDELINE_STORE = "guidelines";

function openGuidelineDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(GUIDELINE_DB, 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(GUIDELINE_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

interface StoredGuideline {
    readonly meta: GuidelineFile;
    readonly blob: Blob;
}

async function listGuidelines(): Promise<ReadonlyArray<GuidelineFile>> {
    try {
        const db = await openGuidelineDb();
        const rows = await new Promise<ReadonlyArray<StoredGuideline>>((resolve, reject) => {
            const tx = db.transaction(GUIDELINE_STORE, "readonly");
            const req = tx.objectStore(GUIDELINE_STORE).getAll();
            req.onsuccess = () => resolve(req.result as ReadonlyArray<StoredGuideline>);
            req.onerror = () => reject(req.error);
        });
        db.close();
        return rows.map((r) => r.meta);
    } catch {
        return [];
    }
}

async function addGuideline(file: File): Promise<GuidelineFile> {
    const meta: GuidelineFile = {
        id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `g-${Date.now()}`,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        addedAt: new Date().toISOString(),
    };
    const db = await openGuidelineDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(GUIDELINE_STORE, "readwrite");
        tx.objectStore(GUIDELINE_STORE).put({meta, blob: file}, meta.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
    return meta;
}

async function removeGuideline(id: string): Promise<void> {
    const db = await openGuidelineDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(GUIDELINE_STORE, "readwrite");
        tx.objectStore(GUIDELINE_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}

function validateExtract(raw: unknown): ScribeExtract | null {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const symptoms = asStringArray(r.symptoms) ?? [];
    const medication_questions =
        asStringArray(r.medication_questions) ??
        asStringArray((r as Record<string, unknown>).medicationQuestions) ??
        [];
    const side_effects =
        asStringArray(r.side_effects) ??
        asStringArray((r as Record<string, unknown>).sideEffects) ??
        [];
    const next_steps =
        asStringArray(r.next_steps) ??
        asStringArray((r as Record<string, unknown>).nextSteps) ??
        [];
    return {symptoms, medication_questions, side_effects, next_steps};
}

interface FhirObservation {
    readonly code?: {
        readonly text?: string;
        readonly coding?: ReadonlyArray<{ readonly code?: string; readonly display?: string }>
    };
    readonly valueQuantity?: { readonly value?: number; readonly unit?: string };
    readonly valueString?: string;
    readonly effectiveDateTime?: string;
    readonly status?: string;
}

function parseFhirObservation(text: string): FhirObservation | null {
    try {
        const parsed = JSON.parse(text) as unknown;
        if (typeof parsed !== "object" || parsed === null) return null;
        const obj = parsed as Record<string, unknown>;
        if (obj.resourceType !== "Observation") return null;
        return obj as FhirObservation;
    } catch {
        return null;
    }
}

function fhirSummary(o: FhirObservation): string {
    const label =
        o.code?.text ?? o.code?.coding?.[0]?.display ?? o.code?.coding?.[0]?.code ?? "Observation";
    const value =
        o.valueQuantity && typeof o.valueQuantity.value === "number"
            ? `${o.valueQuantity.value} ${o.valueQuantity.unit ?? ""}`.trim()
            : (o.valueString ?? "no value");
    const when = o.effectiveDateTime ?? "no date";
    return `${label} = ${value} · ${when} · ${o.status ?? "—"}`;
}

const FIRST_VISIT: Visit = VISITS[0] ?? {
    id: "fallback",
    date: "",
    doctor: "",
    diagnosis: "",
    recommendations: [],
    termsToExplain: [],
};

export function PostVisit() {
    const llmReady = useLlmAvailable();
    const [tab, setTab] = useState<Tab>("recap");
    const [visitId, setVisitId] = useState<string>(FIRST_VISIT.id);
    const visit: Visit = useMemo(
        () => VISITS.find((v) => v.id === visitId) ?? FIRST_VISIT,
        [visitId],
    );

    const [chatByRec, setChatByRec] = useState<Record<number, ReadonlyArray<ChatMsg>>>({});
    const [questionByRec, setQuestionByRec] = useState<Record<number, string>>({});
    const [loadingRec, setLoadingRec] = useState<number | null>(null);
    const [openRec, setOpenRec] = useState<number | null>(null);

    const [finalScribe, setFinalScribe] = useState("");
    const [extract, setExtract] = useState<ScribeExtract>(EMPTY_EXTRACT);
    const [scribeLoading, setScribeLoading] = useState(false);
    const [scribeError, setScribeError] = useState<string | null>(null);
    const speech = useSpeech({
        lang: "en-US",
        onFinal: (text) =>
            setFinalScribe((prev) => (prev.length > 0 ? `${prev} ${text}` : text)),
    });

    const [fhirText, setFhirText] = useState("");
    const [fhirParsed, setFhirParsed] = useState<FhirObservation | null>(null);
    const [guidelines, setGuidelines] = useState<ReadonlyArray<GuidelineFile>>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [complaint, setComplaint] = useState("");
    const [triageResult, setTriageResult] = useState<TriageResult | null>(null);
    const [triageLoading, setTriageLoading] = useState(false);

    useEffect(() => {
        void listGuidelines().then(setGuidelines);
    }, []);

    const askAboutRec = useCallback(
        async (recIdx: number) => {
            const q = (questionByRec[recIdx] ?? "").trim();
            if (!q) return;
            const rec = visit.recommendations[recIdx];
            if (!rec) return;
            const prior = chatByRec[recIdx] ?? [];
            const userMsg: ChatMsg = {id: prior.length, from: "patient", text: q};
            const withQ = [...prior, userMsg];
            setChatByRec((m) => ({...m, [recIdx]: withQ}));
            setQuestionByRec((m) => ({...m, [recIdx]: ""}));

            const cacheNs = "meduni-postvisit-chat-v3";
            const cacheKey = `${visit.id}-r${recIdx}-${hash32(q)}`;
            const cached = cacheGet<string>(cacheNs, cacheKey);
            if (cached) {
                setChatByRec((m) => ({
                    ...m,
                    [recIdx]: [...withQ, {id: withQ.length, from: "ai", text: cached}],
                }));
                return;
            }

            setLoadingRec(recIdx);
            const grounding = `Visit on ${visit.date} with ${visit.doctor}. Diagnosis: ${visit.diagnosis}. All recommendations from this visit: ${visit.recommendations.map((x, i) => `#${i + 1} "${x}"`).join("; ")}. The one the patient is asking about right now: #${recIdx + 1} "${rec}".`;
            const r = await callLLM({
                system: `You are a patient companion answering a follow-up question from a patient about recommendation #${recIdx + 1} ("${rec}") from their last visit. Answer the actual question directly and helpfully, using general medical knowledge about the medication, diet, or action named in that recommendation (typical dosing, onset, common side effects, what to watch for, practical tips). Keep to at most 3 short sentences. Do not invent new prescriptions, lab results, or diagnoses. If the question is about a different recommendation in this visit, briefly redirect to that one by number. Only suggest contacting the doctor for truly individualized questions (exact personal dose changes, symptoms needing evaluation, emergencies) — never as a default deflection.\n\nContext: ${grounding}`,
                messages: [{role: "user", content: q}],
                maxTokens: 220,
                temperature: 0.3,
            });
            setLoadingRec(null);
            if (r.ok) {
                const replyText = r.text.trim();
                cacheSet(cacheNs, cacheKey, replyText);
                setChatByRec((m) => ({
                    ...m,
                    [recIdx]: [...withQ, {id: withQ.length, from: "ai", text: replyText}],
                }));
                return;
            }
            const errText =
                r.reason === "daily-cap"
                    ? "Daily demo limit reached — please try again tomorrow."
                    : r.reason === "rate-limit"
                        ? "Too many questions in a row — wait a moment and try again."
                        : r.reason === "turnstile"
                            ? "Bot-check didn't complete. Reload the page and try again."
                            : "Couldn't reach the assistant just now. Please try again in a moment.";
            setChatByRec((m) => ({
                ...m,
                [recIdx]: [...withQ, {id: withQ.length, from: "ai", text: errText, error: true}],
            }));
        },
        [chatByRec, questionByRec, llmReady, visit],
    );

    const stopAndExtract = useCallback(async () => {
        speech.stop();
        if (!finalScribe.trim()) return;
        setScribeError(null);

        const cacheNs = "meduni-postvisit-scribe-v1";
        const cacheKey = `${visit.id}-${hash32(finalScribe)}`;
        const cached = cacheGet<ScribeExtract>(cacheNs, cacheKey);
        if (cached) {
            setExtract(cached);
            return;
        }

        if (!llmReady) {
            setExtract(deterministicScribeExtract(finalScribe));
            return;
        }
        setScribeLoading(true);
        const r = await extractJson<ScribeExtract>({
            system:
                'Extract structured notes from the patient\'s post-visit voice memo. Categorise each phrase into one of: symptoms, medication_questions, side_effects, next_steps. Use the schema {"symptoms":string[],"medication_questions":string[],"side_effects":string[],"next_steps":string[]}. Use empty arrays when nothing fits a category. Do not invent items.',
            user: finalScribe,
            validate: validateExtract,
            maxTokens: 400,
        });
        setScribeLoading(false);
        if (!r.ok) {
            setScribeError(r.reason);
            setExtract(deterministicScribeExtract(finalScribe));
            return;
        }
        cacheSet(cacheNs, cacheKey, r.value);
        setExtract(r.value);
    }, [speech, finalScribe, llmReady, visit.id]);

    function clearScribe() {
        setFinalScribe("");
        setExtract(EMPTY_EXTRACT);
        setScribeError(null);
    }

    function tryParseFhir() {
        const parsed = parseFhirObservation(fhirText);
        setFhirParsed(parsed);
    }

    async function onUploadGuideline(e: React.ChangeEvent<HTMLInputElement>) {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        for (const file of Array.from(files)) {
            try {
                await addGuideline(file);
            } catch {
                /* empty */
            }
        }
        setGuidelines(await listGuidelines());
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    async function onRemoveGuideline(id: string) {
        await removeGuideline(id);
        setGuidelines(await listGuidelines());
    }

    async function runTriage() {
        const text = complaint.trim();
        if (!text) return;
        const cacheNs = "meduni-postvisit-triage-v1";
        const cacheKey = `${visit.id}-${hash32(text)}`;
        const cached = cacheGet<TriageResult>(cacheNs, cacheKey);
        if (cached) {
            setTriageResult(cached);
            return;
        }
        setTriageLoading(true);
        const result = await triage(text, llmReady);
        setTriageLoading(false);
        setTriageResult(result);
        cacheSet(cacheNs, cacheKey, result);
    }

    function exportRecord() {
        const payload = {
            exported: new Date().toISOString(),
            visit,
            scribe: {transcript: finalScribe, extract},
            data: {
                fhir: fhirParsed ?? null,
            },
            guidelines,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `postvisit-${visit.id}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="space-y-6">
            <div className="relative rounded-xl overflow-hidden border border-ink-200 dark:border-ink-800 bg-[#050510]">
                <div className="absolute inset-0 pointer-events-none">
                    <Suspense fallback={null}>
                        <GlitterWarp
                            width="100%"
                            height="100%"
                            color="#10b981"
                            speed={1.1}
                            brightness={1.3}
                            density={13}
                            starSize={1.1}
                            turbulence={0.7}
                        />
                    </Suspense>
                </div>
                <div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background:
                            "linear-gradient(to right, rgba(5,5,16,0.92) 0%, rgba(5,5,16,0.7) 45%, rgba(5,5,16,0.25) 80%, rgba(5,5,16,0) 100%), linear-gradient(to top, rgba(5,5,16,0.8) 0%, rgba(5,5,16,0.35) 55%, rgba(5,5,16,0) 85%)",
                    }}
                />
                <header className="relative z-10 flex items-start flex-wrap justify-between gap-4 p-6 sm:p-8">
                    <div className="max-w-xl">
                        <h1
                            className="text-3xl sm:text-4xl font-semibold tracking-tight text-white"
                            style={{textShadow: "0 2px 16px rgba(0,0,0,0.8)"}}
                        >
                            PostVisit companion
                        </h1>
                        <p
                            className="mt-2 text-sm text-white"
                            style={{textShadow: "0 1px 10px rgba(0,0,0,0.8)"}}
                        >
                            After the visit: a recap with grounded chat, a patient-side AI
                            scribe, connectors to vitals / labs / guidelines, and a doctor
                            triage channel.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <select
                            value={visitId}
                            onChange={(e) => setVisitId(e.target.value)}
                            className="text-xs border border-white/20 bg-white/10 text-white backdrop-blur-sm rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-white/40"
                            aria-label="Select visit"
                        >
                            {VISITS.map((v) => (
                                <option key={v.id} value={v.id} className="text-ink-900">
                                    {v.date} · {v.diagnosis}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={exportRecord}
                            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
                        >
                            <Download size={14}/> Download my record
                        </button>
                    </div>
                </header>
            </div>

            <nav
                role="tablist"
                aria-label="Post-visit tabs"
                className="flex flex-wrap gap-1 rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-1 w-fit"
            >
                {(
                    [
                        ["recap", "Recap", FileText],
                        ["scribe", "Patient scribe", Mic],
                        ["connect", "Connect data", Activity],
                        ["contact", "Contact doctor", Phone],
                    ] as ReadonlyArray<readonly [Tab, string, typeof FileText]>
                ).map(([k, label, Icon]) => (
                    <button
                        key={k}
                        role="tab"
                        aria-selected={tab === k}
                        onClick={() => setTab(k)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition ${
                            tab === k ? "bg-teal-600 dark:bg-teal-500 text-white" : "text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800"
                        }`}
                    >
                        <Icon size={14}/> {label}
                    </button>
                ))}
            </nav>

            {tab === "recap" && (
                <section className="space-y-4">
                    <article
                        className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 space-y-3">
                        <div className="flex items-start flex-wrap justify-between gap-2">
                            <div>
                                <h2 className="font-semibold text-ink-800 dark:text-ink-100">Last visit</h2>
                                <p className="text-sm text-ink-600 dark:text-ink-300">
                                    {visit.date} · {visit.doctor}
                                </p>
                            </div>
                            <span
                                className="pv-diagnosis-chip text-xs bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-400/40 px-2 py-0.5 rounded-md">
                {visit.diagnosis}
              </span>
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">
                                Doctor's recommendations · tap any one to ask about it
                            </h3>
                            <ol id="postvisit-recs" className="space-y-1.5">
                                <CustomCursor
                                    targets={["#postvisit-recs > li", ".pv-diagnosis-chip"]}
                                    targetPadding={4}
                                />
                                {visit.recommendations.map((r, idx) => {
                                    const isOpen = openRec === idx;
                                    const chat = chatByRec[idx] ?? [];
                                    const question = questionByRec[idx] ?? "";
                                    const isLoading = loadingRec === idx;
                                    return (
                                        <li
                                            key={`${visit.id}-${idx}`}
                                            className="rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-linear-to-r from-emerald-50/70 to-cream-50 dark:from-emerald-950/30 dark:to-ink-900 overflow-hidden"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setOpenRec(isOpen ? null : idx)}
                                                aria-expanded={isOpen}
                                                className="w-full flex items-start gap-2 text-left px-3 py-2 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/30"
                                            >
                        <span
                            className="text-xs tabular-nums text-emerald-700/70 dark:text-emerald-300/70 mt-0.5 font-semibold">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                                                <span className="flex-1 text-sm text-ink-800 dark:text-ink-100">
                          {r}
                        </span>
                                                <span
                                                    className="text-xs text-emerald-700 dark:text-emerald-300 shrink-0 mt-0.5">
                          {isOpen
                              ? "Close"
                              : chat.length > 0
                                  ? `${(chat.length / 2) | 0} Q&A`
                                  : "Ask →"}
                        </span>
                                            </button>
                                            {isOpen && (
                                                <div
                                                    className="border-t border-emerald-200/60 dark:border-emerald-900/50 px-3 py-2 space-y-2 bg-white dark:bg-ink-900">
                                                    {chat.length === 0 && (
                                                        <p className="text-xs text-ink-500 dark:text-ink-400 italic">
                                                            Try: "why this one?" · "any side effects?" · "how long until
                                                            it helps?"
                                                        </p>
                                                    )}
                                                    {chat.map((m) => (
                                                        <div
                                                            key={m.id}
                                                            className={`flex ${m.from === "ai" ? "justify-start" : "justify-end"}`}
                                                        >
                                                            <div
                                                                className={`max-w-[90%] px-2.5 py-1.5 rounded-md text-sm whitespace-pre-wrap ${
                                                                    m.from === "ai"
                                                                        ? m.error
                                                                            ? "bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border border-amber-300 dark:border-amber-700"
                                                                            : "bg-ink-100 dark:bg-ink-800 text-ink-800 dark:text-ink-100"
                                                                        : "bg-emerald-600 text-white"
                                                                }`}
                                                            >
                                                                {m.text}
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {isLoading && (
                                                        <div
                                                            className="text-xs text-ink-500 dark:text-ink-400 inline-flex items-center gap-2">
                                                            <span
                                                                className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse"/>
                                                            Thinking…
                                                        </div>
                                                    )}
                                                    <form
                                                        onSubmit={(e) => {
                                                            e.preventDefault();
                                                            void askAboutRec(idx);
                                                        }}
                                                        className="flex gap-2"
                                                    >
                                                        <input
                                                            value={question}
                                                            onChange={(e) =>
                                                                setQuestionByRec((m) => ({...m, [idx]: e.target.value}))
                                                            }
                                                            placeholder="Ask about this recommendation"
                                                            className="flex-1 rounded-md border border-emerald-300 dark:border-emerald-700 p-1.5 text-sm bg-white dark:bg-ink-950"
                                                        />
                                                        <button
                                                            type="submit"
                                                            disabled={isLoading || !question.trim()}
                                                            className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-md text-sm disabled:opacity-50 hover:bg-emerald-700"
                                                        >
                                                            <Send size={12}/> Ask
                                                        </button>
                                                    </form>
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>
                        {visit.termsToExplain.length > 0 && (
                            <div>
                                <h3 className="text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400 mb-1">
                                    Terms explained
                                </h3>
                                <dl className="grid sm:grid-cols-2 gap-2 text-sm">
                                    {visit.termsToExplain.map((t) => (
                                        <div
                                            key={t.term}
                                            className="rounded-md border border-ink-200 dark:border-ink-800 bg-ink-50 dark:bg-ink-800/60 p-3"
                                        >
                                            <dt className="font-medium text-ink-800 dark:text-ink-100">{t.term}</dt>
                                            <dd className="text-ink-600 dark:text-ink-300 text-sm">{t.lay}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </div>
                        )}
                    </article>

                </section>
            )}

            {tab === "scribe" && (
                <section
                    className="space-y-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5">
                    <h2 className="font-semibold text-ink-800 dark:text-ink-100">Patient-side scribe</h2>
                    <p className="text-sm text-ink-600 dark:text-ink-300">
                        Record what you remember after the visit. Audio is transcribed in
                        your browser via the Web Speech API; no audio leaves the device.
                    </p>
                    {speech.status.state === "unsupported" && (
                        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
                            Web Speech is not available in this browser. Use Chrome or Edge for
                            the live demo.
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={speech.status.state === "unsupported"}
                            onClick={() =>
                                speech.status.state === "listening" ? stopAndExtract() : speech.start()
                            }
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium ${
                                speech.status.state === "listening"
                                    ? "bg-rose-600 text-white hover:bg-rose-700"
                                    : "bg-teal-600 dark:bg-teal-500 text-white hover:bg-teal-700 dark:hover:bg-teal-400"
                            } disabled:opacity-50`}
                        >
                            {speech.status.state === "listening" ? (
                                <>
                                    <MicOff size={14}/> Stop & extract
                                </>
                            ) : (
                                <>
                                    <Mic size={14}/> Record
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={clearScribe}
                            disabled={!finalScribe && extract === EMPTY_EXTRACT}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-ink-300 dark:border-ink-700 bg-white dark:bg-ink-900 text-sm hover:bg-ink-50 dark:hover:bg-ink-800 disabled:opacity-50"
                        >
                            <Trash2 size={14}/> Clear
                        </button>
                    </div>
                    {speech.status.state === "denied" && (
                        <p className="text-xs text-rose-700">
                            Microphone permission denied — voice input disabled.
                        </p>
                    )}

                    <div
                        className="text-sm rounded-md border border-ink-200 dark:border-ink-800 bg-ink-50 dark:bg-ink-800/60 p-3 min-h-20">
                        {finalScribe || (
                            <span className="text-ink-400 italic">No recording yet.</span>
                        )}
                        {speech.interim && (
                            <span className="italic text-ink-500 dark:text-ink-400"> {speech.interim}</span>
                        )}
                    </div>

                    {scribeLoading && (
                        <p className="text-xs text-ink-500 dark:text-ink-400 inline-flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-teal-600 dark:bg-teal-500 animate-pulse"/>
                            Extracting structured cards…
                        </p>
                    )}
                    {scribeError && (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                            LLM extraction fell back to deterministic split: {scribeError}
                        </p>
                    )}

                    <ScribeCards extract={extract}/>
                </section>
            )}

            {tab === "connect" && (
                <section className="space-y-4">
                    <article
                        className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 space-y-3">
                        <h2 className="font-semibold text-ink-800 dark:text-ink-100">Apple Health</h2>
                        <p className="text-sm text-ink-600 dark:text-ink-300">
                            Open Apple Health on iOS to share recent vitals.
                        </p>
                        <a
                            href="x-apple-health://"
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-ink-300 dark:border-ink-700 bg-white dark:bg-ink-900 text-sm hover:bg-ink-50 dark:hover:bg-ink-800 w-fit"
                        >
                            Open Apple Health
                        </a>
                    </article>

                    <article
                        className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 space-y-3">
                        <h2 className="font-semibold text-ink-800 dark:text-ink-100">FHIR Observation</h2>
                        <p className="text-sm text-ink-600 dark:text-ink-300">
                            Paste a FHIR <code>Observation</code> JSON exported from your
                            tracker — the page parses it locally.
                        </p>
                        <textarea
                            rows={6}
                            value={fhirText}
                            onChange={(e) => setFhirText(e.target.value)}
                            placeholder='{"resourceType":"Observation","code":{"text":"Heart rate"},"valueQuantity":{"value":72,"unit":"bpm"},"effectiveDateTime":"2026-04-22T08:30:00Z","status":"final"}'
                            className="w-full rounded-md border border-ink-300 dark:border-ink-700 p-2 text-xs font-mono"
                        />
                        <button
                            type="button"
                            onClick={tryParseFhir}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-ink-300 dark:border-ink-700 bg-white dark:bg-ink-900 text-sm hover:bg-ink-50 dark:hover:bg-ink-800 w-fit"
                        >
                            Parse
                        </button>
                        {fhirParsed && (
                            <div
                                className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                                {fhirSummary(fhirParsed)}
                            </div>
                        )}
                        {!fhirParsed && fhirText.length > 0 && (
                            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                                Couldn't parse a FHIR Observation from that text.
                            </div>
                        )}
                    </article>

                    <article
                        className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 space-y-3">
                        <h2 className="font-semibold text-ink-800 dark:text-ink-100">Guideline library</h2>
                        <p className="text-sm text-ink-600 dark:text-ink-300">
                            Upload PDFs or markdown clinical guidelines you want kept on this
                            device. Stored in IndexedDB; nothing leaves your browser.
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-ink-300 dark:border-ink-700 bg-white dark:bg-ink-900 text-sm hover:bg-ink-50 dark:hover:bg-ink-800"
                            >
                                <Upload size={14}/> Add file
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain"
                                onChange={onUploadGuideline}
                                className="hidden"
                            />
                        </div>
                        <ul className="text-sm space-y-1">
                            {guidelines.length === 0 && (
                                <li className="text-ink-500 dark:text-ink-400 italic text-sm">
                                    No guidelines uploaded yet.
                                </li>
                            )}
                            {guidelines.map((g) => (
                                <li
                                    key={g.id}
                                    className="flex items-center justify-between gap-2 border border-ink-200 dark:border-ink-800 rounded-md px-3 py-2"
                                >
                  <span className="truncate flex-1">
                    {g.name}{" "}
                      <span className="text-xs text-ink-500 dark:text-ink-400">
                      · {(g.size / 1024).toFixed(1)} kB
                    </span>
                  </span>
                                    <button
                                        type="button"
                                        onClick={() => onRemoveGuideline(g.id)}
                                        className="text-rose-700 hover:text-rose-900"
                                        aria-label={`Remove ${g.name}`}
                                    >
                                        <Trash2 size={14}/>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </article>
                </section>
            )}

            {tab === "contact" && (
                <section
                    className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 space-y-4">
                    <h2 className="font-semibold text-ink-800 dark:text-ink-100">Contact the doctor</h2>
                    <p className="text-sm text-ink-600 dark:text-ink-300">
                        Tell us what's going on. We'll triage whether you need to be seen
                        today or whether this can wait.
                    </p>
                    <textarea
                        rows={4}
                        value={complaint}
                        onChange={(e) => setComplaint(e.target.value)}
                        placeholder="e.g. 'my ankles are puffy since starting amlodipine'"
                        className="w-full rounded-md border border-ink-300 dark:border-ink-700 p-2 text-sm"
                    />
                    <div className="flex gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={runTriage}
                            disabled={triageLoading || complaint.trim().length === 0}
                            className="bg-teal-600 dark:bg-teal-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-teal-700 dark:hover:bg-teal-400 disabled:opacity-50"
                        >
                            {triageLoading ? "Triaging…" : "Send triage"}
                        </button>
                    </div>
                    {triageResult && <TriagePanel result={triageResult}/>}
                </section>
            )}
        </div>
    );
}

const SCRIBE_SECTIONS: ReadonlyArray<{
    readonly key: keyof ScribeExtract;
    readonly label: string;
    readonly tone: string
}> = [
    {key: "symptoms", label: "Symptoms", tone: "bg-rose-50 border-rose-200 text-rose-900"},
    {key: "medication_questions", label: "Medication questions", tone: "bg-sky-50 border-sky-200 text-sky-900"},
    {key: "side_effects", label: "Side effects", tone: "bg-amber-50 border-amber-200 text-amber-900"},
    {key: "next_steps", label: "Next steps", tone: "bg-emerald-50 border-emerald-200 text-emerald-900"},
];

function ScribeCards({extract}: { readonly extract: ScribeExtract }) {
    if (SCRIBE_SECTIONS.every((s) => extract[s.key].length === 0)) return null;
    return (
        <div className="grid sm:grid-cols-2 gap-3 pt-2">
            {SCRIBE_SECTIONS.map((s) => (
                <details
                    key={s.key}
                    open={extract[s.key].length > 0}
                    className={`rounded-md border p-3 ${s.tone}`}
                >
                    <summary className="text-sm font-semibold cursor-pointer">
                        {s.label}{" "}
                        <span className="text-xs opacity-70">({extract[s.key].length})</span>
                    </summary>
                    <ul className="list-disc list-inside text-sm mt-2 space-y-0.5">
                        {extract[s.key].length === 0 && (
                            <li className="opacity-60 italic list-none">— nothing recorded</li>
                        )}
                        {extract[s.key].map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </details>
            ))}
        </div>
    );
}

const TRIAGE_PALETTE: Record<TriageResult["urgency"], string> = {
    urgent: "bg-rose-50 border-rose-300 text-rose-900",
    routine: "bg-amber-50 border-amber-300 text-amber-900",
    "self-care": "bg-emerald-50 border-emerald-300 text-emerald-900",
};

const TRIAGE_LABEL: Record<TriageResult["urgency"], string> = {
    urgent: "Urgent · seek care now",
    routine: "Routine · phone check-in",
    "self-care": "Self-care · general advice",
};

function TriagePanel({result}: { readonly result: TriageResult }) {
    return (
        <div className={`rounded-md border p-3 space-y-2 ${TRIAGE_PALETTE[result.urgency]}`}>
            <div className="text-sm font-semibold">{TRIAGE_LABEL[result.urgency]}</div>
            <p className="text-sm">{result.reason}</p>
            <p className="text-sm font-medium">Next step: {result.suggestedNextStep}</p>
            {result.urgency === "urgent" && (
                <a
                    href="tel:911"
                    className="inline-flex items-center gap-1.5 bg-rose-700 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-rose-800"
                >
                    <Phone size={14}/> Call office now
                </a>
            )}
        </div>
    );
}

function deterministicScribeExtract(text: string): ScribeExtract {
    const out: { [K in keyof ScribeExtract]: string[] } = {
        symptoms: [],
        medication_questions: [],
        side_effects: [],
        next_steps: [],
    };
    for (const line of text.split(/[.\n!?]+/).map((s) => s.trim()).filter((s) => s.length > 0)) {
        const low = line.toLowerCase();
        const bucket: keyof ScribeExtract =
            /\b(side effect|dizzy|puffy|swollen|nausea|rash)\b/.test(low) ? "side_effects"
                : /\b(question|ask|why|when|how)\b/.test(low) ? "medication_questions"
                    : /\b(walk|return|appointment|follow|come back|test)\b/.test(low) ? "next_steps"
                        : /\b(pain|tired|cough|chest|breath)\b/.test(low) ? "symptoms"
                            : "next_steps";
        out[bucket].push(line);
    }
    return out;
}

