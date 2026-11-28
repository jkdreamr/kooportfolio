/**
 * The Banner Rush stage (§1.1): a group at GAME_STAGE_Y with its own fitted
 * camera and exactly one extra light (the game-stage key light). Everything
 * else is the batches of view.ts and the baked set.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { engine } from "./engineApi";
import * as THREE from "three";
const GAME_STAGE_Y = 1000; // InteriorGameStage.GAME_STAGE_Y (checked in BannerRush.tsx)
import { ARENA_SCALE, fitCamera, safeInsets, setPose, type CameraFit } from "./camera";
import { ArenaSet, GROUND_LIGHT, type Ground } from "./ArenaSet";
import { Towers } from "./Towers";
import type { RushRuntime } from "./runtime";
import type { RushView } from "./view";

/** Camera move on top of the fitted pose: push (fraction of distance toward a point), flatten (deg). */
export const camMove = { push: 0, toX: 0, toZ: 0, flatten: 0 };

const useFrame: EngineFns["useFrame"] = (...a) => engine().useFrame(...a);
const useThree: EngineFns["useThree"] = ((sel: never) => engine().useThree(sel)) as EngineFns["useThree"];
const PerspectiveCamera: EngineFns["PerspectiveCamera"] = ((p: object) => { const C = engine().PerspectiveCamera as unknown as (q: object) => React.ReactElement; return <C {...p} />; }) as unknown as EngineFns["PerspectiveCamera"];
type EngineFns = import("./engineApi").EngineApi;

export function Stage({
  rt,
  view,
  ground,
  onFrame,
  safeExtra,
}: {
  rt: RushRuntime;
  view: RushView;
  ground: Ground;
  onFrame: (dt: number) => void;
  safeExtra: () => { top: number; bottom: number };
}) {
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const fit = useRef<CameraFit | null>(null);
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, GAME_STAGE_Y, 0);
    return o;
  }, []);
  const light = GROUND_LIGHT[ground];
  const refit = () => {
    const extra = safeExtra();
    const base = safeInsets(size.width, size.height);
    const f = fitCamera(size.width, size.height, { ...base, top: base.top + extra.top, bottom: base.bottom + extra.bottom });
    fit.current = f;
    const rect = gl.domElement.getBoundingClientRect();
    setPose(f, size.width, size.height, rect.left, rect.top);
  };
  useLayoutEffect(refit, [size.width, size.height]);
  const look = useMemo(() => new THREE.Vector3(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, dt) => {
    const cam = camera.current;
    const f = fit.current;
    if (cam && f) {
      // Fitted pose plus the scripted offset (intro, tower falls).
      pos.set(f.position[0], f.position[1], f.position[2]);
      look.set(f.target[0], f.target[1], f.target[2]);
      if (camMove.flatten || camMove.push) {
        const dx = look.x - pos.x,
          dy = look.y - pos.y,
          dz = look.z - pos.z;
        const k = -camMove.flatten * 0.02;
        pos.y += dy * k * 0.5;
        pos.z -= dz * k;
        const p = camMove.push;
        pos.x += (camMove.toX * ARENA_SCALE - pos.x) * p * 0.15 + dx * p;
        pos.y += dy * p;
        pos.z += dz * p;
      }
      cam.position.set(pos.x, GAME_STAGE_Y + pos.y, pos.z);
      cam.fov = f.fov;
      cam.near = f.near;
      cam.far = f.far;
      cam.lookAt(look.x, GAME_STAGE_Y + look.y, look.z);
      cam.updateProjectionMatrix();
    }
    onFrame(dt);
    if (cam) view.draw(rt, Math.min(dt, 0.1), cam);
    void state;
  });
  useEffect(() => () => view.dispose(), [view]);
  return (
    <>
      <PerspectiveCamera ref={camera} makeDefault fov={32} near={0.5} far={120} position={[0, GAME_STAGE_Y + 30, 20]} />
      <primitive object={target} />
      <directionalLight
        position={[4, GAME_STAGE_Y + 12, 5]}
        target={target}
        intensity={light.intensity}
        color={light.color}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-far={40}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
      />
      <group position={[0, GAME_STAGE_Y, 0]} scale={ARENA_SCALE} name="banner-rush-stage">
        <ArenaSet ground={ground} />
        <Towers />
        <primitive object={view.group} />
      </group>
    </>
  );
}
