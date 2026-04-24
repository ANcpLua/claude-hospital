import {useEffect, useRef} from "react";
import {Link, NavLink, Outlet} from "react-router-dom";
import {Activity, Moon, Settings as SettingsIcon, Sun} from "lucide-react";
import {useTheme} from "../lib/theme";
import {mountTurnstile} from "../lib/turnstile";

const NAV = [
    {to: "/well-baby", label: "Well-baby"},
    {to: "/postpartum", label: "Postpartum"},
    {to: "/inhaler", label: "Inhaler"},
    {to: "/previsit", label: "PreVisit"},
    {to: "/medduties", label: "MedDuties"},
    {to: "/postvisit", label: "PostVisit"},
];

export function Layout() {
    const [theme, setTheme] = useTheme();
    const turnstileRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (turnstileRef.current) mountTurnstile(turnstileRef.current);
    }, []);

    return (
        <div className="min-h-full flex flex-col bg-cream-50 dark:bg-ink-950 text-ink-900 dark:text-ink-100">
            <header className="no-print border-b border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900">
                <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
                    <Link to="/" className="flex items-center gap-2 shrink-0 group">
            <span
                aria-hidden
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-teal-600 dark:bg-teal-500 text-white"
            >
              <Activity size={18} strokeWidth={1.75}/>
            </span>
                        <span className="tracking-tight">
              <span className="display text-[17px] text-ink-900 dark:text-ink-100">
                Claude Code
              </span>
              <span className="hidden sm:inline text-ink-400 dark:text-ink-500 font-normal">
                {" "}
                  in Healthcare
              </span>
            </span>
                    </Link>

                    <nav className="flex gap-1 flex-wrap text-sm">
                        {NAV.map((n) => (
                            <NavLink
                                key={n.to}
                                to={n.to}
                                className={({isActive}) =>
                                    `px-2 py-1 rounded-md transition-colors ${
                                        isActive
                                            ? "bg-teal-600/10 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300"
                                            : "text-ink-600 dark:text-ink-300 hover:text-ink-900 dark:hover:text-ink-100 hover:bg-ink-100 dark:hover:bg-ink-800"
                                    }`
                                }
                            >
                                {n.label}
                            </NavLink>
                        ))}
                    </nav>

                    <div className="ml-auto flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                            className="inline-flex items-center rounded-md border border-ink-300 dark:border-ink-700 p-1.5 hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-700 dark:text-ink-200 transition-colors cursor-pointer"
                        >
                            {theme === "dark" ? <Sun size={16}/> : <Moon size={16}/>}
                        </button>
                        <NavLink
                            to="/settings"
                            className="inline-flex items-center rounded-md border border-ink-300 dark:border-ink-700 p-1.5 hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-700 dark:text-ink-200 transition-colors"
                            aria-label="Settings"
                        >
                            <SettingsIcon size={16}/>
                        </NavLink>
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-10">
                <Outlet/>
            </main>

            <footer
                className="no-print border-t border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 text-xs text-ink-500 dark:text-ink-400">
                <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center gap-4 justify-between">
                    <span>Demo build · synthetic data.</span>
                    <div ref={turnstileRef} aria-label="Bot check"/>
                </div>
            </footer>
        </div>
    );
}
