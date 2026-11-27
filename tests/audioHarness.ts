/**
 * Shared harness for the offline audio renders: bundles
 * `src/game/core/audio/offline.ts` with vite and runs it in a headless
 * Chromium page (the only place with a real OfflineAudioContext). Skips
 * cleanly when no Chromium is installed.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CANDIDATES = [
  process.env.PW_CHROMIUM,
  "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome",
].filter((p): p is string => !!p);

export const chromiumPath = () => CANDIDATES.find((p) => existsSync(p));

export async function bundleOffline(): Promise<string> {
  const { build } = await import("vite");
  const entry = fileURLToPath(new URL("../src/game/core/audio/offline.ts", import.meta.url));
  const result = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ["iife"], name: "AudioLab", fileName: () => "audio-lab.js" },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  for (const out of outputs)
    if ("output" in out) for (const chunk of out.output) if (chunk.type === "chunk") return chunk.code;
  throw new Error("offline bundle produced no chunk");
}

export type LabPage = {
  run: <T>(fn: string, ...args: unknown[]) => Promise<T>;
  close: () => Promise<void>;
};

export async function openLab(): Promise<LabPage> {
  const executablePath = chromiumPath();
  if (!executablePath) throw new Error("no chromium");
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath,
    args: ["--autoplay-policy=no-user-gesture-required", "--use-angle=swiftshader", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setContent("<!doctype html><title>audio lab</title>");
  await page.addScriptTag({ content: await bundleOffline() });
  return {
    run: <T,>(fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([name, a]) => (window as unknown as Record<string, Record<string, (...v: unknown[]) => unknown>>).AudioLab[name as string](...(a as unknown[])),
        [fn, args] as const,
      ) as Promise<T>,
    close: () => browser.close(),
  };
}
