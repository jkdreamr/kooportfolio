/**
 * Pure pieces of the stage's boot: the engine-import recovery ladder and the
 * loading mark's progress. No DOM, no three (portfolio entry chunk).
 */

/** Where the engine import stands after a failure. */
export type LoadStep = "first" | "retry" | "reload" | "fail";

/**
 * After a failed import at `step`: retry once; then, where allowed (direct
 * /play) and not yet done this session, reload the page once; otherwise give
 * up (the caller shows the "3D unavailable" card).
 */
export function nextLoadStep(
  step: LoadStep,
  { allowReload, reloaded }: { allowReload: boolean; reloaded: boolean },
): LoadStep {
  if (step === "first") return "retry";
  if (step === "retry" && allowReload && !reloaded) return "reload";
  return "fail";
}

/** Share of the hairline that tracks the engine download (the rest is warm-up). */
export const DOWNLOAD_SHARE = 0.6;

/**
 * Loading-mark progress, 0..1: the first 60% is the engine's files as they
 * finish downloading (weighted by size), the last 40% the warm queue.
 */
export function bootProgress(
  files: readonly (readonly [url: string, bytes: number])[],
  done: ReadonlySet<string>,
  warm: number,
) {
  const total = files.reduce((sum, [, bytes]) => sum + bytes, 0);
  let download = 0;
  if (total > 0) {
    for (const [url, bytes] of files) if (done.has(url)) download += bytes;
    download /= total;
  } else download = warm > 0 ? 1 : 0;
  const w = Math.min(1, Math.max(0, warm));
  // The warm queue only starts once the engine is in: its progress implies
  // the download is complete even if a resource entry never arrived.
  if (w > 0) download = 1;
  return DOWNLOAD_SHARE * download + (1 - DOWNLOAD_SHARE) * w;
}
