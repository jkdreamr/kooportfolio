import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activate,
  activateFocused,
  DEFAULT_REACH,
  discoveryRoomId,
  onInteract,
  pickFocus,
  registerInteractable,
  registerInteractables,
  resetInteractables,
  updateFocus,
  useInteractables,
  verbOf,
  type Interactable,
} from "../src/game/core/interactables";
import { isDiscovered, resetDiscoveries } from "../src/game/core/discoveries";

const item = (id: string, x: number, z: number, more: Partial<Interactable> = {}): Interactable => ({
  id,
  room: "test",
  x,
  z,
  label: id,
  verb: "Use",
  use: () => {},
  ...more,
});

beforeEach(() => {
  resetInteractables();
  resetDiscoveries();
});

describe("pickFocus", () => {
  it("takes the nearest item within its reach", () => {
    const a = item("a", 1, 0),
      b = item("b", 2, 0);
    expect(pickFocus([a, b], 0, 0)).toBe(a);
    expect(pickFocus([a, b], 2.4, 0)).toBe(b);
    expect(pickFocus([a, b], 1 + DEFAULT_REACH + 2.1, 0)).toBe(null);
  });
  it("honours a custom reach and the enabled flag", () => {
    const far = item("far", 5, 0, { reach: 6 });
    const off = item("off", 0.5, 0, { enabled: () => false });
    expect(pickFocus([far, off], 0, 0)).toBe(far);
  });
  it("keeps the current focus unless another is clearly closer", () => {
    const a = item("a", -1, 0),
      b = item("b", 1.2, 0);
    expect(pickFocus([a, b], 0, 0, undefined, b)).toBe(b);
    expect(pickFocus([a, b], -0.6, 0, undefined, b)).toBe(a);
  });
  it("prefers what the player faces when distances tie", () => {
    const front = item("front", 0, 1.5),
      back = item("back", 0, -1.5);
    expect(pickFocus([back, front], 0, 0, 0)).toBe(front);
    expect(pickFocus([front, back], 0, 0, Math.PI)).toBe(back);
  });
  it("follows a moving item", () => {
    let at: [number, number] = [9, 9];
    const carried = item("carried", 0, 0, { position: () => at });
    expect(pickFocus([carried], 0, 0)).toBe(null);
    at = [0.5, 0.5];
    expect(pickFocus([carried], 0, 0)).toBe(carried);
  });
});

describe("registry and activation", () => {
  it("registers, replaces by id and removes", () => {
    const off = registerInteractable(item("a", 0, 0));
    const replacement = item("a", 3, 3);
    registerInteractable(replacement);
    expect(useInteractables.getState().items).toEqual([replacement]);
    off(); // the first one is already gone: nothing changes
    expect(useInteractables.getState().items).toEqual([replacement]);
    const offAll = registerInteractables([item("b", 0, 0), item("c", 0, 0)]);
    expect(useInteractables.getState().items.length).toBe(3);
    offAll();
    expect(useInteractables.getState().items).toEqual([replacement]);
  });

  it("updateFocus writes the store only on change and clears when blocked", () => {
    registerInteractable(item("a", 0, 1));
    let writes = 0;
    const off = useInteractables.subscribe(() => writes++);
    expect(updateFocus(0, 0)?.id).toBe("a");
    updateFocus(0.1, 0);
    updateFocus(0.2, 0);
    expect(writes).toBe(1);
    expect(updateFocus(0, 0, 0, true)).toBe(null);
    expect(useInteractables.getState().focus).toBe(null);
    off();
  });

  it("activateFocused uses the focus, records the discovery once, and notifies", () => {
    const use = vi.fn();
    registerInteractable(item("lamp", 0, 1, { use }));
    const seen: boolean[] = [];
    const off = onInteract((e) => seen.push(e.first));
    expect(activateFocused()).toBe(false);
    updateFocus(0, 0);
    expect(activateFocused()).toBe(true);
    expect(activateFocused("button")).toBe(true);
    off();
    expect(use).toHaveBeenCalledTimes(2);
    expect(seen).toEqual([true, false]);
    expect(isDiscovered("test", "lamp")).toBe(true);
    expect(useInteractables.getState().uses).toBe(2);
    expect(useInteractables.getState().last?.source).toBe("button");
  });

  it("items can opt out of discovery, and disabled items do nothing", () => {
    const use = vi.fn();
    const quiet = item("door", 0, 0, { discover: false, use });
    expect(activate(quiet)).toBe(true);
    expect(isDiscovered("test", "door")).toBe(false);
    expect(activate(item("off", 0, 0, { enabled: () => false, use }))).toBe(false);
    expect(use).toHaveBeenCalledTimes(1);
  });

  it("removing the focused item drops the focus", () => {
    const off = registerInteractable(item("a", 0, 0));
    updateFocus(0, 0);
    off();
    expect(useInteractables.getState().focus).toBe(null);
  });

  it("verbs may be functions (toggles)", () => {
    let on = false;
    const lamp = item("lamp", 0, 0, { verb: () => (on ? "Switch off" : "Switch on") });
    expect(verbOf(lamp)).toBe("Switch on");
    on = true;
    expect(verbOf(lamp)).toBe("Switch off");
  });

  it("files the two cinemas separately", () => {
    expect(discoveryRoomId("home", "theater")).toBe("theater");
    expect(discoveryRoomId("korea", "theater")).toBe("theater-korea");
    expect(discoveryRoomId("stanford", "gym")).toBe("gym");
  });
});
