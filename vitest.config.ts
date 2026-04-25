import {defineConfig} from "vitest/config";

// Vitest config kept separate from vite.config.ts so the build pipeline
// (Tailwind, React plugin, Three.js chunks) doesn't load during tests.
export default defineConfig({
    test: {
        environment: "node",
        // Only the proxy is unit-tested. Routes are covered by Playwright.
        include: ["server/**/*.test.ts"],
        reporters: "default",
    },
});
