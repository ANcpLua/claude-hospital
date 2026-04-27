import {defineConfig, devices} from "@playwright/test";

// PROD=1 targets fly.dev; otherwise local dev (bun + vite booted out of band).
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
            // Chromium-based preset — 375x812 without a separate WebKit install.
            use: {...devices["Pixel 7"]},
        },
    ],
});
