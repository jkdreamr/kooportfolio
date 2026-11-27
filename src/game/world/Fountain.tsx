import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { registerWarmup, useStage } from "../../stage/contract";
import { useWorldActive } from "../engine/active";
import { daylightClock } from "../core/timeOfDay";
import { sampleDaylight, sampleSkyPalette } from "../core/daylight";
import {
  FOUNTAIN_FAR,
  FOUNTAIN_MAX_JETS,
  FOUNTAIN_TIME_WRAP,
  fountainParticleCount,
  type FountainSpec,
} from "../core/fountain";
import {
  makeMaterials,
  makeUniforms,
  particleGeometry,
  rippleGeometry,
  targetIsSrgb,
} from "./fountainWater";

/**
 * Fountain water: arcing jets, a central plume, splash droplets, mist and
 * ripple rings, in two draws and ~1.8k triangles.
 *
 * - Two draws also on high: N8AO's transparency pass skips them.
 * - Particles: one instanced quad stream; every position is a closed-form
 *   parabola of (time, per-particle seed) in the vertex shader. The CPU only
 *   writes a few uniforms per frame and allocates nothing.
 * - Ripples, landing foam and a shimmer: one overlay (a quad on the basin
 *   water and one on the bowl) shaded in the fragment shader.
 * - RawShaderMaterial: its program key is its source alone (no lights, fog,
 *   tone mapping or render-target colour space), so the warmup below links
 *   both programs before `ready`, whatever world is loaded, and nothing
 *   links on arrival. Output colour space is a uniform, set per draw.
 * - Tier: a rank-sorted prefix of the particles (high 100%, medium 60%,
 *   low 30%). Culled off-screen (explicit bounds) and beyond FOUNTAIN_FAR.
 * - prefers-reduced-motion: slower water and a steadier sparkle.
 */

/** Link both programs during the hidden warmup (any world, any tier): the
 * proxies' materials are kept, so the cached programs are never released
 * and every later fountain reuses them. */
const warm = makeMaterials(makeUniforms());
registerWarmup({
  id: "fountain-water",
  priority: 47,
  async run({ gl, camera }) {
    const renderer = gl as THREE.WebGLRenderer;
    const scene = new THREE.Scene();
    const triangle = new THREE.BufferGeometry();
    triangle.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0], 3),
    );
    triangle.setAttribute("aA", new THREE.Float32BufferAttribute(new Array(12).fill(0), 4));
    triangle.setAttribute("aB", new THREE.Float32BufferAttribute(new Array(12).fill(0), 4));
    triangle.setAttribute("aDisc", new THREE.Float32BufferAttribute(new Array(6).fill(0), 2));
    for (const material of [warm.particles, warm.ripples]) {
      const mesh = new THREE.Mesh(triangle, material);
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
    try {
      await renderer.compileAsync(scene, camera as THREE.Camera);
    } catch {
      // Best effort: a failure links on first draw as before.
    }
    triangle.dispose();
  },
});

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

// N8AO (high tier) re-renders every transparent mesh in its transparency
// pass; thin spray needs no AO mask, so stay at two draws per fountain.
const skipAoTransparency = { treatAsOpaque: true };
const toCamera = new THREE.Vector3();
const sky = new THREE.Color();

/** Fountain water for a basin described by `spec`, at `position` (the
 * basin centre on the ground, in the parent's frame; keep the parent
 * unscaled). Two draws; nothing when hidden, off-screen or far. */
export function FountainWater({
  spec,
  position,
}: {
  spec: FountainSpec;
  position: readonly [number, number, number];
}) {
  const group = useRef<THREE.Group>(null);
  const tier = useStage((state) => state.tier) ?? "high";
  const active = useWorldActive();
  const reduced = useReducedMotion();
  const built = useMemo(() => {
    const uniforms = makeUniforms();
    uniforms.uShape.value.set(spec.basinY, spec.landRadius, spec.bowlY, spec.bowlRadius);
    uniforms.uJet.value.set(spec.jetApex, spec.plumeHeight);
    uniforms.uJets.value.set(Math.min(FOUNTAIN_MAX_JETS, spec.jets), spec.jetAngle);
    return {
      uniforms,
      materials: makeMaterials(uniforms),
      particles: particleGeometry(spec),
      ripples: rippleGeometry(spec),
    };
  }, [spec]);
  useLayoutEffect(() => {
    built.particles.instanceCount = fountainParticleCount(spec.jets, tier);
  }, [built, spec, tier]);
  useEffect(
    () => () => {
      built.particles.dispose();
      built.ripples.dispose();
      built.materials.particles.dispose();
      built.materials.ripples.dispose();
    },
    [built],
  );
  const lastHour = useRef(Number.NaN);
  useFrame(({ camera }, delta) => {
    const root = group.current;
    if (!root) return;
    let shown = active;
    if (shown) {
      root.getWorldPosition(toCamera);
      shown = toCamera.distanceToSquared(camera.position) < FOUNTAIN_FAR ** 2;
    }
    root.visible = shown;
    if (!shown) return;
    const u = built.uniforms;
    // Calmer, not frozen: slower water under prefers-reduced-motion.
    u.uTime.value = (u.uTime.value + Math.min(delta, 0.1) * (reduced ? 0.45 : 1)) % FOUNTAIN_TIME_WRAP;
    const hour = daylightClock.hour;
    if (Math.abs(hour - lastHour.current) > 0.02 || Number.isNaN(lastHour.current)) {
      lastHour.current = hour;
      const light = sampleDaylight(hour);
      const palette = sampleSkyPalette(hour);
      sky.setRGB(...palette.sky, THREE.SRGBColorSpace);
      const level = 0.42 + 0.58 * Math.min(1, light.key / 3.1);
      // Soft white-blue, tinted by the sky it reflects, dimmer by night.
      u.uColor.value.setRGB(0.8, 0.9, 1).lerp(sky, 0.35).multiplyScalar(level);
      u.uRippleColor.value.setRGB(0.88, 0.95, 1).lerp(sky, 0.3).multiplyScalar(level);
      u.uGlint.value
        .setRGB(...palette.sun, THREE.SRGBColorSpace)
        .multiplyScalar((1 - light.night) * (reduced ? 0.35 : 0.9));
    }
  });
  const onBeforeRender = (gl: THREE.WebGLRenderer) => {
    built.uniforms.uSRGB.value = targetIsSrgb(gl);
  };
  return (
    <group ref={group} position={[...position]} userData={{ noBake: true }}>
      <mesh
        geometry={built.ripples}
        material={built.materials.ripples}
        renderOrder={1}
        userData={skipAoTransparency}
        onBeforeRender={onBeforeRender}
        raycast={() => {}}
      />
      <mesh
        geometry={built.particles}
        material={built.materials.particles}
        renderOrder={2}
        userData={skipAoTransparency}
        onBeforeRender={onBeforeRender}
        raycast={() => {}}
      />
    </group>
  );
}
