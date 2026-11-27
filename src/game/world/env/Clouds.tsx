import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { viewRuntime } from "../../core/worldView";
import { useWorldActive } from "../../engine/active";
import { envUniforms } from "./uniforms";
import { journeyAtmosphere } from "./atmosphere";

/**
 * Sky depth (PLAN2 §1.3, B5): soft cloud billboards on two horizon rings that
 * travel with the camera (so they sit at "infinity"): 12 near, and 6 larger,
 * fainter ones at 1.6× the distance. One instanced draw of a
 * MeshBasicMaterial with a canvas-painted alpha, drifting 0.4° a minute.
 * Shown in both views: in the walk view on the horizon, in the diorama far
 * behind and below the island (beyond it, so they never cross it). Tinted
 * each frame from the haze (fog) colour and the sun, so they follow the time
 * of day; the far ring leans toward the haze, which reads as half the
 * opacity. Unfogged (the haze would erase them), never shadowed.
 */

const NEAR = 12;
const FAR = 6;
const COUNT = NEAR + FAR;
const RING = 260;
/** Drift: 0.4° per minute, in radians per second. */
const DRIFT = ((0.4 * Math.PI) / 180) / 60;
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
/** 256×128 cumulus: overlapping soft puffs over a flat base, white with alpha.
 * Shared with the travel wisps (IslandJourney). */
export function cloudTexture() {
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
/** A material that links the same program as the clouds (same parameters),
 * for another instanced cloud draw with its own colour and opacity. */
export function cloudLikeMaterial() {
  return new THREE.MeshBasicMaterial({
    map: cloudTexture(),
    transparent: true,
    depthWrite: false,
    fog: false,
    opacity: 0,
  });
}
export const cloudGeometry = new THREE.PlaneGeometry(1, 0.5);
const geometry = cloudGeometry;
const tint = new THREE.Color(),
  warm = new THREE.Color(),
  faint = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);

export function Clouds() {
  const active = useWorldActive();
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const cloudMat = useMemo(cloudMaterial, []);
  const drift = useRef(0);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const rand = random(77);
    const object = new THREE.Object3D();
    for (let i = 0; i < COUNT; i++) {
      const far = i >= NEAR;
      const k = far ? i - NEAR : i;
      const n = far ? FAR : NEAR;
      const angle = (k / n) * Math.PI * 2 + (rand() - 0.5) * 0.35 + (far ? Math.PI / FAR : 0);
      const radius = RING * (far ? 1.6 : 1) * (0.85 + rand() * 0.3);
      // Low on the horizon and modest in size: distant cumulus, not a blob
      // filling the top of a walk-view frame.
      const width = (46 + rand() * 40) * (far ? 1.6 : 1);
      object.position.set(Math.cos(angle) * radius, (far ? 10 : 3) + rand() * 14, Math.sin(angle) * radius);
      object.lookAt(0, object.position.y, 0);
      object.scale.set(width * (rand() < 0.5 ? -1 : 1), width * (0.8 + rand() * 0.3), 1);
      object.updateMatrix();
      m.setMatrixAt(i, object.matrix);
      m.setColorAt(i, WHITE);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);
  useFrame(({ camera, scene }, delta) => {
    const g = group.current;
    const m = mesh.current;
    if (!g || !m) return;
    // Hidden by count, never by `visible`: the program compiles in warmup.
    m.count = active ? COUNT : 0;
    if (!active) return;
    const blend = viewRuntime.blend;
    drift.current = (drift.current + Math.min(delta, 0.1) * DRIFT) % (Math.PI * 2);
    g.rotation.y = drift.current;
    // Diorama: a ring well beyond the island (1.45× the viewing distance)
    // and below it; walk view: the horizon ring at eye level.
    const reach = typeof camera.userData.viewDistance === "number" ? camera.userData.viewDistance : RING;
    const scale = THREE.MathUtils.lerp(Math.max(1, (reach * 1.45) / RING), 1, blend);
    g.scale.setScalar(scale);
    g.position.set(camera.position.x, THREE.MathUtils.lerp(-70, 0, blend), camera.position.z);
    const fog = scene.fog as THREE.Fog | null;
    tint.set(fog ? fog.color : "#cfe0ee");
    const own = tintLit(tint);
    // The far ring leans toward the haze: half as present as the near one.
    faint.setRGB(
      THREE.MathUtils.lerp(1, tint.r / Math.max(1e-3, own.r), 0.45),
      THREE.MathUtils.lerp(1, tint.g / Math.max(1e-3, own.g), 0.45),
      THREE.MathUtils.lerp(1, tint.b / Math.max(1e-3, own.b), 0.45),
    );
    for (let i = NEAR; i < COUNT; i++) m.setColorAt(i, faint);
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    cloudMat.color.copy(own);
    // Behind the travel veil only the veil's own wisps remain.
    cloudMat.opacity = 0.8 * THREE.MathUtils.lerp(0.6, 1, blend) * (1 - journeyAtmosphere.veil);
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

const lit = new THREE.Color();
/** The haze colour lit warm by the sun (by day): the clouds' own colour. */
function tintLit(haze: THREE.Color) {
  warm.copy(envUniforms.uEnvSunColor.value).multiplyScalar(0.5);
  return lit.copy(haze).lerp(warm.addScalar(0.45), 0.45 * (1 - envUniforms.uEnvNight.value));
}
