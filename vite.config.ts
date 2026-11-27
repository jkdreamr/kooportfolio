import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

/** Build stamp for the footer year and the benchmark JSON (A13). Kept in step
 * with scripts/prerender.mjs, which renders the same tree on the server. */
function commitHash() {
  const fromCi = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromCi) return fromCi.slice(0, 12);
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
      .slice(0, 12);
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  plugins: [
    react(),
    cloudflare(
      process.env.WRITING_LOCAL === "1"
        ? { configPath: "wrangler.writing-local.jsonc" }
        : {},
    ),
  ],
  define: {
    __BUILD_YEAR__: JSON.stringify(new Date().getFullYear()),
    __BUILD_COMMIT__: JSON.stringify(commitHash()),
  },
  // The manifest lets the prerender find the engine chunk for /play's
  // modulepreload list; prerender deletes it before publishing.
  build: { chunkSizeWarningLimit: 1100, manifest: true },
  // The engine imports these lazily (high tier only). Pre-bundle them up
  // front so the dev server never re-optimises mid-session (a full reload and
  // a duplicated three.js instance).
  optimizeDeps: { include: ["postprocessing", "n8ao"] },
  server: { host: "0.0.0.0" },
});
