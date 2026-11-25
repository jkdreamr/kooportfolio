import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { runtime, useGame } from "../core/store";
import { daylightClock } from "../core/timeOfDay";
import { sampleWeather } from "../core/weather";
import { wildlifeClock } from "../core/wildlife";

function mistTexture() {
  const size = 64,
    pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
      pixels.set([225, 233, 230, Math.round(Math.max(0, 1 - d) ** 2 * 255)], i);
    }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.needsUpdate = true;
  return texture;
}

/** Two batched precipitation draws and soft local mist, never a screen overlay. */
export function Weather() {
  const rain = useRef<THREE.InstancedMesh>(null),
    snow = useRef<THREE.InstancedMesh>(null);
  const fog = useRef<THREE.Group>(null);
  const quality = useGame((s) => s.quality),
    [reduced, setReduced] = useState(false);
  const texture = useMemo(mistTexture, []),
    dummy = useMemo(() => new THREE.Object3D(), []);
  const rainCount = quality === "high" ? 360 : 120,
    snowCount = quality === "high" ? 180 : 70;
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    change();
    query.addEventListener("change", change);
    return () => {
      query.removeEventListener("change", change);
      texture.dispose();
    };
  }, [texture]);
  useFrame(() => {
    const weather = sampleWeather(daylightClock.hour),
      t = wildlifeClock.seconds;
    if (fog.current) {
      fog.current.children.forEach((child, i) => {
        child.position.set(
          runtime.x + Math.sin(t * 0.025 + i * 1.7) * 19,
          1.5 + i * 0.4,
          runtime.z + Math.cos(i * 2.1 + t * 0.018) * 17,
        );
        (child as THREE.Sprite).material.opacity = weather.fog * 0.23;
      });
    }
    for (const [ref, count, strength, isRain] of [
      [rain, rainCount, weather.rain, true],
      [snow, snowCount, weather.snow, false],
    ] as const) {
      const mesh = ref.current;
      if (!mesh) continue;
      mesh.visible = strength > 0.01 && !reduced;
      if (!mesh.visible) continue;
      mesh.count = Math.floor(count * strength);
      // Offsets wrap around the player in a fixed 48-cell so each flake keeps a
      // stable world position instead of translating with the player's motion.
      const wrap = (v: number) => THREE.MathUtils.euclideanModulo(v, 48) - 24;
      for (let i = 0; i < mesh.count; i++) {
        const height = 21 - ((t * (isRain ? 13 : 1.1) + i * 0.83) % 21);
        dummy.position.set(
          runtime.x +
            wrap(i * 13.371 + t * (isRain ? 1.4 : 0.3) - runtime.x) +
            (isRain ? 0 : Math.sin(t + i) * 0.6),
          height,
          runtime.z + wrap(i * 7.919 - runtime.z),
        );
        dummy.rotation.set(
          isRain ? 0 : t * 0.2 + i,
          0,
          isRain ? -0.12 : t * 0.3,
        );
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <group name="village-weather">
      <instancedMesh
        ref={rain}
        args={[undefined, undefined, rainCount]}
        frustumCulled={false}
        raycast={() => {}}
      >
        <boxGeometry args={[0.018, 0.48, 0.018]} />
        <meshBasicMaterial
          color="#b9d6e0"
          transparent
          opacity={0.48}
          depthWrite={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={snow}
        args={[undefined, undefined, snowCount]}
        frustumCulled={false}
        raycast={() => {}}
      >
        <octahedronGeometry args={[0.075, 0]} />
        <meshBasicMaterial
          color="#ebf5ff"
          transparent
          opacity={0.75}
          depthWrite={false}
        />
      </instancedMesh>
      <group ref={fog}>
        {Array.from({ length: quality === "high" ? 5 : 3 }, (_, i) => (
          <sprite key={i} scale={[28, 7, 1]} raycast={() => {}}>
            <spriteMaterial
              map={texture}
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
            />
          </sprite>
        ))}
      </group>
    </group>
  );
}
