/**
 * Measurement / QA handles for scripted browsers on production builds.
 * Always on in dev; on a production build only after `?qa=1` (remembered for
 * the tab session, so it survives the "/" → "/play" pushState). Exposes
 * stores and scene handles on `window.__qa`; renders and changes nothing.
 */
let on: boolean | null = null;

export function qaEnabled(): boolean {
  if (on !== null) return on;
  if (import.meta.env.DEV) return (on = true);
  try {
    if (new URLSearchParams(location.search).get("qa") === "1")
      sessionStorage.setItem("stage-qa", "1");
    on = sessionStorage.getItem("stage-qa") === "1";
  } catch {
    on = false;
  }
  return on;
}

/** Merge `handles` into `window.__qa` (no-op unless QA is enabled). */
export function exposeQa(handles: Record<string, unknown>) {
  if (typeof window === "undefined" || !qaEnabled()) return;
  const w = window as unknown as { __qa?: Record<string, unknown> };
  w.__qa = Object.assign(w.__qa ?? {}, handles);
}
