/**
 * The live engine instance and its bindings to the game: preference store,
 * stage mode (the portfolio stays silent), tab visibility, the first gesture,
 * room acoustics, music tone and dialogue ducking.
 */
import { useGame } from "../store";
import { useStage } from "../../../stage/contract";
import { useGameMode } from "../gameMode";
import { AudioHost, type PlayOptions } from "./engine";
import type { Bus } from "./graph";
import type { LoopHandle, LoopName, PaletteName } from "./palette";
import { MusicPlayer } from "./music";
import { exposeQa } from "../../../stage/qa";
import { launchersFor } from "../launchers";

export const audio = new AudioHost();
/** Real tracks, when there are any (MUSIC_ENABLED, TRACKS in music.ts). */
export const music = new MusicPlayer(audio);

/** Open-air scenes use the outdoor reverb; everything else is a room. */
export const OUTDOOR_SCENES: ReadonlySet<string> = new Set(["hub", "rowing", "basketball", "stadium", "skate"]);
/** Music inside rooms: low-passed to 1.2 kHz and 8 dB down. */
export const ROOM_MUSIC_CUTOFF = 1200;
export const ROOM_MUSIC_DB = -8;
/** Dialogue: ambience 6 dB and music 8 dB under a conversation. */
export const DIALOGUE_DUCK = { ambience: -6, music: -8 } as const;
/** An external player (the Listen panel) holds the stage: the world bed
 * drops well back and music stops while it plays. */
export const HOLD_DUCK = { ambience: -18, music: -60 } as const;
/** Sources currently holding the game audio down (window "stage-audio-hold"). */
const holds = new Set<string>();

let bound = false;
function bind() {
  if (bound || typeof window === "undefined" || typeof document === "undefined") return;
  bound = true;
  const applyPrefs = () => {
    const { sound } = useGame.getState();
    audio.setMuted(sound.muted);
    audio.setLevels(sound);
  };
  const applyStage = () => audio.setAllowed(useStage.getState().mode !== "site");
  const applyScene = () => {
    const s = useGame.getState();
    const playing = useGameMode.getState().active !== null;
    const outdoor = OUTDOOR_SCENES.has(s.scene);
    audio.setSpace(outdoor ? "outdoor" : "room");
    audio.setMusicTone(outdoor ? 18000 : ROOM_MUSIC_CUTOFF);
    const talking = s.panel === "npc";
    const held = holds.size > 0;
    audio.holdDuck("ambience", held ? HOLD_DUCK.ambience : talking ? DIALOGUE_DUCK.ambience : 0);
    // Music sits out mini-games, the cinema and external players; rooms hear it muffled.
    audio.holdDuck(
      "music",
      held || playing || s.scene === "theater" ? HOLD_DUCK.music : talking ? DIALOGUE_DUCK.music : outdoor ? 0 : ROOM_MUSIC_DB,
    );
  };
  applyPrefs();
  applyStage();
  useGame.subscribe((next, prev) => {
    if (next.sound !== prev.sound) applyPrefs();
    if (next.scene !== prev.scene || next.panel !== prev.panel) applyScene();
    if (next.world !== prev.world) void music.setWorld(next.world);
  });
  useGameMode.subscribe((next, prev) => {
    if ((next.active === null) !== (prev.active === null)) applyScene();
  });
  useStage.subscribe((next, prev) => {
    if (next.mode !== prev.mode) applyStage();
  });
  window.addEventListener("stage-audio-hold", (e) => {
    const detail = (e as CustomEvent<{ source?: unknown; on?: unknown }>).detail;
    if (!detail || typeof detail.source !== "string") return;
    if (detail.on === true) holds.add(detail.source);
    else holds.delete(detail.source);
    applyScene();
  });
  audio.setHidden(document.hidden);
  document.addEventListener("visibilitychange", () => audio.setHidden(document.hidden));
  let applied: AudioContext | null = null;
  const gesture = () => {
    const ctx = audio.unlock();
    if (ctx && ctx !== applied) {
      applied = ctx;
      applyScene();
      void music.setWorld(useGame.getState().world);
    }
  };
  for (const type of GESTURES) {
    // Capture: before any handler that might play a sound.
    window.addEventListener(type, gesture, { capture: true, passive: true });
    // Bubble: after the handler that leaves the portfolio. A press on the
    // letter is still "site" in the capture phase, so only this one, in the
    // same activation, finds the stage allowed.
    window.addEventListener(type, gesture, { passive: true });
  }
  // The tear is dispatched mid-drag, inside the press's activation window,
  // and may be the first moment both the engine and the stage are ready.
  // This listener is added before cues.ts's, so the context exists by the
  // time the tear cue plays.
  window.addEventListener("stage-cue", (e) => {
    if ((e as CustomEvent<{ name?: unknown } | null>).detail?.name === "tear") gesture();
  });
}

/** Events that count as a gesture for unlocking audio. pointerup and click
 * cover the keyboard-less, reduced-motion "click activates" entry. */
export const GESTURES = ["pointerdown", "pointerup", "click", "keydown", "touchend"] as const;
bind();
// QA builds only (a no-op otherwise): the engine and launchers for scripts.
exposeQa({ audio: { host: audio, play: (name: PaletteName, opts?: PlayOptions) => audio.play(name, opts) }, launchers: { launchersFor } });

/** Plays a palette sound now (no-op while muted, hidden or on the portfolio). */
export const play = (name: PaletteName, opts?: PlayOptions) => audio.play(name, opts);

/** A looping sound the caller owns (sizzle, skate wheels, crowd, fountain). */
export const loop = (name: LoopName, gain?: number): LoopHandle | null => audio.loop(name, gain);

/** The shared context once a gesture has created it, else null. */
export const audioContext = (): AudioContext | null => audio.ctx;

/**
 * Routes a node the caller built on `audioContext()` into the ambience bus,
 * so it goes through the master chain and obeys mute. Returns a disconnect.
 * (For the fountain ambience and any other world emitter.)
 */
export const connectAmbience = (node: AudioNode) => audio.connect("ambience", node);
/** Same for a music source (real tracks, when there are any). */
export const connectMusic = (node: AudioNode) => audio.connect("music", node);
export const connectBus = (bus: Bus, node: AudioNode) => audio.connect(bus, node);
