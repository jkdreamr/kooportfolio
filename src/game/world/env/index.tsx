import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { WorldId } from "../../core/worlds";
import { runtime, useGame } from "../../core/store";
import { daylightClock } from "../../core/timeOfDay";
import { sampleWeather } from "../../core/weather";
import { useWorldActive } from "../../engine/active";
import { gloss } from "../GlossKit";
import { driveAtmosphere } from "./atmosphere";
import { envUniforms } from "./uniforms";
import { LeafShell } from "./LeafShell";
import { Grass } from "./Grass";
import { Rocks } from "./Rocks";
import { ShoreDetail } from "./ShoreDetail";
import { Ripples } from "./Ripples";
import { Lakes } from "./Lakes";
import { Groves } from "./Groves";

/**
 * Environment layer (W3): foliage shells, grass, rocks, shoreline, atmosphere.
 * Hub mounts exactly one <Environment world={world} /> per island, inside the
 * persistent world root (dispose={null} is applied above it by the engine).
 *
 * Rules for this subtree:
 * - Read tier budgets via `useEnvTier()` (contract tier, legacy quality
 *   fallback). Allocate for the tier's maximum once; adapt at run time only by
 *   `mesh.count` / uniforms (never by toggling materials, defines or
 *   castShadow).
 * - Gate per-frame work with `useWorldActive()` (the hub stays mounted but
 *   hidden while an interior is shown).
 */
export function Environment({ world }: { world: WorldId }) {
  return (
    <group name="env">
      <EnvironmentDriver />
      <LeafShell />
      <Grass world={world} />
      <Lakes world={world} />
      <Groves world={world} />
      <Rocks world={world} />
      <ShoreDetail world={world} />
      <Ripples world={world} />
    </group>
  );
}

const reducedMotion =
  typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)")
    : null;
const sunDir = new THREE.Vector3();
let sun: THREE.DirectionalLight | null = null;
let hemisphere: THREE.HemisphereLight | null = null;

/** Writes the shared environment uniforms and the hub's atmosphere. */
function EnvironmentDriver() {
  const active = useWorldActive();
  useFrame(({ scene, camera }, delta) => {
    if (!active) return;
    if (import.meta.env.DEV)
      (window as unknown as { __w3scene?: THREE.Scene }).__w3scene = scene;
    const paused = useGame.getState().paused;
    if (!paused && !reducedMotion?.matches)
      envUniforms.uEnvTime.value =
        (envUniforms.uEnvTime.value + Math.min(delta, 0.1)) % 3600;
    if (!sun || !sun.parent) {
      const found = scene.getObjectByName("world-sun");
      sun = found instanceof THREE.DirectionalLight ? found : null;
    }
    if (!hemisphere || !hemisphere.parent) {
      const found = scene.getObjectByName("world-hemisphere");
      hemisphere = found instanceof THREE.HemisphereLight ? found : null;
    }
    if (sun) {
      sunDir.copy(sun.position).sub(sun.target.position);
      if (sunDir.lengthSq() > 1e-6)
        envUniforms.uEnvSunDir.value.copy(sunDir.normalize());
      envUniforms.uEnvSunColor.value
        .copy(sun.color)
        .multiplyScalar(Math.min(1.4, sun.intensity / 3));
    }
    if (hemisphere)
      envUniforms.uEnvSky.value
        .copy(hemisphere.color)
        .multiplyScalar(Math.min(1.1, 0.35 + hemisphere.intensity * 0.7));
    envUniforms.uEnvNight.value = gloss.night.value;
    envUniforms.uEnvPlayer.value.set(runtime.x, 0, runtime.z, 1.15);
    const weather = sampleWeather(daylightClock.hour);
    envUniforms.uEnvWind.value = THREE.MathUtils.lerp(
      envUniforms.uEnvWind.value,
      0.3 + weather.wind * 0.7,
      Math.min(1, delta),
    );
    if (useGame.getState().scene === "hub") driveAtmosphere(scene, camera);
  });
  return null;
}
