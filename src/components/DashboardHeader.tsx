import type {LucideIcon} from "lucide-react";
import {ShinyText} from "./react-bits/shiny-text";
import {CountUp} from "./react-bits/count-up";
import {cn} from "@/lib/utils";

export interface DashboardMetric {
    readonly label: string;
    readonly value: number;
    readonly suffix?: string;
    readonly prefix?: string;
    readonly decimals?: number;
    readonly tone?: "default" | "teal" | "amber" | "emerald" | "rose";
    readonly icon?: LucideIcon;
    /** Shimmer the value. Use sparingly — one per header at most. */
    readonly shiny?: boolean;
}

export interface DashboardHeaderProps {
    readonly kicker: string;
    readonly title: string;
    readonly blurb?: string;
    readonly metrics: ReadonlyArray<DashboardMetric>;
    /** Extra content slotted between title and metrics (e.g. tab switcher). */
    readonly right?: React.ReactNode;
    readonly className?: string;
}

const TONE_TEXT: Record<NonNullable<DashboardMetric["tone"]>, string> = {
    default: "text-ink-900 dark:text-ink-100",
    teal: "text-teal-700 dark:text-teal-300",
    amber: "text-amber-700 dark:text-amber-400",
    emerald: "text-emerald-700 dark:text-emerald-400",
    rose: "text-rose-700 dark:text-rose-400",
};

export function DashboardHeader({
                                    kicker,
                                    title,
                                    blurb,
                                    metrics,
                                    right,
                                    className,
                                }: DashboardHeaderProps) {
    return (
        <header
            className={cn(
                "rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 overflow-hidden",
                className,
            )}
        >
            <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div className="space-y-2 min-w-0">
                    <p className="caption text-teal-700 dark:text-teal-400">
                        <ShinyText text={kicker} speed={6}/>
                    </p>
                    <h1 className="display text-2xl sm:text-3xl text-ink-900 dark:text-ink-100 truncate">
                        {title}
                    </h1>
                    {blurb && (
                        <p className="text-sm text-ink-600 dark:text-ink-300 max-w-[60ch]">{blurb}</p>
                    )}
                    {right && <div className="pt-1">{right}</div>}
                </div>

                {metrics.length > 0 && (
                    <dl
                        className={cn(
                            "grid gap-px bg-ink-200 dark:bg-ink-800",
                            "border border-ink-200 dark:border-ink-800 rounded-md overflow-hidden",
                            "min-w-[16rem]",
                            metrics.length === 1 && "grid-cols-1",
                            metrics.length === 2 && "grid-cols-2",
                            metrics.length === 3 && "grid-cols-3",
                            metrics.length >= 4 && "grid-cols-2 sm:grid-cols-4",
                        )}
                    >
                        {metrics.map((m) => {
                            const Icon = m.icon;
                            const formatted = `${m.prefix ?? ""}${m.value.toFixed(m.decimals ?? 0)}${m.suffix ?? ""}`;
                            return (
                                <div
                                    key={m.label}
                                    className="bg-white dark:bg-ink-900 px-3 py-2.5 min-w-[5.5rem]"
                                >
                                    <div
                                        className="flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-ink-500 dark:text-ink-400">
                                        {Icon && <Icon size={11} strokeWidth={1.75}/>}
                                        <span className="truncate">{m.label}</span>
                                    </div>
                                    <div
                                        className={cn(
                                            "mt-0.5 text-xl font-semibold tabular-nums leading-tight",
                                            TONE_TEXT[m.tone ?? "default"],
                                        )}
                                    >
                                        {m.shiny ? (
                                            <ShinyText text={formatted} speed={3.5}/>
                                        ) : (
                                            <CountUp
                                                to={m.value}
                                                decimals={m.decimals ?? 0}
                                                prefix={m.prefix}
                                                suffix={m.suffix}
                                                duration={1.2}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </dl>
                )}
            </div>
        </header>
    );
}
