import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { runtime, useGame, walkTo } from "../core/store";
import { destinations, destinationsInWorld } from "../core/world";

const elements = new Map<string, HTMLButtonElement>();
const projected = new Vector3();

// Keep labels in the main React DOM tree, not independent roots inside Canvas.
// The renderer only updates their projection; React owns their full lifecycle.
export function LabelProjection() {
  useFrame(({ camera, size }) => {
    const occupied: { x: number; y: number; w: number; h: number }[] = [];
    // Physical door actions win over projected destination labels, including
    // the frame in which the mobile prompt animates into view.
    const prompt = document
      .querySelector(".context-action.visible")
      ?.getBoundingClientRect();
    if (prompt) {
      const origin = document
        .querySelector(".game-shell")
        ?.getBoundingClientRect();
      occupied.push({
        x: prompt.left - (origin?.left ?? 0) + prompt.width / 2,
        y: prompt.top - (origin?.top ?? 0) + prompt.height / 2,
        w: prompt.width + 20,
        h: prompt.height + 20,
      });
    }
    const compact = size.height < 500;
    const distance = (door: (typeof destinations)[number]) =>
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
          !occupied.some(
            (b) =>
              Math.abs(x - b.x) < (w + b.w) / 2 &&
              Math.abs(y - b.y) < (h + b.h) / 2,
          );
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
