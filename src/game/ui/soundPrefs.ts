import { useGame } from "../core/store";

/**
 * The controls' view of the sound preference. The store owns it (sound and
 * game-feel workstream): `sound: { muted, music, effects }` with levels
 * 0–100 in steps of 5, written through `setSound(patch)` and remembered
 * under `joshua-exe-sound-v1`. Until that lands, the legacy `muted` flag is
 * the only thing these controls can move, and the levels read as defaults.
 */
export type SoundPrefs = { muted: boolean; music: number; effects: number };

export const DEFAULT_LEVELS = { music: 80, effects: 100 } as const;
export const LEVEL_STEP = 5;

type SoundStore = {
  muted: boolean;
  sound?: SoundPrefs;
  setSound?: (patch: Partial<SoundPrefs>) => void;
};
const store = () => useGame.getState() as unknown as SoundStore;
const read = (s: unknown): SoundPrefs => {
  const state = s as SoundStore;
  return state.sound ?? { muted: state.muted, ...DEFAULT_LEVELS };
};

/** Clamps a level to 0–100 on the slider's step. */
export const snapToStep = (value: number) =>
  Math.min(100, Math.max(0, Math.round(value / LEVEL_STEP) * LEVEL_STEP));

export function setSoundPrefs(patch: Partial<SoundPrefs>): void {
  const clean: Partial<SoundPrefs> = { ...patch };
  if (clean.music !== undefined) clean.music = snapToStep(clean.music);
  if (clean.effects !== undefined) clean.effects = snapToStep(clean.effects);
  const state = store();
  if (typeof state.setSound === "function") {
    state.setSound(clean);
    return;
  }
  const next = { ...read(state), ...clean };
  useGame.setState({ muted: next.muted, sound: next } as never);
}

export const toggleMute = () => setSoundPrefs({ muted: !read(store()).muted });

export const useMuted = () => useGame((s) => read(s).muted);
export const useMusicLevel = () => useGame((s) => read(s).music);
export const useEffectsLevel = () => useGame((s) => read(s).effects);

/** True when a key press belongs to a text field, not to the game. */
export const isTyping = (target: EventTarget | null) =>
  typeof HTMLElement !== "undefined" &&
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.matches("input:not([type=range]):not([type=checkbox]):not([type=radio]), textarea, select"));

/** Should this keydown toggle mute? M or m, no modifiers, not in a field. */
export const isMuteKey = (event: Pick<KeyboardEvent, "key" | "repeat" | "ctrlKey" | "metaKey" | "altKey" | "target">) =>
  !event.repeat &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.altKey &&
  (event.key === "m" || event.key === "M") &&
  !isTyping(event.target);

/** The one-time "press M" hint, remembered per browser. */
export const SOUND_HINT_KEY = "joshua-exe-sound-hint-v1";
type HintStorage = Pick<Storage, "getItem" | "setItem">;
export function takeSoundHint(storage: () => HintStorage = () => localStorage): boolean {
  try {
    if (storage().getItem(SOUND_HINT_KEY)) return false;
    storage().setItem(SOUND_HINT_KEY, "1");
    return true;
  } catch {
    // Storage blocked: show it once per page load instead of every visit.
    if (memoryHintShown) return false;
    memoryHintShown = true;
    return true;
  }
}
let memoryHintShown = false;
