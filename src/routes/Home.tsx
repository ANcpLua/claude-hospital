import { Link } from "react-router-dom";
import {
  Baby,
  Thermometer,
  Wind,
  MessageSquare,
  CalendarClock,
  HeartHandshake,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CountUp } from "../components/react-bits/count-up";
import TextScatter from "../components/react-bits/text-scatter";

interface Tool {
  readonly to: string;
  readonly title: string;
  readonly author: string;
  readonly blurb: string;
  readonly stamp: string;
  readonly icon: LucideIcon;
}

const TOOLS: ReadonlyArray<Tool> = [
  {
    to: "/well-baby",
    title: "Well-baby note generator",
    author: "Graham Walker",
    blurb:
      "Pediatrics intake form that emits a nurse-ready note. Swap the screening profile (California / Saudi Arabia) and the checklist updates in place.",
    stamp: "webinar 12:13",
    icon: Baby,
  },
  {
    to: "/postpartum",
    title: "Postpartum 25-note summarizer",
    author: "Graham Walker",
    blurb:
      "Sarah Connor presents with postpartum fever. 25 synthetic notes compile into two views: a patient explainer and an ID-consult surfacing.",
    stamp: "webinar 15:00",
    icon: Thermometer,
  },
  {
    to: "/inhaler",
    title: "Dude, Where's My Inhaler?",
    author: "Graham Walker",
    blurb:
      "Same air-quality data, three personas: Gen-Z asthma patient, pulmonologist cohort manager, state public-health hot-spot map.",
    stamp: "webinar 17:30",
    icon: Wind,
  },
  {
    to: "/previsit",
    title: "PreVisit intake conversation",
    author: "Michał Nedoszytko",
    blurb:
      "Patient gets an SMS link and walks through an empathetic pre-visit chat. Consent gate, term definitions, 'ask your wife' detour.",
    stamp: "webinar 25:00",
    icon: MessageSquare,
  },
  {
    to: "/medduties",
    title: "MedDuties on-call scheduler",
    author: "Michał Nedoszytko",
    blurb:
      "Shift calendar that respects staff wishes. Conversational layer: 'give Walker all Sundays', 'assign only night shifts'.",
    stamp: "webinar 28:30",
    icon: CalendarClock,
  },
  {
    to: "/postvisit",
    title: "PostVisit patient companion",
    author: "Michał Nedoszytko",
    blurb:
      "After-visit recap, term explainer, patient-side AI scribe, vitals/labs connectors, doctor-contact triage. Hackathon-winner shape.",
    stamp: "webinar 34:00",
    icon: HeartHandshake,
  },
];

export function Home() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300 font-medium">
          Anthropic webinar · 23 Apr 2026 · re-implementation
        </p>
        <TextScatter
          text="Claude Code, in a Hospital"
          as="h1"
          className="display text-4xl sm:text-5xl font-semibold tracking-tight text-ink-900 dark:text-ink-100 select-none cursor-crosshair"
          velocity={220}
          rotation={90}
          returnAfter={0.9}
          duration={1.6}
        />
        <p className="max-w-2xl text-ink-600 dark:text-ink-300">
          Six live demos from two practicing physicians. Re-implemented
          in clean-room React/TS, synthetic data, static SPA — hover the
          title, open the source, then tear it apart.
        </p>
      </section>

      <section
        aria-label="Headline stats"
        className="grid grid-cols-3 gap-3 max-w-xl"
      >
        {[
          { label: "Demos", value: TOOLS.length },
          { label: "Doctors", value: 2 },
          { label: "Minutes of video", value: 61 },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 px-3 py-2"
          >
            <CountUp
              to={s.value}
              duration={1.2}
              className="block text-2xl font-semibold tabular-nums text-teal-700 dark:text-teal-300"
            />
            <div className="text-xs text-ink-500 dark:text-ink-400">
              {s.label}
            </div>
          </div>
        ))}
      </section>

      <section
        aria-label="Tools"
        className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {TOOLS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="group block rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 hover:border-teal-600 dark:hover:border-teal-400/40 hover:shadow-sm transition-colors duration-150"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-600/10 dark:bg-teal-400/15 text-teal-700 dark:text-teal-300"
              >
                <t.icon size={18} strokeWidth={1.75} />
              </span>
              <div className="space-y-1.5">
                <h2 className="font-semibold text-ink-900 dark:text-ink-100 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors duration-150">
                  {t.title}
                </h2>
                <p className="text-sm text-ink-600 dark:text-ink-300 leading-snug">
                  {t.blurb}
                </p>
                <p className="text-xs text-ink-400 dark:text-ink-500">
                  {t.author} · {t.stamp}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
