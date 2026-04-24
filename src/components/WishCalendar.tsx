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
const MARKS: ReadonlyArray<WishMark> = ["avoid", "reluctant", "clear"];

export function WishCalendar({ year, month, avoidDays, reluctantDays, onChange }: Props) {
  const [mark, setMark] = useState<WishMark>("avoid");
  const total = daysInMonth({ year, month });
  // getDay returns Sunday=0; shift so Monday=0 for Mon-first layout.
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const cells: ReadonlyArray<number | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
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

  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Mark mode" className="flex gap-1 text-xs">
        {MARKS.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mark === m}
            onClick={() => setMark(m)}
            className={`px-2 py-1 rounded border ${
              mark === m
                ? markActiveClass(m)
                : "bg-white dark:bg-ink-900 border-ink-300 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:bg-cream-50 dark:hover:bg-ink-800"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10px] text-ink-500 dark:text-ink-400 uppercase tracking-wide">
        {WEEKDAY_HEADER.map((w) => (
          <div key={w} className="text-center">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={`pad-${i}`} className="h-7" aria-hidden />;
          const isAvoid = avoidDays.includes(d);
          const isReluctant = reluctantDays.includes(d);
          const tone = isAvoid
            ? "bg-rose-200 text-rose-900 border-rose-300"
            : isReluctant
              ? "bg-amber-100 text-amber-900 border-amber-200"
              : isWeekend({ year, month }, d)
                ? "bg-cream-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200 border-ink-200 dark:border-ink-800"
                : "bg-white dark:bg-ink-900 text-ink-700 dark:text-ink-200 border-ink-200 dark:border-ink-800";
          const label = isAvoid ? "avoid" : isReluctant ? "reluctant" : "available";
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              className={`h-7 rounded border text-xs tabular-nums hover:brightness-95 ${tone}`}
              aria-label={`Day ${d}: ${label}`}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function markActiveClass(m: WishMark): string {
  switch (m) {
    case "avoid":
      return "bg-rose-600 text-white border-rose-600";
    case "reluctant":
      return "bg-amber-500 text-white border-amber-500";
    case "clear":
      return "bg-stone-700 text-white border-stone-700";
  }
}
