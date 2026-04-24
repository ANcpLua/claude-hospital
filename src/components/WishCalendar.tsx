import { useState } from "react";
import { daysInMonth, isWeekend } from "../lib/scheduler";

type WishMark = "avoid" | "reluctant" | "clear";

interface Props {
  readonly year: number;
  readonly month: number;
  readonly avoidDays: ReadonlyArray<number>;
  readonly reluctantDays: ReadonlyArray<number>;
  readonly onChange: (next: {
    readonly avoidDays: ReadonlyArray<number>;
    readonly reluctantDays: ReadonlyArray<number>;
  }) => void;
}

const WEEKDAY_HEADER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MARK_META: ReadonlyArray<{
  readonly id: WishMark;
  readonly label: string;
  readonly dot: string;
  readonly active: string;
}> = [
  {
    id: "avoid",
    label: "Avoid",
    dot: "bg-rose-500",
    active:
      "bg-rose-600 text-white border-rose-600 shadow-[0_1px_0_rgba(0,0,0,0.04)]",
  },
  {
    id: "reluctant",
    label: "Reluctant",
    dot: "bg-amber-500",
    active:
      "bg-amber-500 text-white border-amber-500 shadow-[0_1px_0_rgba(0,0,0,0.04)]",
  },
  {
    id: "clear",
    label: "Clear",
    dot: "bg-ink-400",
    active:
      "bg-ink-800 text-white border-ink-800 dark:bg-ink-100 dark:text-ink-900 dark:border-ink-100",
  },
];

function isToday({ year, month }: { year: number; month: number }, day: number): boolean {
  const now = new Date();
  return (
    now.getFullYear() === year && now.getMonth() + 1 === month && now.getDate() === day
  );
}

export function WishCalendar({ year, month, avoidDays, reluctantDays, onChange }: Props) {
  const [mark, setMark] = useState<WishMark>("avoid");
  const total = daysInMonth({ year, month });
  // getDay returns Sunday=0; shift so Monday=0 for Mon-first layout.
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const trailing = (7 - ((offset + total) % 7)) % 7;
  const cells: ReadonlyArray<number | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
    ...Array.from({ length: trailing }, () => null),
  ];

  function toggle(day: number) {
    const withoutDay = {
      avoid: avoidDays.filter((d) => d !== day),
      reluctant: reluctantDays.filter((d) => d !== day),
    };
    switch (mark) {
      case "clear":
        onChange({ avoidDays: withoutDay.avoid, reluctantDays: withoutDay.reluctant });
        return;
      case "avoid":
        onChange({
          avoidDays: avoidDays.includes(day)
            ? withoutDay.avoid
            : [...avoidDays, day].sort((a, b) => a - b),
          reluctantDays: withoutDay.reluctant,
        });
        return;
      case "reluctant":
        onChange({
          avoidDays: withoutDay.avoid,
          reluctantDays: reluctantDays.includes(day)
            ? withoutDay.reluctant
            : [...reluctantDays, day].sort((a, b) => a - b),
        });
    }
  }

  const avoidCount = avoidDays.length;
  const reluctantCount = reluctantDays.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="radiogroup"
          aria-label="Paint mode"
          className="inline-flex items-center rounded-full border border-ink-200 dark:border-ink-800 bg-cream-50 dark:bg-ink-950/60 p-1 text-sm"
        >
          {MARK_META.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mark === m.id}
              onClick={() => setMark(m.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full transition-colors ${
                mark === m.id
                  ? m.active
                  : "text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800 border border-transparent"
              }`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  mark === m.id ? "bg-white/90" : m.dot
                }`}
                aria-hidden
              />
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-ink-500 dark:text-ink-400 tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-rose-500/80" aria-hidden />
            <span>{avoidCount} avoid</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-amber-400" aria-hidden />
            <span>{reluctantCount} reluctant</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-sm border border-ink-300 dark:border-ink-600"
              aria-hidden
            />
            <span>available</span>
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 overflow-hidden">
        <div className="grid grid-cols-7 bg-cream-50 dark:bg-ink-950/40 border-b border-ink-200 dark:border-ink-800">
          {WEEKDAY_HEADER.map((w, i) => (
            <div
              key={w}
              className={`py-2 text-center text-[10px] font-medium uppercase tracking-[0.12em] ${
                i >= 5
                  ? "text-ink-400 dark:text-ink-500"
                  : "text-ink-500 dark:text-ink-400"
              }`}
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const weekday = i % 7;
            const borderEdges = `${weekday < 6 ? "border-r" : ""} ${
              i < cells.length - 7 ? "border-b" : ""
            } border-ink-100 dark:border-ink-800`;
            if (d === null) {
              return (
                <div
                  key={`pad-${i}`}
                  className={`aspect-square bg-cream-50/40 dark:bg-ink-950/20 ${borderEdges}`}
                  aria-hidden
                />
              );
            }
            const isAvoid = avoidDays.includes(d);
            const isReluctant = reluctantDays.includes(d);
            const weekend = isWeekend({ year, month }, d);
            const today = isToday({ year, month }, d);
            const base =
              "aspect-square relative flex items-start justify-start p-1.5 sm:p-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-0 focus-visible:z-10 cursor-pointer";
            const tone = isAvoid
              ? "bg-rose-500/12 text-rose-800 dark:text-rose-200 hover:bg-rose-500/20"
              : isReluctant
                ? "bg-amber-400/15 text-amber-900 dark:text-amber-100 hover:bg-amber-400/25"
                : weekend
                  ? "bg-ink-100/60 dark:bg-ink-800/40 text-ink-600 dark:text-ink-400 hover:bg-ink-200/60 dark:hover:bg-ink-800/70"
                  : "bg-white dark:bg-ink-900 text-ink-800 dark:text-ink-100 hover:bg-cream-100 dark:hover:bg-ink-800/60";
            const label = isAvoid ? "avoid" : isReluctant ? "reluctant" : "available";
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggle(d)}
                className={`${base} ${tone} ${borderEdges}`}
                aria-label={`Day ${d}: ${label}`}
                aria-pressed={isAvoid || isReluctant}
              >
                <span className="font-medium tabular-nums text-sm sm:text-base leading-none">
                  {d}
                </span>
                {today && (
                  <span
                    className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-teal-500"
                    aria-label="today"
                  />
                )}
                {isAvoid && (
                  <span
                    className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-rose-500"
                    aria-hidden
                  />
                )}
                {isReluctant && !isAvoid && (
                  <span
                    className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-amber-500"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
