import { useFrame } from "@react-three/fiber";
import { Box3, Vector3, type Camera, type Object3D } from "three";
import { runtime, useGame, walkTo } from "../core/store";
import { destinationsInWorld } from "../core/world";

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
export function LabelProjection() {
  useFrame(({ camera, size, scene }) => {
    const occupied: LabelRect[] = [];
    const marker = scene.getObjectByName("player-location-arrow");
    if (marker) {
      const rect = markerLabelRect(marker, camera, size.width, size.height);
      if (rect) occupied.push(rect);
    }
    const shell = document.querySelector(".game-shell");
    if (shell) {
      const origin = shell.getBoundingClientRect();
      for (const control of shell.querySelectorAll(
        ".context-action.visible, .time-of-day-control, .world-zoom, .island-rail-controls, .world-toolbar, .joystick",
      )) {
        if (getComputedStyle(control).visibility === "hidden") continue;
        const bounds = control.getBoundingClientRect();
        if (!bounds.width || !bounds.height) continue;
        occupied.push({
          x: bounds.left - origin.left + bounds.width / 2,
          y: bounds.top - origin.top + bounds.height / 2,
          w: bounds.width + 20,
          h: bounds.height + 20,
        });
      }
    }
    const compact = size.height < 500;
    const distance = (door: { x: number; z: number }) =>
      Math.hypot(door.x - runtime.x, door.z - runtime.z);
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
        const w = element.offsetWidth + 16,
          h = element.offsetHeight + 14;
        const visible =
          Math.abs(projected.z) <= 1 &&
          distance(door) < (compact ? 25 : 36) &&
          x > w / 2 + 10 &&
          x < size.width - w / 2 - 10 &&
          y > (compact ? 75 : 100) &&
          y < size.height - (compact ? 80 : 155) &&
          !occupied.some((b) => labelsOverlap({ x, y, w, h }, b));
        element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        element.style.visibility = visible ? "visible" : "hidden";
        if (visible) occupied.push({ x, y, w, h });
      });
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
