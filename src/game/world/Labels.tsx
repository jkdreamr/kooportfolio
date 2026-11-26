import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3, Vector3, type Camera, type Object3D } from "three";
import { runtime, useGame, walkTo } from "../core/store";
import { destinationsInWorld } from "../core/world";
import { viewRuntime } from "../core/worldView";

const elements = new Map<string, HTMLButtonElement>();
const projected = new Vector3();
const markerBox = new Box3();
const markerCorner = new Vector3();

type LabelRect = { x: number; y: number; w: number; h: number };

export function labelsOverlap(a: LabelRect, b: LabelRect) {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2
  );
}

// DOM place labels render above Canvas. Reserve the marker's actual projected
// bounds as well as HUD controls, so a label cannot hide the player on mobile.
export function markerLabelRect(
  marker: Object3D,
  camera: Camera,
  width: number,
  height: number,
): LabelRect | null {
  for (let parent: Object3D | null = marker; parent; parent = parent.parent)
    if (!parent.visible) return null;
  markerBox.setFromObject(marker);
  if (markerBox.isEmpty()) return null;
  let left = Infinity,
    right = -Infinity,
    top = Infinity,
    bottom = -Infinity;
  for (let corner = 0; corner < 8; corner++) {
    markerCorner
      .set(
        corner & 1 ? markerBox.max.x : markerBox.min.x,
        corner & 2 ? markerBox.max.y : markerBox.min.y,
        corner & 4 ? markerBox.max.z : markerBox.min.z,
      )
      .project(camera);
    const x = ((markerCorner.x + 1) * width) / 2;
    const y = ((1 - markerCorner.y) * height) / 2;
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    w: right - left + 12,
    h: bottom - top + 12,
  };
}

// Keep labels in the main React DOM tree, not independent roots inside Canvas.
// The renderer only updates their projection; React owns their full lifecycle.
//
// Layout discipline: label sizes come from a ResizeObserver cache and HUD
// control rects are re-read at most every 250 ms, all reads before any write,
// so a frame never forces a synchronous layout. Projection runs at ~20 Hz, or
// immediately when the camera or the player moved.
const sizes = new WeakMap<Element, { w: number; h: number }>();
const observer =
  typeof ResizeObserver === "function"
    ? new ResizeObserver((entries) => {
        for (const entry of entries) {
          const box = entry.borderBoxSize?.[0];
          const target = entry.target as HTMLElement;
          sizes.set(target, {
            w: box ? box.inlineSize : target.offsetWidth,
            h: box ? box.blockSize : target.offsetHeight,
          });
        }
      })
    : null;
function labelSize(element: HTMLElement) {
  let size = sizes.get(element);
  if (!size) {
    size = { w: element.offsetWidth, h: element.offsetHeight };
    sizes.set(element, size);
    observer?.observe(element);
  }
  return size;
}
const CONTROLS =
  ".context-action.visible, .time-of-day-control, .world-zoom, .world-view-toggle, .island-rail-controls, .world-toolbar, .joystick";
let controlRects: LabelRect[] = [];
let controlsReadAt = -Infinity;
function readControls(now: number) {
  if (now - controlsReadAt < 250) return controlRects;
  controlsReadAt = now;
  const shell = document.querySelector(".game-shell");
  controlRects = [];
  if (!shell) return controlRects;
  const origin = shell.getBoundingClientRect();
  for (const control of shell.querySelectorAll(CONTROLS)) {
    if (getComputedStyle(control).visibility === "hidden") continue;
    const bounds = control.getBoundingClientRect();
    if (!bounds.width || !bounds.height) continue;
    controlRects.push({
      x: bounds.left - origin.left + bounds.width / 2,
      y: bounds.top - origin.top + bounds.height / 2,
      w: bounds.width + 20,
      h: bounds.height + 20,
    });
  }
  return controlRects;
}
const shown = new WeakMap<HTMLElement, string>();
function place(element: HTMLElement, transform: string, visible: boolean, frosted: boolean) {
  const key = `${transform}|${visible ? 1 : 0}|${frosted ? 1 : 0}`;
  if (shown.get(element) === key) return;
  shown.set(element, key);
  element.style.transform = transform;
  element.style.visibility = visible ? "visible" : "hidden";
  element.classList.toggle("is-frosted", frosted);
}
export function hideAllLabels() {
  for (const element of elements.values()) {
    if (shown.get(element)?.includes("|0|")) continue;
    shown.set(element, "hidden|0|0");
    element.style.visibility = "hidden";
    element.classList.remove("is-frosted");
  }
}

export function LabelProjection({ active = true }: { active?: boolean }) {
  const last = useMemo(
    () => ({ at: -Infinity, camera: new Float64Array(17), x: NaN, z: NaN }),
    [],
  );
  useFrame(({ camera, size, scene, clock }) => {
    if (!active) {
      hideAllLabels();
      return;
    }
    const now = clock.elapsedTime * 1000;
    // Skip when nothing that affects placement changed and the 20 Hz tick
    // has not come round.
    const m = camera.matrixWorld.elements;
    const p = camera.projectionMatrix.elements;
    let moved = runtime.x !== last.x || runtime.z !== last.z;
    for (let i = 0; i < 16 && !moved; i++)
      if (m[i] !== last.camera[i]) moved = true;
    if (p[0] !== last.camera[16]) moved = true;
    if (!moved && now - last.at < 50) return;
    last.at = now;
    last.x = runtime.x;
    last.z = runtime.z;
    for (let i = 0; i < 16; i++) last.camera[i] = m[i];
    last.camera[16] = p[0];

    // --- reads ---
    const occupied: LabelRect[] = [];
    const marker = scene.getObjectByName("player-location-arrow");
    if (marker) {
      const rect = markerLabelRect(marker, camera, size.width, size.height);
      if (rect) occupied.push(rect);
    }
    occupied.push(...readControls(now));
    const compact = size.height < 500;
    const explore = viewRuntime.blend > 0.5;
    const distance = (door: { x: number; z: number }) =>
      Math.hypot(door.x - runtime.x, door.z - runtime.z);
    const placements: [HTMLElement, string, boolean][] = [];
    destinationsInWorld(useGame.getState().world)
      .sort((a, b) => distance(a) - distance(b))
      .forEach((door) => {
        const element = elements.get(door.id);
        if (!element) return;
        projected
          .set(door.anchor[0], door.anchor[1], door.anchor[2])
          .project(camera);
        const x = ((projected.x + 1) * size.width) / 2,
          y = ((-projected.y + 1) * size.height) / 2;
        const label = labelSize(element);
        const w = label.w + 16,
          h = label.h + 14;
        const visible =
          Math.abs(projected.z) <= 1 &&
          distance(door) < (compact ? 25 : 36) &&
          // Explore view: only the plaques near the low camera.
          (!explore ||
            camera.position.distanceTo(
              projected.set(door.anchor[0], door.anchor[1], door.anchor[2]),
            ) < 45) &&
          x > w / 2 + 10 &&
          x < size.width - w / 2 - 10 &&
          y > (compact ? 75 : 100) &&
          y < size.height - (compact ? 80 : 155) &&
          !occupied.some((b) => labelsOverlap({ x, y, w, h }, b));
        placements.push([
          element,
          `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`,
          visible,
        ]);
        if (visible) occupied.push({ x, y, w, h });
      });
    // --- writes ---
    // Glass budget: only the nearest few plaques may frost (see glass.css).
    let frosted = 0;
    for (const [element, transform, visible] of placements)
      place(element, transform, visible, visible && frosted++ < 4);
  });
  return null;
}

export function WorldLabels() {
  const world = useGame((s) => s.world);
  return (
    <nav className="world-labels" aria-label="Village places">
      {destinationsInWorld(world).map((door) => (
        <button
          key={door.id}
          ref={(element) => {
            if (element) elements.set(door.id, element);
            else elements.delete(door.id);
          }}
          className="world-label"
          onClick={() => walkTo(door.x, door.z)}
        >
          <span className="label-dot" />
          {door.name}
        </button>
      ))}
    </nav>
  );
}
