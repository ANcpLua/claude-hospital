import {useSyncExternalStore} from "react";

type Theme = "light" | "dark";

const KEY = "meduni-theme";

function readSystem(): Theme {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getTheme(): Theme {
    try {
        const v = localStorage.getItem(KEY);
        if (v === "light" || v === "dark") return v;
    } catch {
        /* fall through to system preference */
    }
    return readSystem();
}

function applyTheme(t: Theme): void {
    document.documentElement.classList.toggle("dark", t === "dark");
}

function setTheme(t: Theme): void {
    try {
        localStorage.setItem(KEY, t);
    } catch {
        /* disabled storage; UI still updates below */
    }
    applyTheme(t);
    window.dispatchEvent(new CustomEvent("meduni-theme", {detail: t}));
}

function subscribe(cb: () => void): () => void {
    window.addEventListener("meduni-theme", cb);
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", cb);
    return () => {
        window.removeEventListener("meduni-theme", cb);
        mql.removeEventListener("change", cb);
    };
}

const SERVER_SNAPSHOT: Theme = "light";

export function useTheme(): [Theme, (t: Theme) => void] {
    const t = useSyncExternalStore(subscribe, getTheme, () => SERVER_SNAPSHOT);
    return [t, setTheme];
}
