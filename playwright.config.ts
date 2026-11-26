import { defineConfig } from "@playwright/test";
// E2E_PORT lets parallel checkouts run their own preview server.
const port = Number(process.env.E2E_PORT || 4174);
export default defineConfig({
  testDir: "./tests/http",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // The keyboard spec boots the real world: software WebGL in CI/containers.
    launchOptions: {
      // A preinstalled Chromium when Playwright's own build is not downloaded.
      executablePath: process.env.PW_CHROMIUM || undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: {
    command: `npm run preview -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    // Cloudflare snapshots its asset manifest at startup; rebuilt assets need a fresh server.
    reuseExistingServer: false,
    timeout: 60000,
  },
});
