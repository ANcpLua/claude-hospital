import {forwardRef} from "react";
import {ChevronDown, ChevronRight} from "lucide-react";
import type {NoteType, PostpartumNote} from "../data/postpartum-notes";

const TYPE_LABELS: Record<NoteType, string> = {
    nursing: "Nursing",
    hnp: "H&P",
    "ed-physician": "ED",
    lab: "Lab",
    "ob-clinic": "OB clinic",
    pharmacy: "Pharmacy",
    discharge: "Discharge",
};

const TYPE_TONES: Record<NoteType, string> = {
    nursing: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-800",
    hnp: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-800",
    "ed-physician": "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-800",
    lab: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800",
    "ob-clinic": "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800",
    pharmacy: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-200 dark:border-violet-800",
    discharge: "bg-ink-100 text-ink-800 border-ink-200 dark:bg-ink-800 dark:text-ink-200 dark:border-ink-700",
};

export function noteTypeLabel(t: NoteType): string {
    return TYPE_LABELS[t];
}

interface Props {
    readonly note: PostpartumNote;
    readonly expanded: boolean;
    readonly highlight?: boolean;
    readonly onToggle: () => void;
}

export const NoteCard = forwardRef<HTMLLIElement, Props>(function NoteCard(
    {note, expanded, highlight, onToggle},
    ref,
) {
    return (
        <li
            ref={ref}
            className={`rounded-md border bg-white dark:bg-ink-900 transition-colors ${
                highlight
                    ? "border-teal-500 ring-2 ring-teal-500/30 dark:border-teal-400 dark:ring-teal-400/40"
                    : "border-ink-200 dark:border-ink-800"
            }`}
        >
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                className="w-full flex items-start gap-2 text-left px-3 py-2 hover:bg-cream-100 dark:hover:bg-ink-800 rounded-md cursor-pointer"
            >
        <span className="mt-0.5 text-ink-400 dark:text-ink-500 shrink-0">
          {expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
        </span>
                <span
                    className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${TYPE_TONES[note.type]}`}
                >
          {TYPE_LABELS[note.type]}
        </span>
                <span className="font-mono text-[11px] text-ink-500 dark:text-ink-400 shrink-0">
          {note.id}
        </span>
                <span className="text-xs text-ink-700 dark:text-ink-200 truncate flex-1">
          {note.author} · {formatTimestamp(note.timestamp)}
        </span>
            </button>
            {expanded && (
                <div
                    className="px-3 pb-3 pt-1 text-sm text-ink-800 dark:text-ink-100 whitespace-pre-wrap leading-relaxed">
                    {note.body}
                </div>
            )}
        </li>
    );
});

function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
