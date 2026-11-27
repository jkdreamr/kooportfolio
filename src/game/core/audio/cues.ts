/**
 * Named sound cues: the one vocabulary every part of the game uses to ask
 * for a sound. Owned by the sound/game-feel workstream; this is the shared
 * contract. Code outside the engine chunk can ask without importing this:
 *   window.dispatchEvent(new CustomEvent("stage-cue", { detail: { name: "tear" } }))
 * (`detail` may also carry `pan`, `gain` and, for `flight`, `duration` in s.)
 */
import { audio, loop, play } from "./live";
import { PALETTE_NAMES } from "./palette";

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
  | "fountain"
  // Living world (PLAN_GAMES §4.6) and the stadium (§2.4).
  | "flutter"
  | "purr"
  | "quack"
  | "splash"
  | "rustle"
  | "chirp"
  | "crowd-hush"
  | "groan";

export type CueOptions = {
  pan?: number;
  gain?: number;
  /** `flight`: the camera flight's length in seconds (default 4.6). */
  duration?: number;
  /** `ui-toggle`: turning something off plays the two notes reversed. */
  off?: boolean;
};

/** Plays a cue through the audio engine. Silent while muted, with the tab
 * hidden, on the portfolio pages, or before the first in-game gesture. */
export function cue(name: Cue, opts?: CueOptions): void {
  // The landing ends the flight's air on cue, however long the flight was
  // (returning visitors fly 2.2 s; the flight cue does not say).
  if (name === "land") audio.fade("flight", 0.45);
  play(name, opts);
}

const CUES: ReadonlySet<string> = new Set<Cue>([
  "ui-open", "ui-close", "ui-hover", "ui-select", "ui-confirm", "ui-back", "ui-toggle",
  "ui-error", "toast", "tear", "flight", "land", "travel-depart", "travel-arrive", "fountain",
  "flutter", "purr", "quack", "splash", "rustle", "chirp", "crowd-hush", "groan",
]);
export const isCue = (v: unknown): v is Cue => typeof v === "string" && CUES.has(v);

const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

let listening = false;
/** Lets code outside the engine chunk request cues via a window event. */
export function listenForStageCues(): () => void {
  if (listening || typeof window === "undefined") return () => {};
  listening = true;
  const onCue = (e: Event) => {
    const detail = (e as CustomEvent<{ name?: unknown; pan?: unknown; gain?: unknown; duration?: unknown; off?: unknown }>).detail;
    if (detail && isCue(detail.name))
      cue(detail.name, {
        pan: finite(detail.pan),
        gain: finite(detail.gain),
        duration: finite(detail.duration),
        off: detail.off === true,
      });
  };
  window.addEventListener("stage-cue", onCue);
  return () => {
    listening = false;
    window.removeEventListener("stage-cue", onCue);
  };
}
// The engine chunk always loads this module (via sound.ts), so stage cues
// dispatched by the portfolio and the tear are heard without any wiring.
listenForStageCues();

// QA builds only: `/play?audio-lab=1` mounts a button per sound. The guard is
// a build-time constant, so the normal build drops the import entirely.
if (
  (import.meta.env.DEV || import.meta.env.VITE_QA === "1") &&
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("audio-lab")
)
  void import("./lab").then((lab) => lab.mountAudioLab({ audio, names: PALETTE_NAMES, play, loop }));
