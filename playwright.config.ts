import {defineConfig, devices} from "@playwright/test";

// E2E target: production by default (PROD=1) or local dev (PROD unset).
// Local mode boots `bun --env-file=.env server/index.ts` + `npm run dev`
// out of band — see CLAUDE.md Execution protocol.
const PROD = process.env.PROD === "1";
const BASE_URL = PROD
    ? "https://claude-hospital.fly.dev"
    : "http://localhost:5173";

export default defineConfig({
    testDir: "./tests/e2e",
    timeout: 60_000,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: "list",
    use: {
        baseURL: BASE_URL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        viewport: {width: 375, height: 812},
    },
    projects: [
        {
            name: "mobile",
            // Chromium-based mobile preset — keeps the 375x812 viewport without
            // requiring a separate WebKit install.
            use: {...devices["Pixel 7"]},
        },
    ],
});
