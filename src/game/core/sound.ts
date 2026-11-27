import { runtime, useGame } from "./store";
import { keys } from "./input";
import { doorsInWorld, isInterior } from "./world";
import { POND } from "./pond";
import type { WorldId } from "./worlds";
import { audio, OUTDOOR_SCENES, play } from "./audio/live";
import type { PaletteName } from "./audio/palette";
// Registers the window "stage-cue" listener as soon as the engine chunk runs.
import "./audio/cues";
// All sounds are synthesised (core/audio/palette.ts) and mixed through one
// engine (core/audio/engine.ts). No tracking or remote requests.

/** Every palette name, plus the older names the game already used. */
export type SoundKind = PaletteName | "open" | "close" | "clang";
const ALIASES: Partial<Record<SoundKind, PaletteName>> = {
  open: "ui-open",
  close: "ui-close",
  clang: "rim",
};

export type SoundOptions = { pan?: number; gain?: number; intensity?: number; delay?: number };

/** Plays a named sound. Silent while muted (no nodes are built at all). */
export function sound(kind: SoundKind, opts?: SoundOptions) {
  if (useGame.getState().muted) return;
  play(ALIASES[kind] ?? (kind as PaletteName), opts);
}

export type Surface = "grass" | "gravel" | "stone" | "wood" | "soft";

/** Floors inside, by room. Anything unlisted is boards. */
const ROOM_FLOORS: Partial<Record<string, Surface>> = {
  skate: "stone",
  basketball: "stone",
  stadium: "stone",
  kitchen: "stone",
  secret: "stone",
  theater: "soft",
  cognition: "soft",
  gym: "soft",
};

/**
 * What the avatar is standing on. Interiors use the room's floor; outside,
 * doorsteps are flagstones, the pond rim is gravel, Stanford's walks are
 * decomposed granite and everything else is lawn. Pure and cheap: it runs at
 * most once per footfall.
 */
export function surfaceAt(
  scene: string,
  world: WorldId,
  x: number,
  z: number,
): Surface {
  if (scene === "rowing") return "wood";
  if (scene !== "hub")
    return ROOM_FLOORS[scene] ?? (isInterior(scene) ? "wood" : "stone");
  for (const door of doorsInWorld(world))
    if (Math.hypot(x - door.x, z - door.z) < 3.2) return "stone";
  if (world !== "home") {
    const rim = Math.hypot(
      ((x - POND.x) * POND.radiusZ) / POND.radiusX,
      z - POND.z,
    );
    if (rim < POND.radiusZ + 2.2) return "gravel";
  }
  return world === "stanford" ? "gravel" : "grass";
}

let lastStep = 0,
  stepFlip = false;
/** Quiet alternating footfalls while the avatar walks; call each moving frame.
 * The surface under the avatar voices each step; sprinting quickens the gait. */
export function footstep() {
  const now = performance.now(),
    sprint = keys.has("shift");
  if (now - lastStep < (sprint ? 250 : 340)) return;
  lastStep = now;
  const state = useGame.getState();
  if (state.muted || !audio.ready()) return;
  stepFlip = !stepFlip;
  const surface = surfaceAt(state.scene, state.world, runtime.x, runtime.z);
  play(`foot-${surface}`, {
    pan: stepFlip ? -0.12 : 0.12,
    gain: sprint ? 1.2 : 1,
    // More room in a room: footfalls carry a larger reverb send indoors.
    send: OUTDOOR_SCENES.has(state.scene) ? 0.06 : 0.15,
  });
}
