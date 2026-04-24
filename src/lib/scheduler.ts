export type Shift = "day" | "night" | "weekend";

export interface Doc {
    readonly id: string;
    readonly name: string;
}

export interface Wish {
    readonly docId: string;
    readonly avoidDays: ReadonlyArray<number>;
    readonly reluctantDays: ReadonlyArray<number>;
    readonly blockedShifts?: ReadonlyArray<Shift>;
}

export interface Assignment {
    readonly day: number;
    readonly shift: Shift;
    readonly docId: string;
}

export const SHIFTS: ReadonlyArray<Shift> = ["day", "night", "weekend"];

const AVOID_PENALTY = 1000;
const RELUCTANT_PENALTY = 5;
const BLOCK_PENALTY = 5000;

interface MonthSpec {
    readonly year: number;
    readonly month: number;
}

export function daysInMonth(spec: MonthSpec): number {
    return new Date(spec.year, spec.month, 0).getDate();
}

export function isWeekend(spec: MonthSpec, day: number): boolean {
    const d = new Date(spec.year, spec.month - 1, day).getDay();
    return d === 0 || d === 6;
}

export function generateSchedule(
    spec: MonthSpec,
    docs: ReadonlyArray<Doc>,
    wishes: ReadonlyArray<Wish>,
): ReadonlyArray<Assignment> {
    const list: Assignment[] = [];
    const loadCount = new Map<string, number>(docs.map((d) => [d.id, 0]));
    const days = daysInMonth(spec);
    for (let day = 1; day <= days; day++) {
        const shiftSet: ReadonlyArray<Shift> = isWeekend(spec, day) ? ["weekend"] : ["day", "night"];
        for (const shift of shiftSet) {
            const scored = docs
                .map((d) => {
                    const w = wishes.find((x) => x.docId === d.id);
                    const avoid = w?.avoidDays.includes(day) ? AVOID_PENALTY : 0;
                    const reluctant = w?.reluctantDays.includes(day) ? RELUCTANT_PENALTY : 0;
                    const blocked = w?.blockedShifts?.includes(shift) ? BLOCK_PENALTY : 0;
                    return {id: d.id, score: avoid + reluctant + blocked + (loadCount.get(d.id) ?? 0)};
                })
                .sort((a, b) => a.score - b.score);
            const chosen = scored[0]!.id;
            list.push({day, shift, docId: chosen});
            loadCount.set(chosen, (loadCount.get(chosen) ?? 0) + 1);
        }
    }
    return list;
}

export interface ScheduleStats {
    readonly counts: ReadonlyMap<string, number>;
    readonly mean: number;
    readonly spread: number;
}

export function scheduleStats(
    docs: ReadonlyArray<Doc>,
    assignments: ReadonlyArray<Assignment>,
): ScheduleStats {
    const counts = new Map<string, number>(docs.map((d) => [d.id, 0]));
    for (const a of assignments) {
        counts.set(a.docId, (counts.get(a.docId) ?? 0) + 1);
    }
    const values = [...counts.values()];
    const mean = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    const spread = values.length ? Math.max(...values) - Math.min(...values) : 0;
    return {counts, mean, spread};
}

export function autoBalance(
    docs: ReadonlyArray<Doc>,
    wishes: ReadonlyArray<Wish>,
    assignments: ReadonlyArray<Assignment>,
    iterations = 60,
): ReadonlyArray<Assignment> {
    let current = [...assignments];
    for (let i = 0; i < iterations; i++) {
        const stats = scheduleStats(docs, current);
        if (stats.spread <= 2) break;
        const overloaded = [...stats.counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        const underloaded = [...stats.counts.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
        if (!overloaded || !underloaded || overloaded === underloaded) break;
        const swapIndex = current.findIndex((a) => {
            if (a.docId !== overloaded) return false;
            const w = wishes.find((x) => x.docId === underloaded);
            if (w?.avoidDays.includes(a.day)) return false;
            if (w?.blockedShifts?.includes(a.shift)) return false;
            return true;
        });
        if (swapIndex === -1) break;
        const slot = current[swapIndex]!;
        current = [
            ...current.slice(0, swapIndex),
            {...slot, docId: underloaded},
            ...current.slice(swapIndex + 1),
        ];
    }
    return current;
}

export type IntentOp =
    | { readonly op: "give_all"; readonly docId: string; readonly weekday: Weekday }
    | { readonly op: "swap"; readonly docIdA: string; readonly docIdB: string; readonly day?: number }
    | { readonly op: "block"; readonly docId: string; readonly shift: Shift }
    | { readonly op: "assign_only"; readonly docId: string; readonly shift: Shift }
    | { readonly op: "unknown" };

export type Weekday =
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday";

export const WEEKDAY_INDEX: Record<Weekday, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
};

const WEEKDAY_PREFIXES: ReadonlyArray<readonly [string, Weekday]> = [
    ["sun", "sunday"],
    ["mon", "monday"],
    ["tue", "tuesday"],
    ["wed", "wednesday"],
    ["thu", "thursday"],
    ["fri", "friday"],
    ["sat", "saturday"],
];

export function parseIntentRegex(raw: string, docs: ReadonlyArray<Doc>): IntentOp {
    const cmd = raw.toLowerCase().trim();

    const giveAll = /(?:give|assign)\s+(\w+)\s+all\s+(\w+)s/.exec(cmd);
    if (giveAll) {
        const doc = matchDoc(giveAll[1], docs);
        const weekday = matchWeekday(giveAll[2]);
        if (doc && weekday) return {op: "give_all", docId: doc.id, weekday};
    }

    const swapWithDay = /swap\s+(\w+)\s+(?:and|with)\s+(\w+)\s+on\s+(?:the\s+)?(\d+)/.exec(cmd);
    if (swapWithDay) {
        const a = matchDoc(swapWithDay[1], docs);
        const b = matchDoc(swapWithDay[2], docs);
        const day = Number(swapWithDay[3]);
        if (a && b && Number.isFinite(day)) return {op: "swap", docIdA: a.id, docIdB: b.id, day};
    }
    const swapAll = /swap\s+(\w+)\s+(?:and|with)\s+(\w+)(?:\s+everywhere)?$/.exec(cmd);
    if (swapAll) {
        const a = matchDoc(swapAll[1], docs);
        const b = matchDoc(swapAll[2], docs);
        if (a && b) return {op: "swap", docIdA: a.id, docIdB: b.id};
    }

    const block = /block\s+(\w+)\s+from\s+(\w+)/.exec(cmd);
    if (block) {
        const doc = matchDoc(block[1], docs);
        const shift = matchShift(block[2]);
        if (doc && shift) return {op: "block", docId: doc.id, shift};
    }

    const assignOnly =
        /assign\s+(\w+)\s+to\s+(\w+)\s+only/.exec(cmd) ??
        /assign\s+(\w+)\s+only\s+(?:to\s+)?(\w+)/.exec(cmd);
    if (assignOnly) {
        const doc = matchDoc(assignOnly[1], docs);
        const shift = matchShift(assignOnly[2]);
        if (doc && shift) return {op: "assign_only", docId: doc.id, shift};
    }

    return {op: "unknown"};
}

function matchDoc(token: string | undefined, docs: ReadonlyArray<Doc>): Doc | null {
    if (!token) return null;
    const t = token.toLowerCase();
    return docs.find((d) => d.id.toLowerCase() === t || d.name.toLowerCase().includes(t)) ?? null;
}

function matchWeekday(token: string | undefined): Weekday | null {
    if (!token) return null;
    const t = token.toLowerCase();
    return WEEKDAY_PREFIXES.find(([p]) => t.startsWith(p))?.[1] ?? null;
}

function matchShift(token: string | undefined): Shift | null {
    if (!token) return null;
    const t = token.toLowerCase();
    if (t.startsWith("day")) return "day";
    if (t.startsWith("night")) return "night";
    if (t.startsWith("weekend") || t.startsWith("wknd")) return "weekend";
    return null;
}

export function applyIntent(
    intent: IntentOp,
    spec: MonthSpec,
    docs: ReadonlyArray<Doc>,
    wishes: ReadonlyArray<Wish>,
    assignments: ReadonlyArray<Assignment>,
): {
    readonly assignments: ReadonlyArray<Assignment>;
    readonly wishes: ReadonlyArray<Wish>;
    readonly description: string
} {
    switch (intent.op) {
        case "give_all": {
            const idx = WEEKDAY_INDEX[intent.weekday];
            const next = assignments.map((a) => {
                const dow = new Date(spec.year, spec.month - 1, a.day).getDay();
                return dow === idx ? {...a, docId: intent.docId} : a;
            });
            const doc = docs.find((d) => d.id === intent.docId);
            return {
                assignments: next,
                wishes,
                description: `${doc?.name ?? intent.docId} → all ${intent.weekday}s`,
            };
        }
        case "swap": {
            const next = assignments.map((a) => {
                if (intent.day !== undefined && a.day !== intent.day) return a;
                if (a.docId === intent.docIdA) return {...a, docId: intent.docIdB};
                if (a.docId === intent.docIdB) return {...a, docId: intent.docIdA};
                return a;
            });
            const a = docs.find((d) => d.id === intent.docIdA);
            const b = docs.find((d) => d.id === intent.docIdB);
            const scope = intent.day !== undefined ? `on day ${intent.day}` : "everywhere";
            return {
                assignments: next,
                wishes,
                description: `Swapped ${a?.name ?? intent.docIdA} ↔ ${b?.name ?? intent.docIdB} ${scope}`,
            };
        }
        case "block": {
            const wishesNext = upsertWish(wishes, intent.docId, (w) => ({
                ...w,
                blockedShifts: [...new Set([...(w.blockedShifts ?? []), intent.shift])],
            }));
            const doc = docs.find((d) => d.id === intent.docId);
            return {
                assignments: generateSchedule(spec, docs, wishesNext),
                wishes: wishesNext,
                description: `Blocked ${doc?.name ?? intent.docId} from ${intent.shift} shifts`,
            };
        }
        case "assign_only": {
            const next = assignments.map((a) => {
                if (a.shift === intent.shift) return {...a, docId: intent.docId};
                if (a.docId === intent.docId) {
                    const replacement = docs.find((d) => d.id !== intent.docId);
                    return {...a, docId: replacement?.id ?? a.docId};
                }
                return a;
            });
            const doc = docs.find((d) => d.id === intent.docId);
            return {
                assignments: next,
                wishes,
                description: `${doc?.name ?? intent.docId} → ${intent.shift} shifts only`,
            };
        }
        case "unknown":
            return {
                assignments,
                wishes,
                description: "Not understood — try 'give walker all sundays' or 'swap walker and nedoszytko on the 15th'.",
            };
    }
}

function upsertWish(
    wishes: ReadonlyArray<Wish>,
    docId: string,
    update: (w: Wish) => Wish,
): ReadonlyArray<Wish> {
    const existing = wishes.find((w) => w.docId === docId);
    if (existing) return wishes.map((w) => (w.docId === docId ? update(w) : w));
    return [...wishes, update({docId, avoidDays: [], reluctantDays: [], blockedShifts: []})];
}

export function googleCalendarLink(spec: MonthSpec, a: Assignment, doc: Doc): string {
    const pad = (n: number) => n.toString().padStart(2, "0");
    const ymd = `${spec.year}${pad(spec.month)}${pad(a.day)}`;
    const endDay = a.shift === "night" ? a.day + 1 : a.day;
    const endYmd = `${spec.year}${pad(spec.month)}${pad(endDay)}`;
    const start = a.shift === "night" ? `${ymd}T200000Z` : `${ymd}T080000Z`;
    const end = a.shift === "night" ? `${endYmd}T080000Z` : `${endYmd}T200000Z`;
    const text = encodeURIComponent(`${doc.name} — ${a.shift} shift`);
    return `https://calendar.google.com/calendar/r/eventedit?text=${text}&dates=${start}/${end}`;
}
