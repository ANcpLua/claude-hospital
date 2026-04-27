import {defineConfig} from "vitest/config";

// Separate from vite.config.ts so Tailwind/React/Three.js don't load during tests.
export default defineConfig({
    test: {
        environment: "node",
        // Pure logic only — UI is covered by Playwright.
        include: ["server/**/*.test.ts", "src/**/*.test.ts"],
        reporters: "default",
    },
});
