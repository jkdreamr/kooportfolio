import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { runtime, useGame } from "../core/store";
import { daylightClock } from "../core/timeOfDay";
import { sampleDaylight } from "../core/daylight";
import { sampleWeather } from "../core/weather";
import { useWorldActive } from "../engine/active";
import { useStage } from "../../stage/contract";
import { Weather } from "./Weather";
import { StaticBatch } from "./StaticBatch";
import {
  PartBatch,
  SHAPES,
  partMaterial,
  shapeGeometries,
} from "./character/parts";
import {
  animalsInWorld,
  animalPose,
  birdPose,
  planePose,
  wildlifeClock,
  type Animal,
} from "../core/wildlife";
import {
  ALERT,
  CIRCLING,
  FEEDING,
  FLYING,
  LIFE_COUNTS,
  createFlocks,
  startBurst,
  stepFlocks,
  type Flocks,
} from "../core/life";
import { cue } from "../core/audio/cues";
import type { WorldId } from "../core/worlds";
import { exposeQa } from "../../stage/qa";
import { FLOCK_STATE_NAMES } from "../core/life";
import { LifeSprites } from "./life/LifeSprites";

/*
 * Every animal and bird is procedurally posed into one shared instanced part
 * batch (≈4 draws for the whole menagerie, was ~15 meshes per animal).
 * Creatures keep their routes/poses from core/wildlife; only the art and the
 * gaits live here: four-beat leg cycles with body pitch/roll, ear and tail
 * secondary motion, idle sniff/groom/look, and blinking.
 */

const shade = (hex: string, k: number) =>
  `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;

type Creature = {
  animal: Animal;
  yaw: number;
  stride: number;
  speed: number;
  last: [number, number] | null;
  palette: { base: string; dark: string; light: string };
};

const EYE = "#22201d";
const PINK = "#d98f86";

function cat(b: PartBatch, c: Creature, t: number) {
  const { base, dark, light } = c.palette;
  const w = Math.min(1, c.speed / 1.2);
  const ph = c.stride;
  const idle = 1 - w;
  const breathe = Math.sin(t * 2 + c.animal.offset) * 0.01;
  // Body: low, round, a little roll with the gait.
  b.push(
    0,
    0.02 + w * Math.abs(Math.sin(ph)) * 0.025,
    0,
    Math.sin(ph * 2) * 0.03 * w,
    0,
    Math.sin(ph) * 0.05 * w,
  );
  b.part("sphere", base, [0, 0.43, -0.02], [0.3, 0.26 + breathe, 0.44]);
  b.part("sphere", light, [0, 0.39, 0.2], [0.2, 0.2, 0.2]);
  b.part("sphere", light, [0, 0.32, -0.02], [0.2, 0.12, 0.34]);
  for (const z of [-0.24, -0.08, 0.08])
    b.part("sphere", dark, [0, 0.6, z], [0.2, 0.05, 0.055], [0.1, 0, 0]);
  // Legs: diagonal pairs.
  for (const [x, z, o] of [
    [0.13, 0.2, 0],
    [-0.13, 0.2, Math.PI],
    [0.13, -0.24, Math.PI],
    [-0.13, -0.24, 0],
  ] as const) {
    const swing = Math.sin(ph + o) * 0.6 * w;
    b.push(x, 0.36, z, swing, 0, 0);
    b.part("capsule", base, [0, -0.17, 0], [0.065, 0.3, 0.07]);
    b.part("sphere", light, [0, -0.31, 0.03], [0.078, 0.05, 0.1]);
    b.pop();
  }
  // Head: idle look-around and a slow blink.
  const look = idle * Math.sin(t * 0.5 + c.animal.offset * 3) * 0.6;
  const nod = idle * (Math.sin(t * 0.9 + c.animal.offset) * 0.08) - w * 0.08;
  b.push(0, 0.58, 0.36, nod, look, idle * Math.sin(t * 0.37) * 0.12);
  b.part("sphere", base, [0, 0.08, 0.04], [0.21, 0.19, 0.19]);
  b.part("sphere", light, [0, 0.01, 0.18], [0.11, 0.075, 0.08]);
  b.part("sphere", PINK, [0, 0.05, 0.255], [0.028, 0.02, 0.018]);
  const blink = (t + c.animal.offset * 7) % 4.2 < 0.13 ? 0.15 : 1;
  for (const s of [-1, 1]) {
    b.part(
      "sphere",
      EYE,
      [s * 0.085, 0.11, 0.19],
      [0.032, 0.042 * blink, 0.02],
    );
    const flick =
      Math.max(0, Math.sin(t * 3.1 + s + c.animal.offset * 5) - 0.93) * 3;
    b.part(
      "cone",
      base,
      [s * 0.12, 0.27, 0.0],
      [0.075, 0.14, 0.05],
      [-0.1 - flick, 0, -s * 0.32],
    );
    b.part(
      "cone",
      PINK,
      [s * 0.118, 0.255, 0.018],
      [0.04, 0.09, 0.02],
      [-0.1 - flick, 0, -s * 0.32],
    );
    // Whisker pads
    b.part("sphere", light, [s * 0.045, -0.005, 0.215], [0.045, 0.035, 0.035]);
  }
  b.pop();
  // Tail: three segments, lifting into a question mark when walking.
  const sway = Math.sin(t * (1.6 + w * 2.5) + c.animal.offset);
  b.push(0, 0.5, -0.4, -0.6 - w * 0.5, sway * 0.4, 0);
  b.part("capsule", base, [0, 0.13, 0], [0.06, 0.32, 0.06]);
  b.push(0, 0.24, 0, -0.5, sway * 0.3, 0);
  b.part("capsule", dark, [0, 0.12, 0], [0.056, 0.3, 0.056]);
  b.push(0, 0.22, 0, -0.6 + w * 0.3, sway * 0.4, 0);
  b.part("capsule", base, [0, 0.1, 0], [0.052, 0.24, 0.052]);
  b.pop().pop().pop();
  b.pop();
}

function dog(b: PartBatch, c: Creature, t: number) {
  const { base, dark, light } = c.palette;
  const w = Math.min(1, c.speed / 1.4);
  const ph = c.stride;
  const idle = 1 - w;
  b.push(
    0,
    w * Math.abs(Math.sin(ph)) * 0.04,
    0,
    Math.sin(ph * 2) * 0.04 * w,
    0,
    0,
  );
  b.part("sphere", base, [0, 0.52, -0.02], [0.27, 0.27, 0.5]);
  b.part("sphere", light, [0, 0.45, 0.22], [0.21, 0.22, 0.24]);
  b.part("sphere", "#347b77", [0, 0.66, 0.36], [0.23, 0.05, 0.13], [0.5, 0, 0]);
  for (const [x, z, o] of [
    [0.15, 0.27, 0],
    [-0.15, 0.27, Math.PI],
    [0.15, -0.3, Math.PI],
    [-0.15, -0.3, 0],
  ] as const) {
    b.push(x, 0.42, z, Math.sin(ph + o) * 0.65 * w, 0, 0);
    b.part("capsule", base, [0, -0.19, 0], [0.08, 0.34, 0.085]);
    b.part("sphere", light, [0, -0.36, 0.035], [0.088, 0.055, 0.115]);
    b.pop();
  }
  const pant = idle * Math.abs(Math.sin(t * 6)) * 0.02;
  b.push(
    0,
    0.74,
    0.44,
    idle * (Math.sin(t * 1.1 + c.animal.offset) * 0.15 + 0.05) - w * 0.1,
    idle * Math.sin(t * 0.6) * 0.4,
    0,
  );
  b.part("sphere", base, [0, 0.07, 0.05], [0.23, 0.22, 0.24]);
  b.part("sphere", light, [0, -0.02, 0.24], [0.13, 0.1 + pant, 0.16]);
  b.part("sphere", EYE, [0, 0.03, 0.4], [0.05, 0.04, 0.04]);
  b.part("sphere", PINK, [0, -0.08 - pant, 0.3], [0.05, 0.02, 0.07]);
  const blink = (t + c.animal.offset * 5) % 3.7 < 0.12 ? 0.15 : 1;
  for (const s of [-1, 1]) {
    b.part("sphere", EYE, [s * 0.09, 0.12, 0.22], [0.03, 0.04 * blink, 0.02]);
    const flop = Math.sin(ph * 2 + s) * 0.25 * w;
    b.part(
      "sphere",
      dark,
      [s * 0.2, 0.06, 0.02],
      [0.07, 0.17, 0.11],
      [0, 0, s * (0.25 + flop)],
    );
  }
  b.pop();
  const wag = Math.sin(t * (idle > 0.5 ? 9 : 6));
  b.push(0, 0.66, -0.48, -0.9, wag * 0.5, 0);
  b.part("capsule", base, [0, 0.14, 0], [0.06, 0.28, 0.06]);
  b.part("sphere", light, [0, 0.3, 0], [0.065, 0.08, 0.065]);
  b.pop();
  b.pop();
}

function rabbit(b: PartBatch, c: Creature, t: number) {
  const { base, light } = c.palette;
  const w = Math.min(1, c.speed / 1);
  const hop = Math.max(0, Math.sin(c.stride)) * w;
  const idle = 1 - w;
  b.push(0, hop * 0.22, 0, -hop * 0.35 + idle * 0.05, 0, 0);
  b.part("sphere", base, [0, 0.36, -0.06], [0.24, 0.24, 0.3]);
  b.part("sphere", light, [0, 0.33, 0.12], [0.17, 0.18, 0.15]);
  b.part("sphere", light, [0, 0.42, -0.36], [0.1, 0.1, 0.1]);
  for (const s of [-1, 1]) {
    b.part(
      "sphere",
      base,
      [s * 0.15, 0.2, -0.12],
      [0.1, 0.13, 0.2],
      [hop * 0.6, 0, 0],
    );
    b.part(
      "sphere",
      light,
      [s * 0.1, 0.1, 0.16 + hop * 0.08],
      [0.055, 0.05, 0.09],
    );
  }
  const sniff = idle * Math.sin(t * 14) * 0.012;
  b.push(
    0,
    0.58,
    0.18,
    idle * Math.sin(t * 0.8 + c.animal.offset) * 0.15,
    idle * Math.sin(t * 0.43) * 0.4,
    0,
  );
  b.part("sphere", base, [0, 0, 0.02], [0.16, 0.15, 0.16]);
  b.part("sphere", PINK, [0, -0.02 + sniff, 0.165], [0.025, 0.02, 0.015]);
  for (const s of [-1, 1]) {
    b.part("sphere", EYE, [s * 0.075, 0.03, 0.12], [0.025, 0.03, 0.02]);
    const twitch =
      Math.max(0, Math.sin(t * 2.3 + s * 2 + c.animal.offset) - 0.9) * 2;
    b.push(
      s * 0.06,
      0.1,
      -0.02,
      -0.15 - hop * 0.5,
      0,
      s * (-0.12 - twitch * 0.2),
    );
    b.part("sphere", base, [0, 0.16, 0], [0.05, 0.19, 0.035]);
    b.part("sphere", PINK, [0, 0.16, 0.022], [0.025, 0.14, 0.015]);
    b.pop();
  }
  b.pop();
  b.pop();
}

function duck(b: PartBatch, c: Creature, t: number) {
  const { base } = c.palette;
  b.push(
    0,
    Math.sin(t * 2 + c.animal.offset) * 0.025 - 0.07,
    0,
    Math.sin(t * 1.3 + c.animal.offset) * 0.04,
    0,
    Math.sin(t * 1.7) * 0.04,
  );
  b.part("sphere", base, [0, 0.26, 0], [0.28, 0.22, 0.44]);
  b.part(
    "sphere",
    shade(base, 0.85),
    [0, 0.33, -0.36],
    [0.14, 0.09, 0.14],
    [0.6, 0, 0],
  );
  for (const s of [-1, 1])
    b.part(
      "sphere",
      "#9b8060",
      [s * 0.24, 0.32, -0.04],
      [0.075, 0.13, 0.29],
      [0.1, 0, 0],
    );
  const dip = Math.max(0, Math.sin(t * 0.7 + c.animal.offset * 4) - 0.85) * 4;
  b.push(
    0,
    0.42,
    0.26,
    dip * 0.9 + Math.sin(t * 1.9) * 0.08,
    Math.sin(t * 0.6 + c.animal.offset) * 0.5,
    0,
  );
  b.part("sphere", "#365e49", [0, 0.13, 0.02], [0.16, 0.18, 0.16]);
  b.part("sphere", "#f2ead8", [0, 0.0, 0.03], [0.165, 0.035, 0.16]);
  b.part("sphere", "#e0a33b", [0, 0.1, 0.19], [0.07, 0.035, 0.1]);
  for (const s of [-1, 1])
    b.part("sphere", EYE, [s * 0.11, 0.17, 0.1], [0.022, 0.028, 0.02]);
  b.pop();
  b.pop();
}

function bird(b: PartBatch, index: number, t: number) {
  const pose = birdPose(t, index);
  b.push(pose.x, pose.y, pose.z, 0, pose.heading, pose.bank);
  const flap = Math.sin(t * 6 + index) * 0.55;
  b.part("sphere", "#e9e4d2", [0, 0, 0], [0.12, 0.13, 0.36]);
  b.part("sphere", "#e9e4d2", [0, 0.06, 0.3], [0.09, 0.09, 0.1]);
  b.part(
    "cone",
    "#d9aa50",
    [0, 0.05, 0.43],
    [0.035, 0.1, 0.035],
    [Math.PI / 2, 0, 0],
  );
  b.part("sphere", "#56615d", [0, 0.02, -0.38], [0.12, 0.03, 0.14]);
  for (const s of [-1, 1]) {
    b.push(s * 0.08, 0.03, 0, 0, 0, s * flap);
    b.part(
      "sphere",
      "#56615d",
      [s * 0.36, 0, -0.03],
      [0.4, 0.035, 0.16],
      [0, s * 0.2, 0],
    );
    b.pop();
  }
  b.pop();
}

/** Songbird plumage per world: sparrows, magpies, robins. */
const SONGBIRD: Record<WorldId, { body: string; belly: string; head: string; wing: string }> = {
  home: { body: "#8a6a4c", belly: "#dcc9a4", head: "#6a5039", wing: "#5d4633" },
  korea: { body: "#1f2228", belly: "#f1efe8", head: "#16181c", wing: "#e9e7e0" },
  stanford: { body: "#6c7178", belly: "#d27a45", head: "#3d4147", wing: "#585d64" },
};
// Reused part arguments: songbirds push no new arrays per frame.
const P: [number, number, number] = [0, 0, 0],
  S: [number, number, number] = [0, 0, 0],
  R: [number, number, number] = [0, 0, 0];
const v3 = (o: [number, number, number], x: number, y: number, z: number) => {
  o[0] = x;
  o[1] = y;
  o[2] = z;
  return o;
};
/** A ground songbird (pecks, hops, watches) or one in flight (flapping). */
function songbird(b: PartBatch, f: Flocks, i: number, world: WorldId, t: number) {
  const k = Math.floor(i / f.perFlock),
    state = f.state[k],
    air = state >= FLYING || f.y[i] > 0.2,
    c = SONGBIRD[world];
  b.push(f.x[i], f.y[i] + 0.06, f.z[i], air ? -0.15 : 0, f.heading[i], 0, 0.55);
  b.part("sphere", c.body, v3(P, 0, 0.12, 0), v3(S, 0.11, 0.1, 0.17));
  b.part("sphere", c.belly, v3(P, 0, 0.08, 0.04), v3(S, 0.085, 0.07, 0.12));
  b.part("sphere", c.body, v3(P, 0, 0.13, -0.2), v3(S, 0.05, 0.02, world === "korea" ? 0.17 : 0.1), v3(R, 0.35, 0, 0));
  // Head: pecks while feeding, up and still when alert.
  const peck =
    state === FEEDING && f.hop[i] >= 1 ? Math.max(0, Math.sin(t * 5 + i * 1.7)) ** 6 * 1.1 : state === ALERT ? -0.25 : 0;
  b.push(0, 0.2, 0.12, peck, 0, 0);
  b.part("sphere", c.head, v3(P, 0, 0.02, 0.02), v3(S, 0.07, 0.07, 0.075));
  b.part("cone", "#d9a441", v3(P, 0, 0.01, 0.1), v3(S, 0.022, 0.07, 0.022), v3(R, Math.PI / 2, 0, 0));
  b.pop();
  if (air) {
    const flap = Math.sin(t * (state === CIRCLING ? 14 : 22) + i) * 0.9;
    for (const side of [-1, 1]) {
      b.push(side * 0.07, 0.15, 0, 0, 0, side * flap);
      b.part("sphere", c.wing, v3(P, side * 0.16, 0, -0.02), v3(S, 0.18, 0.02, 0.08));
      b.pop();
    }
  } else {
    b.part("sphere", c.wing, v3(P, 0, 0.14, -0.04), v3(S, 0.115, 0.06, 0.13));
  }
  b.pop();
}
const SONGBIRD_SPHERES = 6,
  SONGBIRD_CONES = 1;

const DRAW = { cat, dog, rabbit, duck } as const;
const at = new THREE.Vector3(),
  facing = new THREE.Quaternion(),
  size = new THREE.Vector3();

const lastPlayer = { x: Number.NaN, z: 0, speed: 0 };
let liveFlocks: Flocks | null = null;
exposeQa({
  life: {
    flock: (k: number) =>
      liveFlocks && k < liveFlocks.flocks
        ? { state: FLOCK_STATE_NAMES[liveFlocks.state[k]], birds: liveFlocks.perFlock }
        : null,
  },
});

function Menagerie({
  animals,
  birds,
  world,
  songbirds,
}: {
  animals: Animal[];
  birds: number;
  world: WorldId;
  songbirds: number;
}) {
  const active = useWorldActive();
  const flocks = useMemo(() => createFlocks(world, songbirds), [world, songbirds]);
  useEffect(() => {
    liveFlocks = flocks;
    return () => {
      if (liveFlocks === flocks) liveFlocks = null;
    };
  }, [flocks]);
  const batch = useMemo(
    () =>
      new PartBatch({
        sphere: animals.length * 34 + birds * 6 + 8 + songbirds * 2 * SONGBIRD_SPHERES,
        cone: animals.length * 4 + birds + 2 + songbirds * 2 * SONGBIRD_CONES,
        capsule: animals.length * 10 + 2,
        box: 1,
      }),
    [animals, birds, songbirds],
  );
  const creatures = useMemo<Creature[]>(
    () =>
      animals.map((animal) => ({
        animal,
        yaw: 0,
        stride: animal.offset,
        speed: 0,
        last: null,
        palette: {
          base: animal.color,
          dark: shade(animal.color, animal.kind === "cat" ? 0.74 : 0.62),
          light:
            animal.kind === "cat"
              ? "#f6dfb9"
              : animal.kind === "dog"
                ? "#f1dbb3"
                : "#f7f0de",
        },
      })),
    [animals],
  );
  const songN = flocks.flocks * flocks.perFlock;
  const base = useRef(new THREE.Matrix4());
  // Below high the menagerie is a few pixels tall: coarser parts and no
  // shadow (medium's caster budget is 120k triangles).
  const full = (useStage.getState().tier ?? "high") === "high";
  const geometries = shapeGeometries(full ? "high" : "low");
  // Songbirds cast no shadow (Home's high shadow budget is spent): on high
  // they get their own sphere + cone batch (+2 draws, same program); below
  // high nothing in the menagerie casts, so they ride its batch (+0).
  const own = full && songN > 0;
  const birdBatch = useMemo(
    () => (own ? new PartBatch({ sphere: songN * SONGBIRD_SPHERES, cone: songN * SONGBIRD_CONES, capsule: 1, box: 1 }) : null),
    [own, songN],
  );
  useFrame((_, delta) => {
    if (!active) return;
    const dt = Math.min(delta, 0.05);
    const t = wildlifeClock.seconds;
    batch.begin();
    for (const c of creatures) {
      const pose = animalPose(c.animal, t);
      if (c.last && dt > 0) {
        const v = Math.hypot(pose.x - c.last[0], pose.z - c.last[1]) / dt;
        c.speed +=
          ((pose.moving ? Math.min(v, 4) : 0) - c.speed) *
          (1 - Math.exp(-dt * 8));
      }
      c.last = [pose.x, pose.z];
      const rate =
        c.animal.kind === "rabbit" ? 9 : c.animal.kind === "dog" ? 9 : 8;
      c.stride += dt * rate * Math.min(1, c.speed / 0.6);
      const diff = Math.atan2(
        Math.sin(pose.heading - c.yaw),
        Math.cos(pose.heading - c.yaw),
      );
      c.yaw += diff * (1 - Math.exp(-dt * 8));
      const scale =
        c.animal.kind === "rabbit"
          ? 0.8
          : c.animal.kind === "dog"
            ? 0.95
            : c.animal.kind === "duck"
              ? 1
              : 0.95;
      base.current.compose(
        at.set(pose.x, c.animal.kind === "duck" ? 0.16 : 0.2, pose.z),
        facing.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, c.yaw),
        size.setScalar(scale),
      );
      batch.pushMatrix(base.current);
      DRAW[c.animal.kind](batch, c, t);
      batch.pop();
    }
    if (birds) {
      const weather = sampleWeather(daylightClock.hour);
      const show =
        sampleDaylight(daylightClock.hour).night < 0.7 &&
        weather.rain < 0.4 &&
        weather.snow < 0.2;
      if (show) for (let i = 0; i < birds; i++) bird(batch, i, t);
    }
    // Ground flocks: react to the player, scatter with a feather burst.
    if (Number.isNaN(lastPlayer.x)) lastPlayer.x = runtime.x;
    if (dt > 0) {
      const v = Math.hypot(runtime.x - lastPlayer.x, runtime.z - lastPlayer.z) / dt;
      lastPlayer.speed += (Math.min(v, 12) - lastPlayer.speed) * (1 - Math.exp(-dt * 10));
    }
    lastPlayer.x = runtime.x;
    lastPlayer.z = runtime.z;
    stepFlocks(flocks, dt, runtime.x, runtime.z, lastPlayer.speed);
    if (flocks.scattered > 0) {
      flocks.scattered = 0;
      startBurst(flocks.lastX, 0.15, flocks.lastZ);
      cue("flutter");
      if (world === "korea") useGame.getState().earnStamp("korea.magpies");
    }
    const target = birdBatch ?? batch;
    if (birdBatch) birdBatch.begin();
    for (let i = 0; i < songN; i++) songbird(target, flocks, i, world, t);
    if (birdBatch) birdBatch.end();
    batch.end();
  });
  return (
    <group name="wildlife-menagerie">
      {SHAPES.map((shape) => (
        <instancedMesh
          key={shape}
          ref={(mesh) => {
            if (mesh) {
              batch.meshes[shape] = mesh;
              mesh.count = 0;
              mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            } else delete batch.meshes[shape];
          }}
          args={[geometries[shape], partMaterial(), batch.capacity[shape]]}
          frustumCulled={false}
          castShadow={full}
          receiveShadow
          userData={{ noBake: true }}
          dispose={null}
        />
      ))}
      {birdBatch &&
        (["sphere", "cone"] as const).map((shape) => (
          <instancedMesh
            key={`song-${shape}`}
            name={`songbirds-${shape}`}
            ref={(mesh) => {
              if (mesh) {
                birdBatch.meshes[shape] = mesh;
                mesh.count = 0;
                mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
              } else delete birdBatch.meshes[shape];
            }}
            args={[geometries[shape], partMaterial(), birdBatch.capacity[shape]]}
            frustumCulled={false}
            receiveShadow
            userData={{ noBake: true }}
            dispose={null}
          />
        ))}
    </group>
  );
}

const planeMaterials = new Map<string, THREE.MeshStandardMaterial>();
function PlanePart({
  p = [0, 0, 0],
  s,
  c,
  shape = "sphere",
}: {
  p?: [number, number, number];
  s: [number, number, number];
  c: string;
  shape?: "sphere" | "box";
}) {
  if (!planeMaterials.has(c))
    planeMaterials.set(
      c,
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }),
    );
  const g = shapeGeometries();
  return (
    <mesh
      position={p}
      scale={s}
      geometry={shape === "box" ? g.box : g.sphere}
      material={planeMaterials.get(c)}
      dispose={null}
    />
  );
}

function Plane() {
  const group = useRef<THREE.Group>(null),
    prop = useRef<THREE.Group>(null);
  useFrame(() => {
    const pose = planePose(wildlifeClock.seconds);
    if (group.current) {
      group.current.visible = pose.visible;
      group.current.position.set(pose.x, pose.y, pose.z);
      group.current.rotation.set(0, pose.heading, -0.04);
    }
    if (prop.current) prop.current.rotation.z = wildlifeClock.seconds * 48;
  });
  return (
    <group ref={group} name="wildlife-plane">
      <StaticBatch id="wildlife-plane">
        <PlanePart s={[0.37, 0.4, 1.8]} c="#e7dec5" />
        <PlanePart
          p={[0, 0.12, 0.35]}
          s={[3.6, 0.1, 0.7]}
          c="#b84534"
          shape="box"
        />
        <PlanePart p={[0, 0.4, 0.56]} s={[0.25, 0.28, 0.4]} c="#547d89" />
        <PlanePart
          p={[0, 0.1, -1.35]}
          s={[1.5, 0.08, 0.45]}
          c="#b84534"
          shape="box"
        />
        <PlanePart
          p={[0, 0.48, -1.28]}
          s={[0.09, 0.75, 0.6]}
          c="#b84534"
          shape="box"
        />
        {[-1, 1].map((side) => (
          <PlanePart
            key={side}
            p={[side * 0.4, -0.46, 0.45]}
            s={[0.13, 0.18, 0.18]}
            c="#39433a"
          />
        ))}
        <group ref={prop} position={[0, 0, 1.8]} userData={{ noBake: true }}>
          <PlanePart s={[0.07, 1.25, 0.07]} c="#554e42" shape="box" />
          <PlanePart s={[0.12, 0.12, 0.16]} c="#d3a64c" />
        </group>
      </StaticBatch>
    </group>
  );
}

export function Wildlife() {
  const quality = useGame((s) => s.quality);
  const world = useGame((s) => s.world);
  const tier = useStage((s) => s.tier) ?? "high";
  const active = useWorldActive();
  useFrame((_, delta) => {
    if (
      active &&
      runtime.active &&
      !useGame.getState().paused &&
      !document.hidden
    )
      wildlifeClock.seconds += Math.min(delta, 0.05);
  }, -1);
  const animals = useMemo(
    () =>
      animalsInWorld(world).filter((_, i) => quality === "high" || i % 2 === 0),
    [world, quality],
  );
  return (
    <group name="ambient-wildlife">
      <Weather />
      <Menagerie
        key={world}
        animals={animals}
        birds={quality === "high" ? 7 : 3}
        world={world}
        songbirds={LIFE_COUNTS[tier].birds}
      />
      <LifeSprites world={world} tier={tier} />
      <Plane />
    </group>
  );
}
