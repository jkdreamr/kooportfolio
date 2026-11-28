import { lazy } from "react";

/**
 * Whole game modes that load in their own chunks on first entry, so the
 * engine chunk stays under budget. Their GPU programs are still warmed by
 * engine/prewarm.ts (which stays in the engine), so entering links nothing new.
 * Game.tsx's incoming-scene hold awaits `sceneChunk` before compiling, so a
 * mode never presents empty.
 */
let basketball: Promise<typeof import("./basketballMode")> | null = null;
let rowing: Promise<typeof import("./rowingMode")> | null = null;
export const loadBasketball = () => (basketball ??= import("./basketballMode"));
let labs: Promise<typeof import("./LabRooms")> | null = null;
let skate: Promise<typeof import("./SkatePark")> | null = null;
export const loadLabs = () => (labs ??= import("./LabRooms"));
export const loadSkate = () => (skate ??= import("./SkatePark"));
let stadium: Promise<typeof import("./Stadium")> | null = null;
export const loadStadium = () => (stadium ??= import("./Stadium"));
let goRoom: Promise<typeof import("./GoInterior")> | null = null;
export const loadGo = () => (goRoom ??= import("./GoInterior"));
export const loadRowing = () => (rowing ??= import("./rowingMode"));

/** The chunk a scene needs before it can mount, if any. */
export function sceneChunk(scene: string): Promise<unknown> | null {
  if (scene === "basketball") return loadBasketball();
  if (scene === "rowing") return loadRowing();
  if (scene === "music" || scene === "math") return loadLabs();
  if (scene === "skate") return loadSkate();
  if (scene === "stadium") return loadStadium();
  if (scene === "go") return loadGo();
  return null;
}

export const Basketball = lazy(() =>
  loadBasketball().then((m) => ({ default: m.Basketball })),
);
export const BasketballHud = lazy(() =>
  loadBasketball().then((m) => ({ default: m.BasketballHud })),
);
export const Rowing = lazy(() =>
  loadRowing().then((m) => ({ default: m.Rowing })),
);
export const RowingHud = lazy(() =>
  loadRowing().then((m) => ({ default: m.RowingHud })),
);
export const BoathouseRaceSelect = lazy(() =>
  loadRowing().then((m) => ({ default: m.BoathouseRaceSelect })),
);
export const BeatLabInterior = lazy(() =>
  loadLabs().then((m) => ({ default: m.BeatLabInterior })),
);
export const MathLabInterior = lazy(() =>
  loadLabs().then((m) => ({ default: m.MathLabInterior })),
);
export const SkateParkInterior = lazy(() =>
  loadSkate().then((m) => ({ default: m.SkateParkInterior })),
);
export const StadiumInterior = lazy(() =>
  loadStadium().then((m) => ({ default: m.StadiumInterior })),
);
export const GoInterior = lazy(() =>
  loadGo().then((m) => ({ default: m.GoInterior })),
);
