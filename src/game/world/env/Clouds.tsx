import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { viewRuntime } from "../../core/worldView";
import { useWorldActive } from "../../engine/active";
import { envUniforms } from "./uniforms";

/**
 * Sky depth for the explore view (PLAN2 §1.3): 12 soft cloud billboards on a
 * horizon ring that travels with the camera (so they sit at "infinity"), one
 * instanced draw of a MeshBasicMaterial with a canvas-painted alpha. Shown
 * only while the view blend is above 0, faded in with it; tinted each frame
 * from the horizon (fog) colour and the sun, so they follow the time of day.
 * Unfogged (the haze would erase them), never shadowed.
 */

const COUNT = 12;
const RING = 260;
const noRaycast = () => undefined;

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let texture: THREE.Texture | null = null;
/** 256×128 cumulus: overlapping soft puffs over a flat base, white with alpha. */
function cloudTexture() {
  if (texture) return texture;
  const w = 256,
    h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  const rand = random(4242);
  const puff = (x: number, y: number, r: number, a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.55, `rgba(255,255,255,${a * 0.75})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    const x = 40 + t * 176 + (rand() - 0.5) * 20;
    const lift = Math.sin(t * Math.PI);
    puff(x, 92 - lift * 26 - rand() * 12, 18 + lift * 22 + rand() * 10, 0.55);
  }
  // Flat, slightly denser base.
  for (let i = 0; i < 10; i++) puff(36 + i * 20, 98, 16, 0.4);
  // Fade the bottom edge so the base never reads as a cut.
  g.globalCompositeOperation = "destination-in";
  const fade = g.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(0.78, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = fade;
  g.fillRect(0, 0, w, h);
  texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.name = "env-clouds";
  return texture;
}

let material: THREE.MeshBasicMaterial | null = null;
function cloudMaterial() {
  material ??= new THREE.MeshBasicMaterial({
    map: cloudTexture(),
    transparent: true,
    depthWrite: false,
    fog: false,
    opacity: 0,
  });
  return material;
}
const geometry = new THREE.PlaneGeometry(1, 0.5);
const tint = new THREE.Color(),
  warm = new THREE.Color();

export function Clouds() {
  const active = useWorldActive();
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const cloudMat = useMemo(cloudMaterial, []);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const rand = random(77);
    const object = new THREE.Object3D();
    for (let i = 0; i < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2 + (rand() - 0.5) * 0.35;
      const radius = RING * (0.85 + rand() * 0.3);
      const width = 70 + rand() * 60;
      object.position.set(Math.cos(angle) * radius, 6 + rand() * 22, Math.sin(angle) * radius);
      object.lookAt(0, object.position.y, 0);
      object.scale.set(width * (rand() < 0.5 ? -1 : 1), width * (0.8 + rand() * 0.3), 1);
      object.updateMatrix();
      m.setMatrixAt(i, object.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, []);
  useFrame(({ camera, scene }) => {
    const g = group.current;
    if (!g) return;
    const blend = active ? viewRuntime.blend : 0;
    // Hidden by count, never by `visible`: the program compiles in warmup.
    const m = mesh.current;
    if (m) m.count = blend > 0 ? COUNT : 0;
    if (blend <= 0) return;
    g.position.set(camera.position.x, 0, camera.position.z);
    const fog = scene.fog as THREE.Fog | null;
    tint.set(fog ? fog.color : "#cfe0ee");
    warm.copy(envUniforms.uEnvSunColor.value).multiplyScalar(0.5);
    tint.lerp(warm.addScalar(0.45), 0.45 * (1 - envUniforms.uEnvNight.value));
    cloudMat.color.copy(tint);
    cloudMat.opacity = 0.82 * Math.min(1, blend * 1.5);
  });
  return (
    <group ref={group} name="env-clouds">
      <instancedMesh
        ref={mesh}
        args={[geometry, cloudMat, COUNT]}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={-2}
        dispose={null}
      />
    </group>
  );
}
