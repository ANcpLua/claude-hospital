import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {HashRouter} from "react-router-dom";
import {App} from "./App";
import {mountTurnstile} from "./lib/turnstile";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root missing in index.html");

// Singleton Turnstile host — lives outside the React tree so route changes
// never tear it down. Invisible widget, off-screen container.
const turnstileHost = document.createElement("div");
turnstileHost.id = "turnstile-host";
turnstileHost.setAttribute("aria-hidden", "true");
turnstileHost.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;";
document.body.appendChild(turnstileHost);
mountTurnstile(turnstileHost);

createRoot(rootEl).render(
    <StrictMode>
        <HashRouter>
            <App/>
        </HashRouter>
    </StrictMode>,
);
