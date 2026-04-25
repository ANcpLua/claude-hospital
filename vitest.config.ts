import {defineConfig} from "vitest/config";

// Vitest config kept separate from vite.config.ts so the build pipeline
// (Tailwind, React plugin, Three.js chunks) doesn't load during tests.
export default defineConfig({
    test: {
        environment: "node",
        // Pure logic only. UI is covered by Playwright.
        include: ["server/**/*.test.ts", "src/**/*.test.ts"],
        reporters: "default",
    },
});
