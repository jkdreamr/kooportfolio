import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { insidePolygon } from "../../core/coast";
import type { WorldId } from "../../core/worlds";
import { useWorldActive } from "../../engine/active";
import { envUniforms } from "./uniforms";
import { lakesFor, pondFor } from "./placement";

/**
 * Expanding ripple rings on still water — rising fish, a drip from a reed —
 * one instanced, depth-tested, non-writing draw. A fixed pool respawns
 * itself on the island's lakes, pond and river; heavier in the rain.
 */

const POOL = 28;
const LIFE = 3.2;

type Surface = { y: number; sample: (r: () => number) => [number, number] | null; weight: number };

function surfacesFor(world: WorldId): Surface[] {
  const out: Surface[] = [];
  for (const lake of lakesFor(world)) {
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const [x, z] of lake.outline) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    out.push({
      y: lake.y + 0.01,
      weight: (maxX - minX) * (maxZ - minZ),
      sample: (r) => {
        for (let k = 0; k < 8; k++) {
          const x = minX + r() * (maxX - minX),
            z = minZ + r() * (maxZ - minZ);
          if (insidePolygon(x, z, lake.outline)) return [x, z];
        }
        return null;
      },
    });
  }
  const pond = pondFor(world);
  if (pond)
    out.push({
      y: 0.262,
      weight: pond.radiusX * pond.radiusZ * 3,
      sample: (r) => {
        const a = r() * Math.PI * 2,
          d = Math.sqrt(r()) * 0.82;
        return [pond.x + Math.cos(a) * d * pond.radiusX, pond.z + Math.sin(a) * d * pond.radiusZ];
      },
    });
  if (world === "korea")
    out.push({
      y: -2.29,
      weight: 74 * 14,
      sample: (r) => [-11 + r() * 72, 24 + r() * 18],
    });
  return out;
}

function ringMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uEnvTime: envUniforms.uEnvTime,
      uEnvSky: envUniforms.uEnvSky,
      uEnvNight: envUniforms.uEnvNight,
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute vec4 aRing; // x, y, z, birth time
      attribute float aSize;
      uniform float uEnvTime;
      varying vec2 vRingUv;
      varying float vRingAge;
      void main() {
        vRingAge = clamp((uEnvTime - aRing.w) / ${LIFE.toFixed(1)}, 0.0, 1.0);
        vRingUv = position.xy * 2.0;
        vec3 world = aRing.xyz + vec3(position.x, 0.0, position.y) * aSize * (0.25 + vRingAge * 1.6);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uEnvSky;
      uniform float uEnvNight;
      varying vec2 vRingUv;
      varying float vRingAge;
      void main() {
        float d = length(vRingUv);
        float ring = smoothstep(0.78, 0.9, d) * (1.0 - smoothstep(0.92, 1.0, d))
          + 0.5 * smoothstep(0.42, 0.5, d) * (1.0 - smoothstep(0.52, 0.6, d)) * (1.0 - vRingAge);
        float alpha = ring * (1.0 - vRingAge) * smoothstep(0.0, 0.08, vRingAge) * 0.55;
        if (alpha < 0.004) discard;
        vec3 color = mix(vec3(0.92, 0.97, 1.0), uEnvSky, 0.35) * (1.0 - uEnvNight * 0.6);
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }`,
  });
}
const material = ringMaterial();
const noRaycast = () => undefined;

export function Ripples({ world }: { world: WorldId }) {
  const active = useWorldActive();
  const surfaces = useMemo(() => surfacesFor(world), [world]);
  const geometry = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    const plane = new THREE.PlaneGeometry(1, 1);
    g.index = plane.index;
    g.setAttribute("position", plane.getAttribute("position"));
    g.setAttribute("aRing", new THREE.InstancedBufferAttribute(new Float32Array(POOL * 4), 4));
    g.setAttribute("aSize", new THREE.InstancedBufferAttribute(new Float32Array(POOL), 1));
    g.instanceCount = surfaces.length ? POOL : 0;
    return g;
  }, [surfaces]);
  const seed = useRef(1);
  useFrame(() => {
    if (!active || !surfaces.length) return;
    const now = envUniforms.uEnvTime.value;
    const ring = geometry.getAttribute("aRing") as THREE.InstancedBufferAttribute;
    const size = geometry.getAttribute("aSize") as THREE.InstancedBufferAttribute;
    const total = surfaces.reduce((s, x) => s + x.weight, 0);
    const rand = () => {
      seed.current = (seed.current * 16807) % 2147483647;
      return seed.current / 2147483647;
    };
    let dirty = false;
    for (let i = 0; i < POOL; i++) {
      const birth = ring.getW(i);
      const age = now - birth;
      // Running, or waiting for its staggered start.
      if (birth !== 0 && age < LIFE && age > -4) continue;
      let pick = rand() * total;
      const surface = surfaces.find((s) => (pick -= s.weight) <= 0) ?? surfaces[0];
      const at = surface.sample(rand);
      if (!at) continue;
      // Stagger: each ring waits a little before starting.
      ring.setXYZW(i, at[0], surface.y, at[1], now + rand() * 2.5);
      size.setX(i, 0.5 + rand() * 0.9);
      dirty = true;
    }
    if (dirty) {
      ring.needsUpdate = true;
      size.needsUpdate = true;
    }
  });
  return (
    <mesh
      name="env-ripples"
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={2}
      raycast={noRaycast}
      dispose={null}
    />
  );
}
