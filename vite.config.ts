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
  server: { host: "0.0.0.0" },
});
