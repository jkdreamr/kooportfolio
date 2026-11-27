import { useLayoutEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { WorldId } from "../../core/worlds";
import { runtime, useGame } from "../../core/store";
import { daylightClock } from "../../core/timeOfDay";
import { sampleWeather } from "../../core/weather";
import { useWorldActive } from "../../engine/active";
import { gloss, invalidateGlossEnvironment } from "../GlossKit";
import { onContextRestored } from "../../engine/Engine";
import { driveAtmosphere } from "./atmosphere";
import { envUniforms } from "./uniforms";
import { LeafShell } from "./LeafShell";
import { Grass } from "./Grass";
import { Rocks } from "./Rocks";
import { ShoreDetail } from "./ShoreDetail";
import { Ripples } from "./Ripples";
import { Lakes } from "./Lakes";
import { Groves } from "./Groves";
import { Understory } from "./Understory";
import { ContactShadows } from "./ContactShadows";
import { Clouds } from "./Clouds";
import { Roads } from "./Roads";
import { tickReflection } from "./reflection";
import { surfaceDetail, surfaceExplore } from "../Surface";
import { useEnvTier } from "./tier";
import { exposeQa } from "../../../stage/qa";
import { viewRuntime } from "../../core/worldView";
import { detailStats } from "./detail";

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
  const tier = useEnvTier();
  // Surface detail is a continuous knob (a uniform): low drops it entirely.
  useLayoutEffect(() => {
    surfaceDetail.value = tier === "low" ? 0 : 1;
  }, [tier]);
  return (
    <group name="env">
      <EnvironmentDriver />
      <Roads world={world} />
      <LeafShell />
      <Grass world={world} />
      <Understory world={world} />
      <Lakes world={world} />
      <Groves world={world} />
      <Rocks world={world} />
      <ShoreDetail world={world} />
      <Ripples world={world} />
      <ContactShadows world={world} />
      <Clouds />
    </group>
  );
}

// A restored context keeps every CPU-side texture (noise, shore maps, leaf
// atlas re-upload lazily) but loses render-target content: rebake the gloss
// environment on the next frame.
onContextRestored(() => invalidateGlossEnvironment());
// QA builds only: the view blend (read-only here) and the detail bake stats.
exposeQa({ viewRuntime, envDetail: detailStats });

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
  const tier = useEnvTier();
  useFrame(({ scene, camera }, delta) => {
    // The explore grade is a shared Surface uniform: interiors never get it.
    if (!active) {
      surfaceExplore.value = 0;
      return;
    }
    tickReflection();
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
    envUniforms.uEnvCamFade.value = viewRuntime.blend;
    envUniforms.uEnvPlayer.value.set(runtime.x, 0, runtime.z, 1.15);
    const weather = sampleWeather(daylightClock.hour);
    envUniforms.uEnvWind.value = THREE.MathUtils.lerp(
      envUniforms.uEnvWind.value,
      0.3 + weather.wind * 0.7,
      Math.min(1, delta),
    );
    // F4 explore grade: high tier only (medium/low keep their look).
    const look = tier === "high" ? viewRuntime.blend : 0;
    surfaceExplore.value = look;
    if (useGame.getState().scene === "hub") driveAtmosphere(scene, camera, delta, look);
  });
  return null;
}
