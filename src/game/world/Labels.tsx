import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { useGame, walkTo } from "../core/store";
import { doors } from "../core/world";

const elements = new Map<string, HTMLButtonElement>();
const projected = new Vector3();

// Keep labels in the main React DOM tree, not independent roots inside Canvas.
// The renderer only updates their projection; React owns their full lifecycle.
export function LabelProjection() {
  useFrame(({ camera, size }) => {
    doors.forEach((door) => {
      const element = elements.get(door.id);
      if (!element) return;
      projected.set(door.anchor[0], door.anchor[1], door.anchor[2]).project(camera);
      element.style.transform = `translate(${((projected.x + 1) * size.width) / 2}px, ${((-projected.y + 1) * size.height) / 2}px) translate(-50%, -50%)`;
      element.style.visibility =
        Math.abs(projected.z) <= 1 &&
        Math.abs(projected.x) < 0.95 &&
        Math.abs(projected.y) < 0.8
          ? "visible"
          : "hidden";
    });
  });
  return null;
}

export function WorldLabels() {
  const level = useGame((s) => s.save.upgrades.boathouse);
  return (
    <nav className="world-labels" aria-label="Village places">
      {doors.map((door) => (
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
