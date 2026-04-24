import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GH Pages base path — set VITE_BASE at build time (`VITE_BASE=/repo/ npm run build`)
// or leave as "/" for root deployments (user/org pages, Fly, custom domain).
const base = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.VITE_BASE ?? "/";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
