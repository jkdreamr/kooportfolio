/**
 * Build-time constants (vite.config.ts `define`, and the prerender's own
 * server config). The fallbacks keep tests and tools that do not define them
 * working.
 */
declare const __BUILD_YEAR__: number | undefined;
declare const __BUILD_COMMIT__: string | undefined;

export const BUILD_YEAR: number =
  typeof __BUILD_YEAR__ === "number" ? __BUILD_YEAR__ : new Date().getFullYear();
export const BUILD_COMMIT: string =
  typeof __BUILD_COMMIT__ === "string" ? __BUILD_COMMIT__ : "dev";
