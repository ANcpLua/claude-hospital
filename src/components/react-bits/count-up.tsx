import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface CountUpProps {
  readonly to: number;
  readonly from?: number;
  readonly duration?: number;
  readonly decimals?: number;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly className?: string;
  /** Separator between thousands. Default: no separator. */
  readonly separator?: string;
}

/**
 * CountUp — animates a number from `from` to `to` once on mount using
 * requestAnimationFrame. Uses tabular-nums so the layout stays stable.
 * Honours prefers-reduced-motion by jumping to the target value.
 */
export function CountUp({
  to,
  from = 0,
  duration = 1.4,
  decimals = 0,
  prefix = "",
  suffix = "",
  separator,
  className,
}: CountUpProps) {
  const [value, setValue] = useState<number>(from);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setValue(to);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [from, to, duration]);

  const rounded = value.toFixed(decimals);
  const display = separator
    ? formatWithSeparator(rounded, separator)
    : rounded;

  return (
    <span className={cn("tabular-nums", className)}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

function formatWithSeparator(n: string, sep: string): string {
  const [intPart, decPart] = n.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return decPart !== undefined ? `${grouped}.${decPart}` : grouped;
}

export default CountUp;
