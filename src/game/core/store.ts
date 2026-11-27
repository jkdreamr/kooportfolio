import { create } from "zustand";
import {
  addMemory,
  countBest,
  freshSave,
  isKitChoice,
  parseSave,
  recordBest,
  recordDaily,
  SAVE_KEY,
  type BestResult,
  type DailyResult,
  type BestRule,
  type Save,
  writeGuestSave,
} from "../../shared/save";
import { canWalk, findPath, isInterior, type PlaceId } from "./world";
import { roomFor } from "./room";
import { findInteriorPath } from "./houseRooms";
import {
  belongsToWorld,
  validJourney,
  type TravelMode,
  type WorldId,
} from "./worlds";
import { keys, touch } from "./input";
import { journeyGate } from "./journey";
import type { TravelOption } from "./travel";
import { useWorldView } from "./worldView";
import { HERO_SPOTS } from "./heroSpots";
import { useStage } from "../../stage/contract";
import { readSoundPrefs, snapLevel, writeSoundPrefs, type SoundPrefs } from "./audio/prefs";
import { isStampId, stampMemory } from "./passport";
import { dayNumber } from "./daily";
export type Scene = "hub" | "rowing" | "secret" | PlaceId;
let storageIssue = "";
let savedRaw: string | null = null;
function load() {
  try {
    savedRaw = localStorage.getItem(SAVE_KEY);
    return parseSave(savedRaw);
  } catch {
    storageIssue =
      "Your saved file could not be read. This session is temporary; your previous data has not been overwritten.";
    return freshSave();
  }
}
let writeAllowed = true;
/** The save object last written to storage (skip identical autosaves). */
let lastWritten: Save | null = null;
const initial = load();
const soundStorage = () => {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
};
const initialSound = readSoundPrefs(soundStorage());
/* B14: a save with no position of its own (a first visit, an unreadable
 * save, or a spot that is no longer walkable) lands on the world's composed
 * hero spot, facing the way the hero frame was chosen for. */
const ownPosition =
  savedRaw !== null &&
  !storageIssue &&
  canWalk(initial.position[0], initial.position[1], initial.world);
const landing = HERO_SPOTS[initial.world];
if (!ownPosition) initial.position = [landing.position[0], landing.position[1]];
if (storageIssue) writeAllowed = false;
export const runtime = {
  x: initial.position[0],
  z: initial.position[1],
  heading: ownPosition ? 0 : landing.heading,
  moving: false,
  target: null as [number, number] | null,
  path: [] as [number, number][],
  near: "",
  raceCadence: 30,
  raceCatch: false,
  raceLength: 360,
  raceSeed: 1,
  raceMode: "sprint" as "sprint" | "regatta" | "daily",
  shoot: false,
  shooting: false,
  aim: 0,
  charge: 0,
  steer: 0,
  burst: false,
  active: true,
  /** The kind of thing in the player's hands ("book", "basket"), or null.
   * Session-only (PLAN_GAMES §5.2); the carry layer sets it. */
  carrying: null as string | null,
};
export function walkTo(x: number, z: number) {
  const state = useGame.getState();
  // The open skate park has its own walking controller and bounds, not a hall.
  runtime.path =
    state.scene === "hub"
      ? findPath([runtime.x, runtime.z], [x, z], state.world)
      : state.scene === "skate"
        ? [[x, z]]
        : findInteriorPath(state.scene, [runtime.x, runtime.z], [x, z]);
  runtime.target = runtime.path.shift() ?? null;
}
type State = {
  scene: Scene;
  world: WorldId;
  save: Save;
  paused: boolean;
  overlayLocked: boolean;
  traveling: boolean;
  travelRequest: WorldId | TravelOption | null;
  panel:
    | "none"
    | "help"
    | "avatar"
    | "memories"
    | "settings"
    | "profile"
    | "places"
    | "travel"
    | "npc"
    | "telescope"
    | "desk";
  near: string;
  notice: string;
  /** Master mute. Mirrors `sound.muted`; setting either keeps both in step. */
  muted: boolean;
  /** The visitor's sound preference, remembered under `joshua-exe-sound-v1`. */
  sound: SoundPrefs;
  /** Updates and remembers the sound preference (mute, music, effects 0–100). */
  setSound: (patch: Partial<SoundPrefs>) => void;
  quality: "high" | "low";
  result: null | {
    game: string;
    title: string;
    detail: string;
    /** Optional score for the result card's count-up (ResultCard). */
    score?: number;
    /** Unit shown after the score ("s", "points"). */
    unit?: string;
    /** This game set a new personal best (the card's "New best" chip). */
    best?: boolean;
    /** The personal best for this measure, after this game. */
    record?: number;
  };
  run: number;
  go: (scene: Scene) => void;
  travel: (world: WorldId, mode?: TravelMode) => void;
  setNear: (near: string) => void;
  persist: () => void;
  customize: (color: string, hat: boolean) => void;
  /** Keeps a personal best in the save (persisted at once). */
  recordBest: (key: string, value: number, rule?: BestRule) => BestResult;
  /** Adds one to a counter best (wins). */
  countBest: (key: string) => BestResult;
  /** Adds a memory flag ("coach:rowing", "sight:bukchon"); persisted at
   * once. True when it was new. */
  remember: (id: string) => boolean;
  /** Earns a Passport stamp by id (memory `stamp:<id>`); unknown ids are
   * refused. True when it was new. */
  earnStamp: (id: string) => boolean;
  /** Sets (or with null clears) a Kit choice, e.g. ("basketball.ball", "sunset"). */
  setKit: (slot: string, option: string | null) => void;
  /** Marks a Daily Three task done today (UTC day by default). */
  recordDaily: (task: string, setSize?: number, day?: number) => DailyResult;
};
export const useGame = create<State>((set, get) => ({
  scene: "hub",
  world: initial.world,
  save: initial,
  paused: false,
  overlayLocked: false,
  traveling: false,
  travelRequest: null,
  panel: "none",
  near: "",
  notice: storageIssue,
  muted: initialSound.muted,
  sound: initialSound,
  setSound(patch) {
    const current = get().sound;
    const next: SoundPrefs = {
      muted: typeof patch.muted === "boolean" ? patch.muted : current.muted,
      music: snapLevel(patch.music, current.music),
      effects: snapLevel(patch.effects, current.effects),
    };
    if (
      next.muted === current.muted &&
      next.music === current.music &&
      next.effects === current.effects &&
      get().muted === next.muted
    )
      return;
    set({ sound: next, muted: next.muted });
    writeSoundPrefs(soundStorage(), next);
  },
  quality: "high",
  result: null,
  run: 0,
  go(scene) {
    if (!belongsToWorld(scene, get().world)) return;
    if (get().scene === "hub") get().persist();
    if (scene === "hub") {
      [runtime.x, runtime.z] = get().save.position;
    } else if (isInterior(scene)) {
      runtime.x = 0;
      runtime.z = roomFor(scene).spawnZ;
    } else if (scene === "basketball") {
      runtime.x = 0;
      runtime.z = 5;
    }
    runtime.target = null;
    runtime.path = [];
    runtime.near = "";
    runtime.shoot = false;
    runtime.shooting = false;
    runtime.aim = 0;
    runtime.steer = 0;
    runtime.burst = false;
    runtime.raceCatch = false;
    set({
      scene,
      near: "",
      result: null,
      paused: false,
      panel: "none",
      run: get().run + 1,
    });
  },
  travel(world, mode = "plane") {
    if (!validJourney(get().world, world, mode) || get().scene !== "hub")
      return;
    get().persist();
    const position: [number, number] = [...journeyGate(mode, world)];
    [runtime.x, runtime.z] = position;
    runtime.path = [];
    runtime.target = null;
    runtime.near = "";
    runtime.moving = false;
    runtime.shoot = false;
    runtime.shooting = false;
    runtime.burst = false;
    runtime.steer = 0;
    keys.clear();
    touch.x = 0;
    touch.z = 0;
    set({
      world,
      scene: "hub",
      save: { ...get().save, world, position },
      near: "",
      panel: "none",
      paused: false,
      result: null,
      run: get().run + 1,
    });
    get().persist();
  },
  setNear(near) {
    if (get().near !== near) set({ near });
  },
  persist() {
    const current = get().save;
    // Keep the save's identity unless something actually changed: the 4 s
    // autosave used to replace it every time, re-rendering every subscriber.
    const moved =
      get().scene === "hub" &&
      (current.world !== get().world ||
        current.position[0] !== runtime.x ||
        current.position[1] !== runtime.z);
    const s = moved
      ? {
          ...current,
          world: get().world,
          position: [runtime.x, runtime.z] as [number, number],
        }
      : current;
    if (s !== current) set({ save: s });
    if (!writeAllowed || s === lastWritten) return;
    try {
      const written = writeGuestSave(localStorage, s, savedRaw);
      if (written === null) {
        writeAllowed = false;
        set({
          paused: true,
          notice:
            "Another tab changed this save. Reload to resume saving; progress here is temporary.",
        });
        return;
      }
      savedRaw = written;
      lastWritten = s;
    } catch {
      set({
        notice:
          "Browser storage is unavailable. You can keep playing, but progress only lasts this session.",
      });
    }
  },
  customize(color, hat) {
    set({ save: { ...get().save, color, hat } });
    get().persist();
  },
  recordBest(key, value, rule = "max") {
    const out = recordBest(get().save.bests, key, value, rule);
    if (out.improved) {
      set({ save: { ...get().save, bests: out.bests } });
      get().persist();
    }
    return out;
  },
  countBest(key) {
    const out = countBest(get().save.bests, key);
    if (out.improved) {
      set({ save: { ...get().save, bests: out.bests } });
      get().persist();
    }
    return out;
  },
  remember(id) {
    const save = get().save,
      next = addMemory(save, id);
    if (next === save) return false;
    set({ save: next });
    get().persist();
    return true;
  },
  earnStamp(id) {
    return isStampId(id) && get().remember(stampMemory(id));
  },
  setKit(slot, option) {
    const save = get().save,
      kit = { ...save.kit };
    if (option === null) {
      if (!(slot in kit)) return;
      delete kit[slot];
    } else {
      if (!isKitChoice(slot, option) || kit[slot] === option) return;
      kit[slot] = option;
    }
    const next: Save = { ...save, kit };
    if (!Object.keys(kit).length) delete next.kit;
    set({ save: next });
    get().persist();
  },
  recordDaily(task, setSize = 3, day = dayNumber(new Date())) {
    const out = recordDaily(get().save.daily, day, task, setSize);
    if (out.changed) {
      set({ save: { ...get().save, daily: out.daily } });
      get().persist();
    }
    return out;
  },
}));

/* Second view: the saved choice seeds the hub camera, and a change made in
 * the game (toggle, flight landing) is written back to the save. */
useWorldView.setState({
  view: initial.view ?? "diorama",
  savedView: initial.view ?? null,
});
function keepView() {
  const { view } = useWorldView.getState();
  const state = useGame.getState();
  if (useStage.getState().mode !== "game" || state.save.view === view) return;
  useGame.setState({ save: { ...state.save, view } });
  state.persist();
}
useWorldView.subscribe((next, previous) => {
  if (next.view !== previous.view) keepView();
});
useStage.subscribe((next, previous) => {
  if (next.mode === "game" && previous.mode !== "game") keepView();
});

/* Sound preference API (the settings panel, the header mute button and the
 * M key call these). Older code that writes `muted` directly is mirrored. */
export const setMuted = (muted: boolean) => useGame.getState().setSound({ muted });
export const toggleMuted = () => setMuted(!useGame.getState().sound.muted);
export const setMusicLevel = (music: number) => useGame.getState().setSound({ music });
export const setEffectsLevel = (effects: number) => useGame.getState().setSound({ effects });
useGame.subscribe((next) => {
  // Guarded: a partial state (tests, older callers) must never throw here.
  if (next.sound && typeof next.setSound === "function" && next.muted !== next.sound.muted)
    next.setSound({ muted: next.muted });
});
