/**
 * Measurement / QA handles for scripted browsers. On in dev, and in a build
 * made with `VITE_QA=1 npm run build`; never in the normal production build.
 * Both are build-time constants, so the handles (and every `window.__qa`
 * write) tree-shake out of the shipped bundle. Exposes stores and scene
 * handles on `window.__qa`; renders and changes nothing.
 */
const QA_BUILD: boolean = import.meta.env.DEV || import.meta.env.VITE_QA === "1";

export function qaEnabled(): boolean {
  return QA_BUILD;
}

/** Merge `handles` into `window.__qa` (no-op unless QA is enabled). */
export function exposeQa(handles: Record<string, unknown>) {
  if (!QA_BUILD || typeof window === "undefined") return;
  const w = window as unknown as { __qa?: Record<string, unknown> };
  w.__qa = Object.assign(w.__qa ?? {}, handles);
}
