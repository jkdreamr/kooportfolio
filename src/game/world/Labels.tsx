import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { runtime, useGame, walkTo } from "../core/store";
import { destinationsInWorld } from "../core/world";

const elements = new Map<string, HTMLButtonElement>();
const projected = new Vector3();

type LabelRect = { x: number; y: number; w: number; h: number };

export function labelsOverlap(a: LabelRect, b: LabelRect) {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2
  );
}

// Keep labels in the main React DOM tree, not independent roots inside Canvas.
// The renderer only updates their projection; React owns their full lifecycle.
export function LabelProjection() {
  useFrame(({ camera, size }) => {
    const occupied: LabelRect[] = [];
    const shell = document.querySelector(".game-shell");
    if (shell) {
      const origin = shell.getBoundingClientRect();
      for (const control of shell.querySelectorAll(
        ".context-action.visible, .time-of-day-control, .world-zoom",
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
  const level = useGame((s) => s.save.upgrades.boathouse);
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
          {door.id === "boathouse" && (
            <span className="label-level">LV {level}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
