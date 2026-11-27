/**
 * Named sound cues: the one vocabulary every part of the game uses to ask
 * for a sound. Owned by the sound/game-feel workstream; this is the shared
 * contract. Code outside the engine chunk can ask without importing this:
 *   window.dispatchEvent(new CustomEvent("stage-cue", { detail: { name: "tear" } }))
 */
import { sound } from "../sound";

export type Cue =
  | "ui-open"
  | "ui-close"
  | "ui-hover"
  | "ui-select"
  | "ui-confirm"
  | "ui-back"
  | "ui-toggle"
  | "ui-error"
  | "toast"
  | "tear"
  | "flight"
  | "land"
  | "travel-depart"
  | "travel-arrive"
  | "fountain";

export type CueOptions = { pan?: number; gain?: number };

/** Plays a cue. Unmapped cues are silent for now. */
export function cue(name: Cue, opts?: CueOptions): void {
  void opts;
  if (name === "ui-open") sound("open");
  else if (name === "ui-close") sound("close");
}

const CUES: ReadonlySet<string> = new Set<Cue>([
  "ui-open", "ui-close", "ui-hover", "ui-select", "ui-confirm", "ui-back", "ui-toggle",
  "ui-error", "toast", "tear", "flight", "land", "travel-depart", "travel-arrive", "fountain",
]);
export const isCue = (v: unknown): v is Cue => typeof v === "string" && CUES.has(v);

let listening = false;
/** Lets code outside the engine chunk request cues via a window event. */
export function listenForStageCues(): () => void {
  if (listening || typeof window === "undefined") return () => {};
  listening = true;
  const onCue = (e: Event) => {
    const detail = (e as CustomEvent<{ name?: unknown; pan?: number; gain?: number }>).detail;
    if (detail && isCue(detail.name)) cue(detail.name, { pan: detail.pan, gain: detail.gain });
  };
  window.addEventListener("stage-cue", onCue);
  return () => {
    listening = false;
    window.removeEventListener("stage-cue", onCue);
  };
}
