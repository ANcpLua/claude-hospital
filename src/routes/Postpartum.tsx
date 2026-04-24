import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Copy, Download } from "lucide-react";
import { callLLM, callLLMStream, useLlmAvailable } from "../lib/llm";
import { POSTPARTUM_NOTES, POSTPARTUM_PATIENT } from "../data/postpartum-notes";
import { NoteCard, noteTypeLabel } from "../components/NoteCard";
import TextScatter from "../components/react-bits/text-scatter";

type View = "patient" | "id-consult";

interface RenderedView {
  readonly text: string;
  readonly sources: ReadonlyArray<string>;
  readonly sourcesParseFailed: boolean;
}

const PATIENT_SYSTEM = `You are an empathetic nurse-communicator. Given these clinical notes about ${POSTPARTUM_PATIENT.name}, write a 2 to 3 paragraph plain-language summary for the patient. Use 6th-grade vocabulary. Explain what happened, why she kept coming back, what they finally did, and what to watch for. End with a single line "Sources: [comma-separated note IDs you used]".`;

const ID_CONSULT_SYSTEM = `You are an infectious-disease attending writing a one-screen consult note. Given these clinical notes, output sections:
- Chief reason
- Key data (vitals, labs, microbiology — structured)
- Assessment (3 bullets)
- Plan (3 bullets)
Keep the whole note under 250 words. End with a single line "Sources: [comma-separated note IDs you used]".`;

function bundleNotes(): string {
  return POSTPARTUM_NOTES.map(
    (n) =>
      `--- ${n.id} | ${noteTypeLabel(n.type)} | ${n.timestamp} | ${n.author} ---\n${n.body}`,
  ).join("\n\n");
}

function parseSources(raw: string): RenderedView {
  const re = /^\s*Sources?\s*:\s*(.+?)\s*$/im;
  const match = raw.match(re);
  if (!match) {
    return { text: raw.trim(), sources: [], sourcesParseFailed: true };
  }
  const ids = match[1]
    .split(/[,\s]+/)
    .map((s) => s.trim().replace(/[^\w-]/g, ""))
    .filter((s) => /^n\d{2}$/.test(s));
  const text = raw.replace(re, "").trim();
  const valid = ids.filter((id) => POSTPARTUM_NOTES.some((n) => n.id === id));
  return { text, sources: valid, sourcesParseFailed: ids.length === 0 };
}

type ViewState =
  | { readonly status: "idle" }
  | { readonly status: "streaming"; readonly partial: string }
  | { readonly status: "ready"; readonly rendered: RenderedView }
  | { readonly status: "error"; readonly message: string };

const CACHE_KEY = "meduni-postpartum-cache-v1";

function loadCache(): Partial<Record<View, RenderedView>> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<View, RenderedView>>) : {};
  } catch {
    return {};
  }
}

function saveCache(c: Partial<Record<View, RenderedView>>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* empty */
  }
}

const FEVER_MENTIONS = POSTPARTUM_NOTES.filter((n) =>
  /fever|temp|\b38\.|\b39\.|\b40\./i.test(n.body),
).length;
const ED_VISITS = POSTPARTUM_NOTES.filter((n) => n.type === "ed-physician").length;

export function Postpartum() {
  const [view, setView] = useState<View>("patient");
  const [notesOpen, setNotesOpen] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [cache, setCache] = useState<Partial<Record<View, RenderedView>>>(loadCache);
  const [state, setState] = useState<ViewState>({ status: "idle" });
  const noteRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const llmReady = useLlmAvailable();

  const cached = cache[view];

  const startGeneration = useCallback(
    async (which: View) => {
      const system = which === "patient" ? PATIENT_SYSTEM : ID_CONSULT_SYSTEM;
      const userMessage = `Patient: ${POSTPARTUM_PATIENT.name}, DOB ${POSTPARTUM_PATIENT.dob}.\nDelivered: ${POSTPARTUM_PATIENT.delivered}.\n\nClinical notes (${POSTPARTUM_NOTES.length} records):\n\n${bundleNotes()}\n\nWrite the requested view now. Cite the note IDs you used.`;
      setState({ status: "streaming", partial: "" });
      try {
        let acc = "";
        let streamed = false;
        for await (const piece of callLLMStream({
          system,
          messages: [{ role: "user", content: userMessage }],
          maxTokens: 700,
          temperature: 0.2,
          stream: true,
        })) {
          streamed = true;
          acc += piece;
          setState({ status: "streaming", partial: acc });
        }
        if (!streamed) {
          const r = await callLLM({
            system,
            messages: [{ role: "user", content: userMessage }],
            maxTokens: 700,
            temperature: 0.2,
          });
          if (!r.ok) {
            setState({ status: "error", message: r.error ?? r.reason });
            return;
          }
          acc = r.text;
        }
        const rendered = parseSources(acc);
        setCache((prev) => {
          const next = { ...prev, [which]: rendered };
          saveCache(next);
          return next;
        });
        setState({ status: "ready", rendered });
      } catch (e) {
        setState({
          status: "error",
          message: e instanceof Error ? e.message : typeof e === "string" ? e : "stream failed",
        });
      }
    },
    [],
  );

  useEffect(() => {
    setState(cached ? { status: "ready", rendered: cached } : { status: "idle" });
  }, [view, cached]);

  function toggleNote(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function focusSource(id: string) {
    setNotesOpen(true);
    setExpanded((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    setHighlightId(id);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        noteRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
    setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 1500);
  }

  function viewMarkdown(): string {
    const r = state.status === "ready" ? state.rendered : (cached ?? null);
    if (!r) return "";
    const head = view === "patient" ? "# Patient view" : "# ID consult";
    const sources = r.sources.length ? `\n\n_Sources: ${r.sources.join(", ")}_` : "";
    return `${head}\n\n${r.text}${sources}\n`;
  }

  function copyMarkdown() {
    void navigator.clipboard.writeText(viewMarkdown());
  }

  function downloadMarkdown() {
    const blob = new Blob([viewMarkdown()], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      view === "patient"
        ? "postpartum-patient-view.md"
        : "postpartum-id-consult.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <header className="relative overflow-hidden rounded-lg border border-rose-200 dark:border-rose-900/60 bg-gradient-to-br from-rose-50 via-cream-50 to-amber-50 dark:from-rose-950/50 dark:via-ink-950 dark:to-amber-950/40 p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-6 -right-6 h-40 w-40 rounded-full bg-rose-400/20 blur-3xl"
        />
        <p className="text-[11px] uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300 font-medium">
          ER bounce-back · PP day 7
        </p>
        <TextScatter
          text={POSTPARTUM_PATIENT.name}
          as="h1"
          className="display text-4xl sm:text-5xl font-semibold tracking-tight text-ink-900 dark:text-ink-100 select-none cursor-crosshair"
          velocity={260}
          rotation={110}
          returnAfter={0.8}
          duration={1.6}
        />
        <p className="mt-2 max-w-2xl text-sm text-ink-600 dark:text-ink-300">
          25 synthetic notes across {ED_VISITS} ED visits and {FEVER_MENTIONS} fever
          mentions, collapsed into a patient-readable summary and an ID-consult
          surfacing. Hover the name — the chaos of a bounce-back is the point.
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-500 dark:text-ink-400 text-xs uppercase tracking-wide">
              Delivered
            </dt>
            <dd className="font-medium text-ink-800 dark:text-ink-100 tabular-nums">
              {POSTPARTUM_PATIENT.delivered}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-500 dark:text-ink-400 text-xs uppercase tracking-wide">
              DOB
            </dt>
            <dd className="font-medium text-ink-800 dark:text-ink-100 tabular-nums">
              {POSTPARTUM_PATIENT.dob}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-500 dark:text-ink-400 text-xs uppercase tracking-wide">
              Notes
            </dt>
            <dd className="font-medium text-ink-800 dark:text-ink-100 tabular-nums">
              {POSTPARTUM_NOTES.length}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-500 dark:text-ink-400 text-xs uppercase tracking-wide">
              Span
            </dt>
            <dd className="font-medium text-ink-800 dark:text-ink-100 tabular-nums">
              11 d
            </dd>
          </div>
        </dl>
      </header>

      <section
        aria-label="Summary"
        className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 space-y-5"
      >
        <nav
          role="tablist"
          aria-label="Summary view"
          className="flex gap-1 rounded-md border border-ink-200 dark:border-ink-700 p-1 bg-cream-50 dark:bg-ink-950 w-fit"
        >
          {(
            [
              ["patient", "Patient view"],
              ["id-consult", "ID consult"],
            ] as ReadonlyArray<readonly [View, string]>
          ).map(([k, label]) => {
            const active = view === k;
            return (
              <button
                key={k}
                role="tab"
                aria-selected={active}
                onClick={() => setView(k)}
                className={`px-4 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                  active
                    ? "bg-teal-600 text-white shadow-sm dark:bg-teal-500"
                    : "text-ink-600 dark:text-ink-300 hover:text-ink-900 dark:hover:text-ink-100"
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {state.status === "idle" && (
          <div className="rounded-md border border-dashed border-ink-300 dark:border-ink-700 px-4 py-6 text-center space-y-3">
            <p className="text-sm text-ink-600 dark:text-ink-300">
              No summary cached for this view yet.
            </p>
            <button
              type="button"
              disabled={!llmReady}
              onClick={() => void startGeneration(view)}
              className="inline-flex items-center gap-1.5 bg-teal-600 dark:bg-teal-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-teal-700 dark:hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Generate with Gemini
            </button>
            {!llmReady && (
              <p className="text-xs text-ink-500 dark:text-ink-400">
                Configure a key in Settings first.
              </p>
            )}
          </div>
        )}

        {state.status !== "idle" && <SummaryBody view={view} state={state} />}

        {state.status === "ready" && state.rendered.sources.length > 0 && (
          <SourceChips
            sources={state.rendered.sources}
            onClick={focusSource}
          />
        )}
        {state.status === "ready" && state.rendered.sourcesParseFailed && (
          <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-900 rounded px-2 py-1">
            Sources didn't parse — the summary may be unreliable.
          </div>
        )}

        {state.status === "ready" && (
          <div className="flex gap-2 flex-wrap pt-2 border-t border-ink-100 dark:border-ink-800">
            <button
              type="button"
              onClick={copyMarkdown}
              className="inline-flex items-center gap-1.5 border border-ink-300 dark:border-ink-700 bg-white dark:bg-ink-900 text-ink-700 dark:text-ink-200 px-3 py-1.5 rounded-md text-sm hover:bg-ink-50 dark:hover:bg-ink-800 cursor-pointer"
            >
              <Copy size={14} /> Copy markdown
            </button>
            <button
              type="button"
              onClick={downloadMarkdown}
              className="inline-flex items-center gap-1.5 border border-ink-300 dark:border-ink-700 bg-white dark:bg-ink-900 text-ink-700 dark:text-ink-200 px-3 py-1.5 rounded-md text-sm hover:bg-ink-50 dark:hover:bg-ink-800 cursor-pointer"
            >
              <Download size={14} /> Download .md
            </button>
            <button
              type="button"
              onClick={() => {
                setCache((prev) => {
                  const next = { ...prev };
                  delete next[view];
                  saveCache(next);
                  return next;
                });
                setState({ status: "idle" });
              }}
              className="ml-auto text-sm text-teal-700 dark:text-teal-300 hover:underline cursor-pointer"
              title="Clears the cached summary; click Generate to re-run."
            >
              Clear cache
            </button>
          </div>
        )}
      </section>

      <section aria-label="Source notes">
        <button
          type="button"
          onClick={() => setNotesOpen((o) => !o)}
          aria-expanded={notesOpen}
          className="w-full flex items-center gap-2 px-4 py-3 rounded-md border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 hover:bg-cream-100 dark:hover:bg-ink-800 transition-colors cursor-pointer text-left"
        >
          <ChevronRight
            size={16}
            className={`transition-transform text-ink-500 dark:text-ink-400 ${
              notesOpen ? "rotate-90" : ""
            }`}
          />
          <span className="font-medium text-ink-800 dark:text-ink-100">
            {notesOpen ? "Hide" : "Show"} 25 source notes
          </span>
          <span className="ml-auto text-xs text-ink-500 dark:text-ink-400">
            Nursing · H&amp;P · ED · Labs · OB · Pharmacy · Discharge
          </span>
        </button>

        {notesOpen && (
          <ul className="mt-3 space-y-2">
            {POSTPARTUM_NOTES.map((n) => (
              <NoteCard
                key={n.id}
                ref={(el) => {
                  if (el) noteRefs.current.set(n.id, el);
                  else noteRefs.current.delete(n.id);
                }}
                note={n}
                expanded={expanded.has(n.id)}
                highlight={highlightId === n.id}
                onToggle={() => toggleNote(n.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SummaryBody({ view, state }: { readonly view: View; readonly state: ViewState }) {
  const proseBase =
    view === "patient"
      ? "prose-patient text-ink-800 dark:text-ink-100"
      : "text-[15px] leading-[1.65] text-ink-800 dark:text-ink-100 font-mono whitespace-pre-wrap";

  if (state.status === "idle") {
    return (
      <p className="text-sm text-ink-500 dark:text-ink-400 italic">
        Preparing summary…
      </p>
    );
  }

  if (state.status === "streaming") {
    return (
      <div className="space-y-2">
        <div className="text-xs caption text-teal-700 dark:text-teal-400 inline-flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-600 dark:bg-teal-400 animate-pulse" />
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-600 dark:bg-teal-400 animate-pulse [animation-delay:200ms]" />
          Writing…
        </div>
        <div className={`${proseBase} whitespace-pre-wrap`}>
          {state.partial || " "}
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="text-sm text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-900 rounded px-3 py-2">
        {state.message}
      </div>
    );
  }

  return (
    <div className={`${proseBase} whitespace-pre-wrap max-w-[62ch]`}>
      {state.rendered.text}
    </div>
  );
}

function SourceChips({
  sources,
  onClick,
}: {
  readonly sources: ReadonlyArray<string>;
  readonly onClick: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="caption text-ink-500 dark:text-ink-400">Sources</div>
      <ul className="flex gap-1.5 flex-wrap">
        {sources.map((id) => {
          const note = POSTPARTUM_NOTES.find((n) => n.id === id);
          const label = note ? noteTypeLabel(note.type) : "note";
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onClick(id)}
                title={note ? `${label} · ${note.timestamp}` : id}
                className="mono text-xs px-2 py-1 rounded-md bg-teal-600/10 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300 hover:bg-teal-600/15 dark:hover:bg-teal-400/25 transition-colors cursor-pointer"
              >
                {id}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
