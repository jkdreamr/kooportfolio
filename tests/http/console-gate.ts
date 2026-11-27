import type { ConsoleMessage, Page } from "@playwright/test";

/**
 * Console gate (A11): every console error or warning fails the run unless it
 * is one of three known renderer notices that real devices do not show (or
 * that are harmless): software-GL readback stalls, the missing parallel
 * shader compile extension, and Chromium's software-WebGL fallback notice.
 */
export const CONSOLE_ALLOWLIST: readonly RegExp[] = [
  /GPU stall due to ReadPixels/,
  /KHR_parallel_shader_compile/,
  /Automatic fallback to software WebGL|SwiftShader/i,
];

export function isAllowed(text: string) {
  return CONSOLE_ALLOWLIST.some((rule) => rule.test(text));
}

/** Start recording a page's console; `problems()` lists what the gate rejects. */
export function watchConsole(page: Page) {
  const seen: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    const type = message.type();
    if (type !== "error" && type !== "warning") return;
    const text = message.text();
    if (!isAllowed(text)) seen.push(`${type}: ${text}`);
  });
  page.on("pageerror", (error) => seen.push(`pageerror: ${error.message}`));
  return { problems: () => [...seen] };
}
