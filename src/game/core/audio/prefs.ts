/**
 * The visitor's sound preference: master on/off and two levels, kept in its
 * own key (like hints), separate from the save. Pure; storage is injected.
 */
export const SOUND_KEY = "joshua-exe-sound-v1";
/** Owner's decision: sound is on after the first in-game gesture. */
export const SOUND_DEFAULT_ON = true;

export type SoundPrefs = {
  muted: boolean;
  /** 0–100, step 5. */
  music: number;
  /** 0–100, step 5: interface, game sounds and ambience. */
  effects: number;
};

export const defaultSoundPrefs = (): SoundPrefs => ({
  muted: !SOUND_DEFAULT_ON,
  music: 80,
  effects: 100,
});

/** Clamps to 0–100 and snaps to the slider's step of 5. */
export const snapLevel = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(100, Math.max(0, Math.round(v / 5) * 5))
    : fallback;

/** Tolerant: an unreadable or partial value keeps the defaults for what is missing. */
export function parseSoundPrefs(raw: string | null): SoundPrefs {
  const base = defaultSoundPrefs();
  if (!raw) return base;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!data || typeof data !== "object") return base;
  const d = data as Record<string, unknown>;
  return {
    muted: typeof d.muted === "boolean" ? d.muted : base.muted,
    music: snapLevel(d.music, base.music),
    effects: snapLevel(d.effects, base.effects),
  };
}

export function readSoundPrefs(storage: Pick<Storage, "getItem"> | undefined): SoundPrefs {
  try {
    return parseSoundPrefs(storage?.getItem(SOUND_KEY) ?? null);
  } catch {
    return defaultSoundPrefs();
  }
}

export function writeSoundPrefs(storage: Pick<Storage, "setItem"> | undefined, prefs: SoundPrefs) {
  try {
    storage?.setItem(SOUND_KEY, JSON.stringify(prefs));
  } catch {
    /* Storage blocked: the choice lasts this session. */
  }
}
