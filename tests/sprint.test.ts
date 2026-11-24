import { afterEach, expect, it } from "vitest";
import { keys, movement, movementSpeed } from "../src/game/core/input";
import { doors, moveWorld } from "../src/game/core/world";

afterEach(() => keys.clear());

it("only sprints while Shift is held, without changing movement direction", () => {
  keys.add("w");
  const walking = movementSpeed();
  const direction = movement();
  keys.add("shift");
  expect(movementSpeed()).toBeCloseTo(walking * 1.85);
  expect(movement()).toEqual(direction);
  keys.delete("shift");
  expect(movementSpeed()).toBe(walking);
  keys.add("shift");
  keys.clear(); // window blur uses the same reset
  expect(movementSpeed()).toBe(walking);
  expect(movement()).toEqual([0, 0]);
});

it("keeps indoor walking slower and cannot sprint through a building", () => {
  keys.add("shift");
  expect(movementSpeed(4)).toBeLessThan(movementSpeed());
  const kitchen = doors.find((door) => door.id === "kitchen")!;
  const result = moveWorld(
    kitchen.x,
    kitchen.z + 2,
    0,
    -movementSpeed() * 2,
    "home",
  );
  expect(result[1]).toBeGreaterThan(
    kitchen.footprint[1] + kitchen.footprint[3],
  );
});
