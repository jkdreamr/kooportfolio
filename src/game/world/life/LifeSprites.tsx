import { useEffect, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { registerWarmup, type Tier } from "../../../stage/contract";
import { runtime, useGame } from "../../core/store";
import { daylightClock } from "../../core/timeOfDay";
import { sampleDaylight } from "../../core/daylight";
import { sampleWeather } from "../../core/weather";
import { canWalk } from "../../core/world";
import { activitySpots } from "../../core/regionalActivities";
import { HERO_SPOTS } from "../../core/heroSpots";
import type { WorldId } from "../../core/worlds";
import { useWorldActive } from "../../engine/active";
import { BEACON_SLOTS, BURST_SLOTS, LIFE_COUNTS, butterflyOrigins, lifeSignals } from "../../core/life";
import { targetIsSrgb } from "../fountainWater";
import {
  KIND_BUTTERFLY,
  KIND_CHEVRON,
  KIND_FEATHER,
  KIND_RING,
  lifeGeometry,
  lifeSpritesMaterial,
  lifeUniforms,
  type SpriteSpec,
} from "./lifeSprites";

// Link the program during the hidden warmup (any world, any tier). The
// material is module-level and never disposed, so the cached program is
// kept and nothing links on arrival.
registerWarmup({
  id: "life-sprites",
  priority: 46,
  async run({ gl, camera }) {
    const renderer = gl as THREE.WebGLRenderer;
    const scene = new THREE.Scene();
    const geometry = lifeGeometry([{ kind: KIND_RING, x: 0, y: 0, z: 0, seed: 0, size: 0, slot: 0 }]);
    const mesh = new THREE.Mesh(geometry, lifeSpritesMaterial);
    mesh.frustumCulled = false;
    scene.add(mesh);
    try {
      await renderer.compileAsync(scene, camera as THREE.Camera);
    } catch {
      // Best effort: a failure links on first draw as before.
    }
    geometry.dispose();
  },
});

/** Feather colour per world: Korea's flock is magpies. */
const FEATHER: Record<WorldId, string> = { home: "#8a6a4c", korea: "#2a2d33", stanford: "#7c7f86" };

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    change();
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return reduced;
}

export function buildSpecs(world: WorldId, tier: Tier, reduced: boolean): SpriteSpec[] {
  const counts = LIFE_COUNTS[tier];
  const specs: SpriteSpec[] = [];
  const anchors = [
    HERO_SPOTS[world].position,
    ...activitySpots.filter((s) => s.world === world).map((s) => s.p),
  ];
  if (!reduced) {
    const origins = butterflyOrigins(world, counts.butterflies, anchors, (x, z) => canWalk(x, z, world));
    for (let i = 0; i < origins.length / 3; i++)
      specs.push({
        kind: KIND_BUTTERFLY,
        x: origins[i * 3],
        y: origins[i * 3 + 1],
        z: origins[i * 3 + 2],
        seed: (i * 0.618034) % 1,
        size: 0.075 + ((i * 37) % 5) * 0.008,
        slot: 0,
      });
  }
  for (let slot = 0; slot < BURST_SLOTS; slot++)
    for (let i = 0; i < counts.feathers; i++)
      specs.push({ kind: KIND_FEATHER, x: 0, y: 0, z: 0, seed: (i + 0.5) / counts.feathers, size: 0.07, slot });
  for (let slot = 0; slot < BEACON_SLOTS; slot++) {
    specs.push({ kind: KIND_RING, x: 0, y: 0, z: 0, seed: 0, size: 1, slot });
    specs.push({ kind: KIND_CHEVRON, x: 0, y: 0, z: 0, seed: 0, size: 1, slot });
  }
  return specs;
}

const sky = { hour: Number.NaN };

/** Butterflies/fireflies, feather bursts and carry beacons: one draw. */
export function LifeSprites({ world, tier }: { world: WorldId; tier: Tier }) {
  const active = useWorldActive();
  const reduced = useReducedMotion();
  const geometry = useMemo(() => lifeGeometry(buildSpecs(world, tier, reduced)), [world, tier, reduced]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    lifeUniforms.uFeather.value.set(FEATHER[world]);
  }, [world]);
  useFrame((_, delta) => {
    if (!active) return;
    const u = lifeUniforms;
    if (!useGame.getState().paused) lifeSignals.clock += Math.min(delta, 0.1);
    u.uTime.value = lifeSignals.clock;
    u.uPlayer.value.set(runtime.x, 0, runtime.z);
    for (let k = 0; k < BURST_SLOTS; k++) u.uBursts.value[k].fromArray(lifeSignals.bursts, k * 4);
    for (let k = 0; k < BEACON_SLOTS; k++) u.uBeacons.value[k].fromArray(lifeSignals.beacons, k * 4);
    const hour = daylightClock.hour;
    if (Math.abs(hour - sky.hour) > 0.02 || Number.isNaN(sky.hour)) {
      sky.hour = hour;
      const light = sampleDaylight(hour),
        weather = sampleWeather(hour);
      u.uNight.value = light.night;
      u.uRain.value = weather.rain;
      u.uLight.value = 0.4 + 0.6 * Math.min(1, light.key / 2.6);
    }
  });
  return (
    <mesh
      name="life-sprites"
      geometry={geometry}
      material={lifeSpritesMaterial}
      frustumCulled={false}
      userData={{ noBake: true }}
      onBeforeRender={(gl) => {
        lifeUniforms.uSRGB.value = targetIsSrgb(gl);
      }}
      raycast={() => {}}
      dispose={null}
    />
  );
}
