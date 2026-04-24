import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Plus, RotateCcw, Send } from "lucide-react";
import { callLLM, callLLMStream, useLlmAvailable } from "../lib/llm";
import { asBool, asObjectArray, asString, asStringArray, extractJson } from "../lib/extract";
import { useSpeech } from "../lib/speech";
import { CountUp } from "../components/react-bits/count-up";

// Code-split: three.js adds ~800 kB raw. Only pay for it on this route.
const BlackHole = lazy(() => import("../components/react-bits/black-hole"));

const STORAGE_SESSION_KEY = "meduni-previsit-session";
const DB_NAME = "meduni-previsit";
const STORE = "sessions";

const SYSTEM_PROMPT = `You are a warm, empathetic pre-visit intake assistant for Dr. Anthropic's cardiology clinic. You speak plainly. Whenever you use a medical term the patient might not know (e.g. "concomitant", "arrhythmia", "hypertension", "dyspnea"), immediately give a one-line lay definition in parentheses the first time it appears. Your job is to collect five things: 1) consent to proceed, 2) the reason for the upcoming visit, 3) other medical conditions (concomitant), 4) current medications with doses, 5) allergies. Ask ONE short question per turn. If the patient says they don't know their medications, suggest they ask a family member. Do not give medical advice. When you have all five items, send a single closing message that begins with the exact phrase "All done" and briefly recaps what you collected.`;

const SUMMARY_SYSTEM = `You are summarising a pre-visit cardiology intake conversation for the consultant. Produce a single medical-grade paragraph (90-140 words) covering: the patient's stated reason for visit, concomitant conditions, current medications with doses, allergies. Use clinical phrasing. Do not invent details that weren't said. Do not add a heading. Output only the paragraph.`;

const CONSENT_QUESTION =
  "Hi — before your upcoming cardiology visit with Dr. Anthropic, I'd like to ask a few short questions. Is this your first visit to Dr. Anthropic?";

const FALLBACK_SCRIPT: ReadonlyArray<{ from: "ai" | "patient"; text: string }> = [
  { from: "ai", text: CONSENT_QUESTION },
  { from: "patient", text: "I've seen him before, about a year ago." },
  { from: "ai", text: "Thank you. What is the main reason for this visit?" },
  { from: "patient", text: "I've been having chest pain on and off." },
  {
    from: "ai",
    text: "I'm sorry to hear that. Do you have any other concomitant (a fancy word for other ongoing) medical conditions — for example diabetes, high blood pressure, or asthma?",
  },
  { from: "patient", text: "Yes, high blood pressure for about three years." },
  {
    from: "ai",
    text: "Could you tell me which medications you take and the doses, if you know them?",
  },
  {
    from: "patient",
    text: "Telmisartan 40 mg once a day, and amlodipine 5 mg once a day.",
  },
  { from: "ai", text: "And do you have any allergies to medications?" },
  { from: "patient", text: "None that I know of." },
  {
    from: "ai",
    text: "All done — I have your reason for visit, hypertension as a background condition, telmisartan 40 mg and amlodipine 5 mg as your current medications, and no known drug allergies. Thank you.",
  },
];

const GLOSSARY: ReadonlyArray<{ readonly term: string; readonly lay: string }> = [
  { term: "concomitant", lay: "other medical conditions you have at the same time." },
  { term: "hypertension", lay: "high blood pressure." },
  { term: "arrhythmia", lay: "an irregular or abnormal heart rhythm." },
  { term: "dyspnea", lay: "feeling short of breath." },
  { term: "angina", lay: "chest discomfort that comes with exertion." },
  { term: "syncope", lay: "a fainting episode." },
  { term: "ischemia", lay: "reduced blood flow to a part of the body." },
  { term: "tachycardia", lay: "a fast heartbeat." },
  { term: "bradycardia", lay: "a slow heartbeat." },
];

const COMMON_MEDS: ReadonlyArray<{ readonly name: string; readonly dose: string }> = [
  { name: "Telmisartan", dose: "40 mg" },
  { name: "Amlodipine", dose: "5 mg" },
  { name: "Bisoprolol", dose: "2.5 mg" },
  { name: "Atorvastatin", dose: "20 mg" },
  { name: "Aspirin", dose: "81 mg" },
  { name: "Metformin", dose: "500 mg" },
  { name: "Clopidogrel", dose: "75 mg" },
  { name: "Rivaroxaban", dose: "20 mg" },
  { name: "Apixaban", dose: "5 mg" },
  { name: "Ramipril", dose: "5 mg" },
];

interface ChatMessage {
  readonly id: number;
  readonly from: "ai" | "patient";
  readonly text: string;
}

interface MedItem {
  readonly name: string;
  readonly dose: string;
  readonly frequency: string;
}

interface Extracted {
  readonly consent: boolean | null;
  readonly reason: string;
  readonly concomitant: ReadonlyArray<string>;
  readonly meds: ReadonlyArray<MedItem>;
  readonly allergies: ReadonlyArray<string>;
}

const EMPTY_EXTRACT: Extracted = {
  consent: null,
  reason: "",
  concomitant: [],
  meds: [],
  allergies: [],
};

type SessionStatus =
  | { readonly state: "ready" }
  | { readonly state: "thinking" }
  | { readonly state: "ended"; readonly reason: "declined" | "completed" }
  | { readonly state: "fallback"; readonly cursor: number };

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadSessionId(): string {
  const existing = localStorage.getItem(STORAGE_SESSION_KEY);
  if (existing) return existing;
  const id = newSessionId();
  localStorage.setItem(STORAGE_SESSION_KEY, id);
  return id;
}

function isConsentDecline(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (!/\b(no|nope|nah|don'?t|stop|cancel|skip|not now)\b/.test(t)) return false;
  if (/\b(yes|yeah|sure|okay|ok|fine|alright)\b/.test(t)) return false;
  return true;
}

function isFinalAiMessage(text: string): boolean {
  return /^\s*all\s+done\b/i.test(text);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persistMessages(sessionId: string, msgs: ReadonlyArray<ChatMessage>): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(msgs, sessionId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    try {
      localStorage.setItem(`${STORAGE_SESSION_KEY}-msgs`, JSON.stringify(msgs));
    } catch {
      /* empty */
    }
  }
}

async function loadPersistedMessages(sessionId: string): Promise<ReadonlyArray<ChatMessage> | null> {
  try {
    const db = await openDb();
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(sessionId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (Array.isArray(value)) return value as ReadonlyArray<ChatMessage>;
    return null;
  } catch {
    return null;
  }
}

function validateExtract(raw: unknown): Extracted | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const reason = asString(r.reason) ?? "";
  const concomitant = asStringArray(r.concomitant) ?? [];
  const allergies = asStringArray(r.allergies) ?? [];
  const consent = asBool(r.consent);
  const meds =
    asObjectArray<MedItem>(r.meds, (item) => {
      const name = asString(item.name);
      if (!name) return null;
      return {
        name,
        dose: asString(item.dose) ?? "",
        frequency: asString(item.frequency) ?? "",
      };
    }) ?? [];
  return { consent, reason, concomitant, meds, allergies };
}

function dedupeMeds(a: ReadonlyArray<MedItem>, b: ReadonlyArray<MedItem>): ReadonlyArray<MedItem> {
  const out: MedItem[] = [...a];
  const key = (m: MedItem) => `${m.name.toLowerCase()}|${m.dose.toLowerCase()}`;
  const seen = new Set(out.map(key));
  for (const m of b) {
    if (!seen.has(key(m))) {
      out.push(m);
      seen.add(key(m));
    }
  }
  return out;
}

export function PreVisit() {
  const llmReady = useLlmAvailable();
  const sessionIdRef = useRef<string>(loadSessionId());
  const [messages, setMessages] = useState<ReadonlyArray<ChatMessage>>(() => [
    { id: 0, from: "ai", text: CONSENT_QUESTION },
  ]);
  const [draft, setDraft] = useState("");
  const [extracted, setExtracted] = useState<Extracted>(EMPTY_EXTRACT);
  const [status, setStatus] = useState<SessionStatus>(
    llmReady ? { state: "ready" } : { state: "fallback", cursor: 1 },
  );
  const [streamingText, setStreamingText] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [lang, setLang] = useState<"en-US" | "de-DE">("en-US");
  const endRef = useRef<HTMLDivElement | null>(null);
  const turnCountRef = useRef(0);
  const llmReadyRef = useRef(llmReady);
  llmReadyRef.current = llmReady;

  useEffect(() => {
    void loadPersistedMessages(sessionIdRef.current).then((m) => {
      if (m && m.length > 0) {
        setMessages(m);
        const lastAi = [...m].reverse().find((x) => x.from === "ai");
        if (lastAi && isFinalAiMessage(lastAi.text)) {
          setStatus({ state: "ended", reason: "completed" });
        }
      }
    });
  }, []);

  useEffect(() => {
    setStatus((cur) => {
      if (cur.state === "ended") return cur;
      if (llmReady) return cur.state === "fallback" ? { state: "ready" } : cur;
      if (cur.state === "ready" || cur.state === "thinking") {
        return { state: "fallback", cursor: Math.max(1, messages.length) };
      }
      return cur;
    });
  }, [llmReady, messages.length]);

  useEffect(() => {
    void persistMessages(sessionIdRef.current, messages);
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const speech = useSpeech({
    lang,
    onFinal: (text) =>
      setDraft((d) => (d.trim().length > 0 ? `${d} ${text}` : text)),
  });

  const runExtraction = useCallback(
    async (msgs: ReadonlyArray<ChatMessage>, manualMeds: ReadonlyArray<MedItem>) => {
      const transcript = msgs
        .map((m) => `${m.from === "ai" ? "Assistant" : "Patient"}: ${m.text}`)
        .join("\n");
      const r = await extractJson<Extracted>({
        system:
          'Extract structured intake fields from this pre-visit transcript. Use the schema {"consent":boolean|null,"reason":string,"concomitant":string[],"meds":[{"name":string,"dose":string,"frequency":string}],"allergies":string[]}. Use empty strings or empty arrays when nothing was stated. Do not infer details that were not explicitly mentioned.',
        user: transcript,
        validate: validateExtract,
        maxTokens: 400,
      });
      if (!r.ok) return;
      setExtracted({
        ...r.value,
        meds: dedupeMeds(r.value.meds, manualMeds),
      });
    },
    [],
  );

  const sendUserMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      if (status.state === "ended") return;

      const userMsg: ChatMessage = {
        id: messages.length,
        from: "patient",
        text,
      };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setDraft("");

      const isConsentTurn = messages.length === 1;
      if (isConsentTurn && isConsentDecline(text)) {
        const apology: ChatMessage = {
          id: nextMessages.length,
          from: "ai",
          text:
            "Of course — no problem at all. I won't ask any more questions. Your clinician will see you at your scheduled visit.",
        };
        setMessages([...nextMessages, apology]);
        setStatus({ state: "ended", reason: "declined" });
        return;
      }

      if (status.state === "fallback" || !llmReadyRef.current) {
        await advanceFallback(nextMessages);
        return;
      }

      setStatus({ state: "thinking" });
      try {
        let acc = "";
        let streamed = false;
        const chatTurns = nextMessages
          .slice(1)
          .map((m) => ({
            role: m.from === "ai" ? ("assistant" as const) : ("user" as const),
            content: m.text,
          }));
        for await (const piece of callLLMStream({
          system: SYSTEM_PROMPT,
          messages: chatTurns,
          maxTokens: 280,
          temperature: 0.4,
          stream: true,
        })) {
          streamed = true;
          acc += piece;
          setStreamingText(acc);
        }
        if (!streamed) {
          const r = await callLLM({
            system: SYSTEM_PROMPT,
            messages: chatTurns,
            maxTokens: 280,
            temperature: 0.4,
          });
          if (!r.ok) {
            fallbackAfterError(r.error ?? r.reason);
            return;
          }
          acc = r.text;
        }
        const aiMsg: ChatMessage = { id: nextMessages.length, from: "ai", text: acc.trim() };
        const finalMsgs = [...nextMessages, aiMsg];
        setMessages(finalMsgs);
        setStreamingText("");
        setStatus(
          isFinalAiMessage(aiMsg.text)
            ? { state: "ended", reason: "completed" }
            : { state: "ready" },
        );
        turnCountRef.current += 1;
        if (turnCountRef.current % 3 === 0 || isFinalAiMessage(aiMsg.text)) {
          void runExtraction(finalMsgs, extracted.meds);
        }
      } catch (e) {
        fallbackAfterError(e instanceof Error ? e.message : String(e));
      }

      function fallbackAfterError(reason: string) {
        const errMsg: ChatMessage = {
          id: nextMessages.length,
          from: "ai",
          text: `(LLM error · ${reason} — switching to fallback)`,
        };
        setMessages([...nextMessages, errMsg]);
        setStatus({ state: "fallback", cursor: nextMessages.length });
        setStreamingText("");
      }
    },
    [extracted.meds, messages, runExtraction, status.state],
  );

  const advanceFallback = useCallback(
    async (nextMessages: ReadonlyArray<ChatMessage>) => {
      const cursor = status.state === "fallback" ? status.cursor : nextMessages.length;
      const nextScripted = FALLBACK_SCRIPT.slice(cursor).find((s) => s.from === "ai");
      if (!nextScripted) {
        setStatus({ state: "ended", reason: "completed" });
        return;
      }
      const aiMsg: ChatMessage = {
        id: nextMessages.length,
        from: "ai",
        text: nextScripted.text,
      };
      const final = [...nextMessages, aiMsg];
      setMessages(final);
      const newCursor = FALLBACK_SCRIPT.indexOf(nextScripted) + 1;
      if (isFinalAiMessage(nextScripted.text)) {
        setStatus({ state: "ended", reason: "completed" });
        applyDeterministicExtract(final);
      } else {
        setStatus({ state: "fallback", cursor: newCursor });
      }
    },
    [status],
  );

  function applyDeterministicExtract(allMessages: ReadonlyArray<ChatMessage>) {
    const text = allMessages.map((m) => m.text).join(" ").toLowerCase();
    setExtracted((prev) => ({
      consent: true,
      reason: text.includes("chest pain") ? "Chest pain on and off" : prev.reason,
      concomitant: text.includes("blood pressure")
        ? ["Hypertension (~3 years)"]
        : prev.concomitant,
      meds: dedupeMeds(prev.meds, [
        { name: "Telmisartan", dose: "40 mg", frequency: "once daily" },
        { name: "Amlodipine", dose: "5 mg", frequency: "once daily" },
      ]),
      allergies: ["No known drug allergies"],
    }));
  }

  const importMed = useCallback((med: { readonly name: string; readonly dose: string }) => {
    setExtracted((prev) => ({
      ...prev,
      meds: dedupeMeds(prev.meds, [{ ...med, frequency: "once daily" }]),
    }));
  }, []);

  function restart() {
    sessionIdRef.current = newSessionId();
    localStorage.setItem(STORAGE_SESSION_KEY, sessionIdRef.current);
    setMessages([{ id: 0, from: "ai", text: CONSENT_QUESTION }]);
    setExtracted(EMPTY_EXTRACT);
    setStatus(llmReadyRef.current ? { state: "ready" } : { state: "fallback", cursor: 1 });
    setStreamingText("");
    setSummary(null);
    turnCountRef.current = 0;
  }

  async function generateSummary() {
    if (!llmReady) {
      setSummary(deterministicSummary(extracted));
      return;
    }
    setSummaryLoading(true);
    const transcript = messages
      .map((m) => `${m.from === "ai" ? "Assistant" : "Patient"}: ${m.text}`)
      .join("\n");
    const r = await callLLM({
      system: SUMMARY_SYSTEM,
      messages: [{ role: "user", content: transcript }],
      maxTokens: 280,
      temperature: 0,
    });
    setSummaryLoading(false);
    setSummary(r.ok ? r.text.trim() : deterministicSummary(extracted));
  }

  const sessionEnded = status.state === "ended";
  const speechSupported = speech.status.state !== "unsupported";

  const allReady = useMemo(
    () =>
      extracted.reason.length > 0 &&
      extracted.meds.length > 0 &&
      extracted.allergies.length > 0,
    [extracted],
  );

  return (
    <div className="space-y-6">
      {/* R3F's Canvas inlines position:relative, breaking BlackHole's own
          children slot — overlay siblings instead of passing via children. */}
      <header className="relative rounded-xl overflow-hidden border border-ink-200 dark:border-ink-800">
        <Suspense
          fallback={<div style={{ width: "100%", height: 240, background: "#050510" }} />}
        >
          <BlackHole
            width="100%"
            height={240}
            backgroundColor="#050510"
            speed={0.9}
            zoom={2.0}
            particleCount={14}
            orbSize={0.6}
            glow={0.09}
            contrast={3}
            mirrorSplits={3}
            warpEnabled
            distanceFade={0.5}
            colorSpeed={0.25}
          />
        </Suspense>
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, rgba(5,5,16,0.85) 0%, rgba(5,5,16,0.55) 45%, rgba(5,5,16,0) 75%)",
          }}
        />
        <div className="absolute inset-0 z-20 flex flex-col justify-end sm:flex-row sm:items-end sm:justify-between gap-3 p-6 pointer-events-none">
          <div className="max-w-xl">
            <h1
              className="text-3xl font-semibold text-white"
              style={{ textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}
            >
              PreVisit intake
            </h1>
            <p
              className="mt-1 text-sm text-white/90"
              style={{ textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}
            >
              Patient receives a link, talks to an empathetic AI, and arrives
              with a structured summary the consultant reads in 30 seconds.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
            <select
              id="previsit-lang"
              name="previsit-lang"
              aria-label="Voice language"
              value={lang}
              onChange={(e) => setLang(e.target.value as "en-US" | "de-DE")}
              className="text-xs border border-white/20 bg-white/10 text-white backdrop-blur-sm rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-white/40"
            >
              <option value="en-US" className="text-ink-900">Voice · English</option>
              <option value="de-DE" className="text-ink-900">Voice · Deutsch</option>
            </select>
            <button
              type="button"
              onClick={restart}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
            >
              <RotateCcw size={14} /> Restart
            </button>
          </div>
        </div>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
        <section className="space-y-3">
          <div className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-3">
            <ProgressBar extracted={extracted} />
          </div>
          <div
            className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-4 space-y-3 max-h-[26rem] overflow-y-auto"
            aria-live="polite"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.from === "ai" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                    m.from === "ai"
                      ? "bg-ink-100 dark:bg-ink-800 text-ink-800 dark:text-ink-100"
                      : "bg-teal-600 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400"
                  }`}
                >
                  {m.from === "ai" ? <GlossedText text={m.text} /> : m.text}
                </div>
              </div>
            ))}
            {status.state === "thinking" && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-3 py-2 rounded-lg bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200 text-sm whitespace-pre-wrap">
                  {streamingText ? (
                    <GlossedText text={streamingText} />
                  ) : (
                    <span className="inline-flex items-center gap-2 text-ink-500 dark:text-ink-400">
                      <span className="h-2 w-2 rounded-full bg-teal-600 dark:bg-teal-500 animate-pulse" />
                      Thinking…
                    </span>
                  )}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (status.state === "thinking") return;
              void sendUserMessage(draft);
            }}
            className="flex flex-wrap gap-2 items-start"
          >
            <textarea
              id="previsit-draft"
              name="previsit-draft"
              aria-label="Message"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={sessionEnded}
              rows={2}
              placeholder={
                sessionEnded
                  ? "Session ended."
                  : speech.interim
                    ? speech.interim
                    : "Type or use the mic to dictate…"
              }
              className="flex-1 rounded-md border border-ink-300 dark:border-ink-700 p-2 text-sm min-w-[14rem]"
            />
            <div className="flex flex-col gap-2">
              {speechSupported && (
                <button
                  type="button"
                  onClick={() =>
                    speech.status.state === "listening" ? speech.stop() : speech.start()
                  }
                  disabled={sessionEnded}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm border ${
                    speech.status.state === "listening"
                      ? "bg-rose-600 text-white border-rose-600 hover:bg-rose-700"
                      : "bg-white dark:bg-ink-900 text-ink-700 dark:text-ink-200 border-ink-300 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-800"
                  } disabled:opacity-50`}
                >
                  {speech.status.state === "listening" ? (
                    <>
                      <MicOff size={14} /> Stop
                    </>
                  ) : (
                    <>
                      <Mic size={14} /> Voice
                    </>
                  )}
                </button>
              )}
              <button
                type="submit"
                disabled={sessionEnded || draft.trim().length === 0 || status.state === "thinking"}
                className="inline-flex items-center gap-1.5 bg-teal-600 dark:bg-teal-500 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-teal-700 dark:hover:bg-teal-400 disabled:opacity-50"
              >
                <Send size={14} /> Send
              </button>
            </div>
          </form>

          {speech.status.state === "denied" && (
            <p className="text-xs text-rose-700">
              Microphone permission denied — voice input disabled.
            </p>
          )}
          {speech.status.state === "error" && (
            <p className="text-xs text-rose-700">
              Voice error: {speech.status.message}
            </p>
          )}
          {speech.interim && (
            <p className="text-xs text-ink-500 dark:text-ink-400 italic">…{speech.interim}</p>
          )}

          <section className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-4 space-y-2">
            <h2 className="font-semibold text-ink-800 dark:text-ink-100 text-sm">
              Medication-import module
            </h2>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              Patient (or spouse) taps common meds to add them to the doctor's
              summary directly.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_MEDS.map((m) => {
                const on = extracted.meds.some(
                  (x) =>
                    x.name.toLowerCase() === m.name.toLowerCase() &&
                    x.dose.toLowerCase() === m.dose.toLowerCase(),
                );
                return (
                  <button
                    key={`${m.name}-${m.dose}`}
                    type="button"
                    onClick={() => importMed(m)}
                    disabled={on}
                    className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border ${
                      on
                        ? "bg-teal-600 dark:bg-teal-500 text-white border-teal-600 dark:border-teal-400 cursor-default"
                        : "bg-white dark:bg-ink-900 text-ink-700 dark:text-ink-200 border-ink-300 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-800"
                    }`}
                  >
                    {!on && <Plus size={12} />}
                    {m.name} {m.dose}
                  </button>
                );
              })}
            </div>
          </section>
        </section>

        <aside className="space-y-3">
          <section className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-4 space-y-3 sticky top-4">
            <h2 className="font-semibold text-ink-800 dark:text-ink-100 text-sm">
              Live extraction
            </h2>
            <ExtractRow label="Consent">
              {extracted.consent === null ? (
                <span className="text-ink-500 dark:text-ink-400">—</span>
              ) : extracted.consent ? (
                <span className="text-emerald-700">granted</span>
              ) : (
                <span className="text-rose-700">declined</span>
              )}
            </ExtractRow>
            <ExtractRow label="Reason for visit">
              {extracted.reason || <span className="text-ink-500 dark:text-ink-400">—</span>}
            </ExtractRow>
            <ExtractRow label="Concomitant">
              {extracted.concomitant.length > 0 ? (
                <ul className="list-disc list-inside text-sm">
                  {extracted.concomitant.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-ink-500 dark:text-ink-400">—</span>
              )}
            </ExtractRow>
            <ExtractRow label="Medications">
              {extracted.meds.length > 0 ? (
                <ul className="text-sm space-y-0.5">
                  {extracted.meds.map((m) => (
                    <li key={`${m.name}-${m.dose}`}>
                      <span className="font-medium">{m.name}</span> {m.dose}
                      {m.frequency ? ` · ${m.frequency}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-ink-500 dark:text-ink-400">—</span>
              )}
            </ExtractRow>
            <ExtractRow label="Allergies">
              {extracted.allergies.length > 0 ? (
                <ul className="list-disc list-inside text-sm">
                  {extracted.allergies.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-ink-500 dark:text-ink-400">—</span>
              )}
            </ExtractRow>
            {sessionEnded && status.reason === "completed" && allReady && (
              <button
                type="button"
                onClick={generateSummary}
                disabled={summaryLoading}
                className="w-full inline-flex items-center justify-center gap-1.5 bg-teal-600 dark:bg-teal-500 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-teal-700 dark:hover:bg-teal-400 disabled:opacity-50"
              >
                {summaryLoading ? "Drafting…" : summary ? "Regenerate summary" : "Draft doctor summary"}
              </button>
            )}
          </section>
        </aside>
      </div>

      {summary && (
        <section className="rounded-lg border border-ink-200 dark:border-ink-800 bg-ink-50 dark:bg-ink-800/60 p-5 space-y-3 print-a4">
          <h2 className="font-semibold text-ink-900 dark:text-ink-100">
            Medical-grade summary · for the consultant
          </h2>
          <p className="text-sm text-ink-800 dark:text-ink-100 leading-relaxed">{summary}</p>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-md border border-ink-300 dark:border-ink-700 bg-white dark:bg-ink-900 hover:bg-ink-50 dark:hover:bg-ink-800"
            title="Visual only — would dispatch to EHR in a real deployment"
          >
            Send to doctor
          </button>
        </section>
      )}
    </div>
  );
}

function GlossedText({ text }: { readonly text: string }) {
  const pattern = new RegExp(
    `\\b(${GLOSSARY.map((g) => g.term).join("|")})\\b`,
    "gi",
  );
  const parts: Array<React.ReactNode> = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const start = m.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const matched = m[0] ?? "";
    if (!matched) continue;
    const entry = GLOSSARY.find(
      (g) => g.term.toLowerCase() === matched.toLowerCase(),
    );
    parts.push(
      <abbr
        key={`${matched}-${start}`}
        title={entry?.lay ?? ""}
        tabIndex={0}
        className="underline decoration-dotted decoration-teal-600 dark:decoration-teal-400 cursor-help"
      >
        {matched}
      </abbr>,
    );
    last = start + matched.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function ProgressBar({ extracted }: { readonly extracted: Extracted }) {
  const steps: ReadonlyArray<{ readonly label: string; readonly done: boolean }> = [
    { label: "Consent", done: extracted.consent === true },
    { label: "Reason", done: extracted.reason.length > 0 },
    { label: "History", done: extracted.concomitant.length > 0 },
    { label: "Meds", done: extracted.meds.length > 0 },
    { label: "Allergies", done: extracted.allergies.length > 0 },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const pct = (doneCount / steps.length) * 100;
  return (
    <div
      className="space-y-1.5"
      role="progressbar"
      aria-valuenow={doneCount}
      aria-valuemin={0}
      aria-valuemax={steps.length}
      aria-label="Pre-visit intake progress"
    >
      <div className="flex items-center justify-between text-xs text-ink-600 dark:text-ink-300">
        <span>
          Step {doneCount} of {steps.length}
        </span>
        <CountUp
          to={Math.round(pct)}
          duration={0.6}
          suffix="%"
          className="tabular-nums"
        />
      </div>
      <div className="h-1.5 w-full rounded-full bg-ink-200 dark:bg-ink-700 overflow-hidden">
        <div
          className="h-1.5 bg-teal-600 dark:bg-teal-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {steps.map((s) => (
          <span
            key={s.label}
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              s.done
                ? "bg-teal-50 border-teal-300 text-teal-800 dark:bg-teal-500/20 dark:border-teal-400 dark:text-teal-200"
                : "bg-ink-50 dark:bg-ink-800/60 border-ink-200 dark:border-ink-800 text-ink-500 dark:text-ink-400"
            }`}
          >
            {s.done ? "✓ " : ""}
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ExtractRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5 border-b border-ink-100 pb-2 last:border-b-0 last:pb-0">
      <div className="text-[10px] uppercase tracking-wide text-ink-500 dark:text-ink-400">
        {label}
      </div>
      <div className="text-sm text-ink-800 dark:text-ink-100">{children}</div>
    </div>
  );
}

function deterministicSummary(e: Extracted): string {
  const reason = e.reason || "Symptom not stated.";
  const concomitant =
    e.concomitant.length > 0
      ? `Relevant history: ${e.concomitant.join(", ")}.`
      : "No prior conditions reported.";
  const meds =
    e.meds.length > 0
      ? `Current medications: ${e.meds
          .map((m) => `${m.name} ${m.dose}${m.frequency ? ` ${m.frequency}` : ""}`)
          .join(", ")}.`
      : "No current medications reported.";
  const allergies =
    e.allergies.length > 0
      ? `Allergies: ${e.allergies.join(", ")}.`
      : "No known drug allergies.";
  return `Established cardiology patient. Presents with ${reason} ${concomitant} ${meds} ${allergies} Medication list confirmed during pre-visit intake; review at top of visit.`;
}
