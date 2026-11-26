import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    react(),
    cloudflare(
      process.env.WRITING_LOCAL === "1"
        ? { configPath: "wrangler.writing-local.jsonc" }
        : {},
    ),
  ],
  build: { chunkSizeWarningLimit: 1100 },
  // The engine imports these lazily (high tier only). Pre-bundle them up
  // front so the dev server never re-optimises mid-session (a full reload and
  // a duplicated three.js instance).
  optimizeDeps: { include: ["postprocessing", "n8ao"] },
  server: { host: "0.0.0.0" },
});
