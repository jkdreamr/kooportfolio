import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { activeNpcActors, useNpcs } from "../core/npcState";
import { usePortrait } from "../core/npcPortrait";
import { useGame } from "../core/store";

/**
 * One head-and-shoulders snapshot of the villager you start talking to, for
 * the dialogue portrait. Drawn once per conversation, before the frame's own
 * render, into a scissored corner of the same canvas with the same renderer,
 * scene, lights and materials (so no new programs), read back, and then
 * painted over by the frame. Only the crowd and the lights are drawn: they
 * join PORTRAIT_LAYER for that one call.
 */
const PORTRAIT_LAYER = 9;
const SIZE = 224; // device pixels
/** Must match the portrait's backdrop in npc-conversation.css. */
const BACKDROP = new THREE.Color("#f4e6c6");
const WAIT_FRAMES = 8; // let the villager turn to face the player first

export function NpcPortraitShot() {
  const { gl, scene, size, invalidate } = useThree();
  const camera = useRef<THREE.PerspectiveCamera>(null!);
  if (!camera.current) {
    camera.current = new THREE.PerspectiveCamera(26, 1, 0.1, 8);
    camera.current.layers.set(PORTRAIT_LAYER);
  }
  const pending = useRef<{ id: string; frames: number } | null>(null);
  useEffect(
    () =>
      useNpcs.subscribe((state, prev) => {
        if (state.talking && state.talking !== prev.talking) {
          pending.current = { id: state.talking, frames: WAIT_FRAMES };
          invalidate();
        }
      }),
    [invalidate],
  );
  useFrame(() => {
    const job = pending.current;
    if (!job) return;
    if (--job.frames > 0) {
      invalidate();
      return;
    }
    pending.current = null;
    if (useNpcs.getState().talking !== job.id) return;
    const actor = activeNpcActors(useGame.getState().world).find((a) => a.id === job.id);
    const crowd = scene.getObjectByName("village-npcs");
    if (!actor || !crowd) return;
    const src = shoot(gl, scene, crowd, camera.current, actor, size);
    if (src && useNpcs.getState().talking === job.id) usePortrait.setState({ id: job.id, src });
  });
  return null;
}

const clearColor = new THREE.Color();
function shoot(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  crowd: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  actor: { x: number; z: number; heading: number },
  size: { width: number; height: number },
): string | null {
  // A three-quarter view from in front of the face, a touch above the eyes.
  const turn = actor.heading + 0.38;
  camera.position.set(actor.x + Math.sin(turn) * 1.4, 1.5, actor.z + Math.cos(turn) * 1.4);
  camera.lookAt(actor.x, 1.28, actor.z);
  // The crowd is one batch, so a villager standing between the lens and the
  // speaker can't be left out by layer; the near plane clips them instead
  // (only what is within ~0.5 m of the speaker's head is drawn).
  camera.near = 0.9;
  camera.far = 2.4;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const joined: THREE.Object3D[] = [];
  const join = (object: THREE.Object3D) => {
    if (object.layers.isEnabled(PORTRAIT_LAYER)) return;
    object.layers.enable(PORTRAIT_LAYER);
    joined.push(object);
  };
  scene.traverse((object) => {
    if ((object as THREE.Light).isLight) join(object);
  });
  crowd.traverse(join);
  const background = scene.background,
    autoClear = gl.autoClear,
    shadowAuto = gl.shadowMap.autoUpdate,
    infoReset = gl.info.autoReset,
    clearAlpha = gl.getClearAlpha(),
    target = gl.getRenderTarget();
  gl.getClearColor(clearColor);
  const ratio = gl.getPixelRatio();
  const side = SIZE / ratio;
  let pixels: Uint8Array | null = new Uint8Array(SIZE * SIZE * 4);
  try {
    scene.background = null;
    gl.autoClear = false;
    gl.shadowMap.autoUpdate = false;
    gl.info.autoReset = false;
    gl.setRenderTarget(null);
    gl.setViewport(0, 0, side, side);
    gl.setScissor(0, 0, side, side);
    gl.setScissorTest(true);
    gl.setClearColor(BACKDROP, 1);
    gl.clear(true, true, false);
    gl.render(scene, camera);
    const context = gl.getContext();
    context.readPixels(0, 0, SIZE, SIZE, context.RGBA, context.UNSIGNED_BYTE, pixels);
  } catch {
    pixels = null;
  } finally {
    for (const object of joined) object.layers.disable(PORTRAIT_LAYER);
    scene.background = background;
    gl.autoClear = autoClear;
    gl.shadowMap.autoUpdate = shadowAuto;
    gl.info.autoReset = infoReset;
    gl.setClearColor(clearColor, clearAlpha);
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    gl.setScissor(0, 0, size.width, size.height);
    gl.setRenderTarget(target);
  }
  if (!pixels) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(SIZE, SIZE);
  const row = SIZE * 4;
  // WebGL reads bottom-up; the opaque backdrop keeps alpha at 1.
  for (let y = 0; y < SIZE; y++)
    image.data.set(pixels.subarray((SIZE - 1 - y) * row, (SIZE - y) * row), y * row);
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
  context.putImageData(image, 0, 0);
  // A frame with nothing drawn (the villager culled, a lost context) shows
  // the drawn bust instead.
  let blank = true;
  const [r, g, b] = [image.data[0], image.data[1], image.data[2]];
  for (let i = 0; i < image.data.length && blank; i += 64)
    blank = image.data[i] === r && image.data[i + 1] === g && image.data[i + 2] === b;
  return blank ? null : canvas.toDataURL("image/png");
}
