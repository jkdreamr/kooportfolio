/**
 * Engine modules the lazy chunk borrows, installed by scenes/BannerRush.tsx
 * (engine chunk) before the chunk loads. Importing them directly from the
 * lazy chunk would re-chunk the engine and drop its manifest key (the
 * prerender's /play preload list depends on it). Type imports are free.
 */
import type * as Rig from "../../world/character/rig";
import type * as Wardrobe from "../../world/character/wardrobe";
import type * as Locomotion from "../../world/character/locomotion";
import type * as Parts from "../../world/character/parts";
import type * as Models from "../../world/Models";
import type * as Static from "../../world/StaticBatch";
import type { Villager } from "../../core/npcs";
import type * as Fiber from "@react-three/fiber";
import type * as Drei from "@react-three/drei";

export type EngineApi = {
  rig: typeof Rig;
  wardrobe: typeof Wardrobe;
  locomotion: typeof Locomotion;
  parts: typeof Parts;
  models: typeof Models;
  staticBatch: typeof Static;
  villagers: readonly Villager[];
  GAME_STAGE_Y: number;
  useThree: typeof Fiber.useThree;
  useFrame: typeof Fiber.useFrame;
  Html: typeof Drei.Html;
  PerspectiveCamera: typeof Drei.PerspectiveCamera;
};

export function engine(): EngineApi {
  return (globalThis as unknown as { __bannerRushEngine: EngineApi }).__bannerRushEngine;
}
