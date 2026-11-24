import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/http",
  use: { baseURL: "http://127.0.0.1:4174" },
  webServer: {
    command: "npm run preview -- --port 4174",
    url: "http://127.0.0.1:4174",
    // Cloudflare snapshots its asset manifest at startup; rebuilt assets need a fresh server.
    reuseExistingServer: false,
    timeout: 60000,
  },
});
