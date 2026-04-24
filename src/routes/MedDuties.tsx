import {useEffect, useMemo, useState} from "react";
import {Calendar, Download, Send} from "lucide-react";
import {
    applyIntent,
    type Assignment,
    autoBalance,
    type Doc,
    generateSchedule,
    googleCalendarLink,
    type IntentOp,
    parseIntentRegex,
    scheduleStats,
    SHIFTS,
    type Weekday,
    type Wish,
} from "../lib/scheduler";
import {extractJson} from "../lib/extract";
import {WishCalendar} from "../components/WishCalendar";

const DOCS: ReadonlyArray<Doc> = [
    {id: "walker", name: "Dr. Walker"},
    {id: "nedoszytko", name: "Dr. Nedoszytko"},
    {id: "hollman", name: "Dr. Hollman"},
    {id: "gebauer", name: "Dr. Gebauer"},
];

const FIRST_DOC_ID = DOCS[0]?.id ?? "walker";

const WEEKDAY_SET: ReadonlySet<string> = new Set([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]);

const STORAGE_KEY = "meduni-medduties-wishes";

interface PersistedState {
    readonly version: 1;
    readonly wishes: ReadonlyArray<Wish>;
}

const SEED_WISHES: ReadonlyArray<Wish> = [
    {docId: "walker", avoidDays: [5, 6, 12, 13, 19, 20, 26, 27], reluctantDays: [8, 9], blockedShifts: []},
    {docId: "nedoszytko", avoidDays: [1, 2, 3, 4], reluctantDays: [], blockedShifts: []},
    {docId: "hollman", avoidDays: [15, 16], reluctantDays: [22, 23], blockedShifts: []},
    {docId: "gebauer", avoidDays: [], reluctantDays: [28, 29], blockedShifts: []},
];

function loadWishes(): ReadonlyArray<Wish> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return SEED_WISHES;
        const parsed = JSON.parse(raw) as PersistedState;
        if (parsed.version !== 1 || !Array.isArray(parsed.wishes)) return SEED_WISHES;
        return parsed.wishes;
    } catch {
        return SEED_WISHES;
    }
}

const INTENT_SYSTEM = `You are a scheduling intent parser. Convert the user's natural-language scheduling instruction into a single JSON object.
Allowed shapes:
{"op":"give_all","docId":string,"weekday":"monday"|"tuesday"|"wednesday"|"thursday"|"friday"|"saturday"|"sunday"}
{"op":"swap","docIdA":string,"docIdB":string,"day":number?}   // day optional: omit to swap them on every shift in the month
{"op":"block","docId":string,"shift":"day"|"night"|"weekend"}
{"op":"assign_only","docId":string,"shift":"day"|"night"|"weekend"}
{"op":"unknown"}
Use ONLY the docId values from this list (lowercase): walker, nedoszytko, hollman, gebauer.`;

function validateIntent(raw: unknown): IntentOp | null {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const op = typeof r.op === "string" ? r.op : "";
    switch (op) {
        case "give_all": {
            if (typeof r.docId === "string" && typeof r.weekday === "string") {
                const wd = r.weekday.toLowerCase();
                if (WEEKDAY_SET.has(wd)) {
                    return {op: "give_all", docId: r.docId.toLowerCase(), weekday: wd as Weekday};
                }
            }
            return {op: "unknown"};
        }
        case "swap": {
            if (typeof r.docIdA === "string" && typeof r.docIdB === "string") {
                const day = typeof r.day === "number" && Number.isFinite(r.day) ? r.day : undefined;
                return {
                    op: "swap",
                    docIdA: r.docIdA.toLowerCase(),
                    docIdB: r.docIdB.toLowerCase(),
                    ...(day !== undefined ? {day} : {}),
                };
            }
            return {op: "unknown"};
        }
        case "block":
        case "assign_only": {
            if (typeof r.docId === "string" && typeof r.shift === "string") {
                const sh = r.shift.toLowerCase();
                if (sh === "day" || sh === "night" || sh === "weekend") {
                    return {op, docId: r.docId.toLowerCase(), shift: sh};
                }
            }
            return {op: "unknown"};
        }
        default:
            return {op: "unknown"};
    }
}

function todayMonth(): { readonly year: number; readonly month: number } {
    const d = new Date();
    return {year: d.getFullYear(), month: d.getMonth() + 1};
}

export function MedDuties() {
    const [{year, month}, setMonth] = useState(todayMonth());
    const [wishes, setWishes] = useState<ReadonlyArray<Wish>>(loadWishes);
    const [activeDocId, setActiveDocId] = useState<string>(FIRST_DOC_ID);
    const [assignments, setAssignments] = useState<ReadonlyArray<Assignment>>([]);
    const [log, setLog] = useState<ReadonlyArray<string>>([]);
    const [command, setCommand] = useState("");
    const [parsing, setParsing] = useState(false);

    const stats = useMemo(() => scheduleStats(DOCS, assignments), [assignments]);
    const spec = useMemo(() => ({year, month}), [year, month]);
    const activeWish = useMemo(
        () =>
            wishes.find((w) => w.docId === activeDocId) ?? {
                docId: activeDocId,
                avoidDays: [],
                reluctantDays: [],
                blockedShifts: [],
            },
        [wishes, activeDocId],
    );

    useEffect(() => {
        try {
            const payload: PersistedState = {version: 1, wishes};
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
            /* empty */
        }
    }, [wishes]);

    function generate() {
        const list = generateSchedule(spec, DOCS, wishes);
        setAssignments(list);
        setLog((l) => [...l, `Schedule generated for ${year}-${String(month).padStart(2, "0")}.`]);
    }

    function rebalance() {
        if (assignments.length === 0) return;
        const next = autoBalance(DOCS, wishes, assignments);
        setAssignments(next);
        const after = scheduleStats(DOCS, next);
        setLog((l) => [...l, `Auto-balance applied · spread now ${after.spread}.`]);
    }

    async function applyCommand(raw: string) {
        if (!raw.trim()) return;
        let intent: IntentOp = parseIntentRegex(raw, DOCS);
        if (intent.op === "unknown") {
            setParsing(true);
            const r = await extractJson<IntentOp>({
                system: INTENT_SYSTEM,
                user: raw,
                validate: validateIntent,
                maxTokens: 120,
            });
            setParsing(false);
            if (r.ok) intent = r.value;
        }
        if (intent.op === "unknown") {
            setLog((l) => [...l, `Not understood: "${raw}".`]);
            setCommand("");
            return;
        }
        if (assignments.length === 0) {
            setAssignments(generateSchedule(spec, DOCS, wishes));
        }
        const baseline =
            assignments.length === 0 ? generateSchedule(spec, DOCS, wishes) : assignments;
        const result = applyIntent(intent, spec, DOCS, wishes, baseline);
        setAssignments(result.assignments);
        setWishes(result.wishes);
        setLog((l) => [...l, `Applied · ${result.description}`]);
        setCommand("");
    }

    const byDay = useMemo(() => {
        const m = new Map<number, Assignment[]>();
        for (const a of assignments) {
            const arr = m.get(a.day) ?? [];
            arr.push(a);
            m.set(a.day, arr);
        }
        return m;
    }, [assignments]);

    function downloadIcs() {
        const pad = (n: number) => n.toString().padStart(2, "0");
        const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MedDuties//EN"];
        for (const a of assignments) {
            const doc = DOCS.find((d) => d.id === a.docId);
            const ymd = `${year}${pad(month)}${pad(a.day)}`;
            const start = a.shift === "night" ? "T200000" : "T080000";
            const endDay = a.shift === "night" ? a.day + 1 : a.day;
            const endYmd = `${year}${pad(month)}${pad(endDay)}`;
            const end = a.shift === "night" ? "T080000" : "T200000";
            lines.push(
                "BEGIN:VEVENT",
                `UID:${year}${pad(month)}-${a.day}-${a.shift}-${a.docId}@medduties.demo`,
                `DTSTART:${ymd}${start}`,
                `DTEND:${endYmd}${end}`,
                `SUMMARY:${doc?.name ?? ""} — ${a.shift}`,
                "END:VEVENT",
            );
        }
        lines.push("END:VCALENDAR");
        const blob = new Blob([lines.join("\r\n")], {type: "text/calendar"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `medduties-${year}-${pad(month)}.ics`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function shiftMonth(delta: number) {
        const total = (year * 12 + (month - 1)) + delta;
        setMonth({year: Math.floor(total / 12), month: (total % 12) + 1});
        setAssignments([]);
    }

    return (
        <div className="space-y-6">
            <header className="flex items-start flex-wrap justify-between gap-3 border-l-4 border-indigo-500 pl-4">
                <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-indigo-700 dark:text-indigo-300 font-medium">
                        On-call rota · deterministic solver + LLM conversational layer
                    </p>
                    <h1 className="display text-3xl sm:text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-100">
                        MedDuties
                    </h1>
                    <p className="max-w-xl text-sm text-ink-600 dark:text-ink-300">
                        Paint a doctor's <em>avoid</em> and <em>reluctant</em> days onto the
                        calendar, hit <kbd
                        className="px-1 py-0.5 text-[10px] rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800">Generate</kbd>,
                        then talk to the schedule in plain language. Wishes carry across months.
                    </p>
                </div>
                <div className="flex items-center gap-1 text-sm">
                    <button
                        type="button"
                        onClick={() => shiftMonth(-1)}
                        className="px-2 py-1 border border-ink-300 dark:border-ink-700 rounded-md hover:bg-ink-50 dark:hover:bg-ink-800"
                        aria-label="Previous month"
                    >
                        ‹
                    </button>
                    <span
                        className="px-3 py-1 border border-ink-300 dark:border-ink-700 rounded-md bg-white dark:bg-ink-900 tabular-nums">
            {year}-{String(month).padStart(2, "0")}
          </span>
                    <button
                        type="button"
                        onClick={() => shiftMonth(1)}
                        className="px-2 py-1 border border-ink-300 dark:border-ink-700 rounded-md hover:bg-ink-50 dark:hover:bg-ink-800"
                        aria-label="Next month"
                    >
                        ›
                    </button>
                </div>
            </header>

            <section
                className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <h2 className="font-semibold text-ink-800 dark:text-ink-100 text-sm">Staff wishes</h2>
                    <div className="flex gap-1 flex-wrap text-xs">
                        {DOCS.map((d) => (
                            <button
                                key={d.id}
                                type="button"
                                onClick={() => setActiveDocId(d.id)}
                                aria-pressed={activeDocId === d.id}
                                className={`px-2 py-1 rounded border ${
                                    activeDocId === d.id
                                        ? "bg-teal-600 dark:bg-teal-500 text-white border-teal-600 dark:border-teal-400"
                                        : "bg-white dark:bg-ink-900 text-ink-700 dark:text-ink-200 border-ink-300 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-800"
                                }`}
                            >
                                {d.name}
                            </button>
                        ))}
                    </div>
                </div>

                <WishCalendar
                    year={year}
                    month={month}
                    avoidDays={activeWish.avoidDays}
                    reluctantDays={activeWish.reluctantDays}
                    onChange={(next) => {
                        setWishes((prev) => {
                            const others = prev.filter((w) => w.docId !== activeDocId);
                            return [
                                ...others,
                                {
                                    docId: activeDocId,
                                    avoidDays: next.avoidDays,
                                    reluctantDays: next.reluctantDays,
                                    blockedShifts: activeWish.blockedShifts ?? [],
                                },
                            ];
                        });
                    }}
                />

                {activeWish.blockedShifts && activeWish.blockedShifts.length > 0 && (
                    <div className="text-xs text-ink-600 dark:text-ink-300">
                        Blocked shifts:{" "}
                        {activeWish.blockedShifts.map((s) => (
                            <span
                                key={s}
                                className="inline-flex items-center gap-1 mr-1 px-2 py-0.5 rounded border border-ink-300 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/60"
                            >
                {s}
              </span>
                        ))}
                    </div>
                )}

                <div className="pt-1">
                    <button
                        type="button"
                        onClick={generate}
                        className="bg-teal-600 dark:bg-teal-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-teal-700 dark:hover:bg-teal-400"
                    >
                        Generate schedule
                    </button>
                </div>
            </section>

            {assignments.length > 0 && (
                <>
                    <section
                        className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-4 space-y-3">
                        <div className="flex items-baseline justify-between gap-3 flex-wrap">
                            <h2 className="font-semibold text-ink-800 dark:text-ink-100 text-sm">
                                Equilibrium · shifts per doctor
                            </h2>
                            <div className="text-xs text-ink-500 dark:text-ink-400">
                                mean {stats.mean.toFixed(1)} · spread {stats.spread}
                            </div>
                        </div>
                        {stats.spread > 3 && (
                            <div
                                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex items-center justify-between gap-2 flex-wrap">
                <span>
                  Spread is {stats.spread} — load is uneven. Try auto-balance.
                </span>
                                <button
                                    type="button"
                                    onClick={rebalance}
                                    className="text-xs px-3 py-1 rounded-md bg-amber-700 text-white hover:bg-amber-800"
                                >
                                    Auto-balance
                                </button>
                            </div>
                        )}
                        <ul className="space-y-1 text-sm">
                            {DOCS.map((d) => {
                                const c = stats.counts.get(d.id) ?? 0;
                                const pct = stats.mean > 0 ? Math.min(100, (c / (stats.mean * 2)) * 100) : 0;
                                return (
                                    <li key={d.id} className="flex items-center gap-3">
                                        <span className="w-36 shrink-0">{d.name}</span>
                                        <span className="flex-1 bg-ink-100 dark:bg-ink-800 rounded h-2 overflow-hidden">
                      <span
                          className="block h-2 rounded bg-teal-600 dark:bg-teal-500"
                          style={{width: `${pct}%`}}
                      />
                    </span>
                                        <span
                                            className="tabular-nums text-xs text-ink-600 dark:text-ink-300 w-10 text-right">
                      {c}
                    </span>
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="pt-1 flex gap-2 flex-wrap">
                            <button
                                type="button"
                                onClick={downloadIcs}
                                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-ink-300 dark:border-ink-700 bg-white dark:bg-ink-900 hover:bg-ink-50 dark:hover:bg-ink-800"
                            >
                                <Download size={14}/> .ics export
                            </button>
                            <details className="text-sm">
                                <summary
                                    className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-ink-300 dark:border-ink-700 bg-white dark:bg-ink-900 hover:bg-ink-50 dark:hover:bg-ink-800">
                                    <Calendar size={14}/> Google Calendar links
                                </summary>
                                <ul className="mt-2 max-h-48 overflow-y-auto text-xs space-y-1 border border-ink-200 dark:border-ink-800 rounded-md p-2 bg-ink-50 dark:bg-ink-800/60">
                                    {assignments.map((a) => {
                                        const doc = DOCS.find((d) => d.id === a.docId);
                                        if (!doc) return null;
                                        return (
                                            <li key={`${a.day}-${a.shift}-${a.docId}`}>
                                                <a
                                                    href={googleCalendarLink(spec, a, doc)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-teal-700 dark:text-teal-400 underline underline-offset-2"
                                                >
                                                    Day {a.day} · {a.shift} · {doc.name}
                                                </a>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </details>
                        </div>
                    </section>

                    <section
                        className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-4 overflow-x-auto">
                        <h2 className="font-semibold text-ink-800 dark:text-ink-100 text-sm mb-3">
                            Month view (day / night / weekend)
                        </h2>
                        <table className="w-full text-xs">
                            <thead>
                            <tr className="text-ink-500 dark:text-ink-400">
                                <th className="text-left w-12">Day</th>
                                {SHIFTS.map((s) => (
                                    <th
                                        key={s}
                                        className="text-left px-2 uppercase tracking-wide"
                                    >
                                        {s}
                                    </th>
                                ))}
                            </tr>
                            </thead>
                            <tbody>
                            {Array.from({length: byDay.size}, (_, i) => i + 1).map((d) => {
                                const slots = byDay.get(d) ?? [];
                                return (
                                    <tr key={d} className="border-t border-ink-100">
                                        <td className="py-1.5 text-ink-500 dark:text-ink-400 tabular-nums">{d}</td>
                                        {SHIFTS.map((s) => {
                                            const a = slots.find((x) => x.shift === s);
                                            if (!a) return <td key={s} className="px-2 text-ink-300">—</td>;
                                            const doc = DOCS.find((x) => x.id === a.docId);
                                            return (
                                                <td key={s} className="px-2">
                            <span className="inline-block bg-ink-100 dark:bg-ink-800 rounded px-1.5 py-0.5">
                              {doc?.name.replace("Dr. ", "")}
                            </span>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </section>
                </>
            )}

            <section
                className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-4 space-y-2">
                <h2 className="font-semibold text-ink-800 dark:text-ink-100 text-sm">
                    Conversational layer
                </h2>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void applyCommand(command);
                    }}
                    className="flex gap-2"
                >
                    <input
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        placeholder='e.g. "swap walker and nedoszytko on the 15th" · "block gebauer from night shifts"'
                        className="flex-1 rounded-md border border-ink-300 dark:border-ink-700 p-2 text-sm"
                    />
                    <button
                        type="submit"
                        disabled={parsing}
                        className="inline-flex items-center gap-1.5 bg-teal-600 dark:bg-teal-500 text-white px-3 py-2 rounded-md text-sm disabled:opacity-50"
                    >
                        <Send size={14}/> {parsing ? "Parsing…" : "Apply"}
                    </button>
                </form>
                {log.length > 0 && (
                    <ul className="max-h-48 overflow-y-auto space-y-1 mt-2 border-t border-ink-100 dark:border-ink-800 pt-2">
                        {log.slice(-12).map((l, i) => (
                            <li
                                key={`${i}-${l}`}
                                className="text-xs text-ink-500 dark:text-ink-400 leading-snug"
                            >
                                · {l}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
