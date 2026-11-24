import { create } from "zustand";
import {
  freshSave,
  parseSave,
  reward,
  SAVE_KEY,
  type Save,
  upgrade,
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
const initial = load();
if (!canWalk(initial.position[0], initial.position[1], initial.world))
  initial.position = [0, 5];
if (storageIssue) writeAllowed = false;
export const runtime = {
  x: initial.position[0],
  z: initial.position[1],
  heading: 0,
  moving: false,
  target: null as [number, number] | null,
  path: [] as [number, number][],
  near: "",
  raceCadence: 30,
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
};
export function walkTo(x: number, z: number) {
  const state = useGame.getState();
  runtime.path = state.scene === "hub"
    ? findPath([runtime.x, runtime.z], [x, z], state.world)
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
  build: boolean;
  panel:
    | "none"
    | "help"
    | "avatar"
    | "memories"
    | "settings"
    | "profile"
    | "places"
    | "leaderboard"
    | "npc"
    | "photo"
    | "telescope"
    | "desk";
  near: string;
  notice: string;
  muted: boolean;
  quality: "high" | "low";
  result: null | {
    game: string;
    title: string;
    score: string;
    coins: number;
    detail: string;
  };
  run: number;
  go: (scene: Scene) => void;
  travel: (world: WorldId, mode?: TravelMode) => void;
  setNear: (near: string) => void;
  persist: () => void;
  award: (id: string, coins: number, xp: number, extra?: Partial<Save>) => void;
  upgrade: (key: "boathouse" | "garden") => void;
  customize: (color: string, hat: boolean) => void;
};
export const useGame = create<State>((set, get) => ({
  scene: "hub",
  world: initial.world,
  save: initial,
  paused: false,
  overlayLocked: false,
  traveling: false,
  build: false,
  panel: "none",
  near: "",
  notice: storageIssue,
  muted: true,
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
    set({
      scene,
      near: "",
      result: null,
      build: false,
      paused: false,
      panel: "none",
      run: get().run + 1,
    });
  },
  travel(world, mode = "plane") {
    if (!validJourney(get().world, world, mode) || get().scene !== "hub")
      return;
    get().persist();
    const position: [number, number] = mode === "plane" ? [58, 61] : [-73, 12];
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
      build: false,
      result: null,
      run: get().run + 1,
    });
    get().persist();
  },
  setNear(near) {
    if (get().near !== near) set({ near });
  },
  persist() {
    const s =
      get().scene === "hub"
        ? {
            ...get().save,
            world: get().world,
            position: [runtime.x, runtime.z] as [number, number],
          }
        : get().save;
    set({ save: s });
    if (!writeAllowed) return;
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
    } catch {
      set({
        notice:
          "Browser storage is unavailable. You can keep playing, but progress only lasts this session.",
      });
    }
  },
  award(id, coins, xp, extra) {
    set({ save: { ...reward(get().save, id, coins, xp), ...extra } });
    get().persist();
  },
  upgrade(key) {
    const next = upgrade(get().save, key);
    if (next === get().save) return;
    set({
      save: next,
      notice: key === "garden" ? "Garden upgraded." : "Boathouse upgraded.",
    });
    get().persist();
  },
  customize(color, hat) {
    set({ save: { ...get().save, color, hat } });
    get().persist();
  },
}));
