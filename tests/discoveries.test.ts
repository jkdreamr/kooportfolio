import { beforeEach, describe, expect, it } from "vitest";
import {
  allProgress,
  declareRoom,
  isDiscovered,
  markDiscovered,
  onDiscovery,
  parseDiscoveries,
  resetDiscoveries,
  roomProgress,
  serializeDiscoveries,
  useDiscoveries,
  type DiscoveryEvent,
} from "../src/game/core/discoveries";

beforeEach(() => {
  resetDiscoveries();
  useDiscoveries.setState({ rooms: {} });
});

describe("discoveries", () => {
  it("counts a find once and reports room progress", () => {
    declareRoom("music", ["record", "synth", "lamp"]);
    expect(roomProgress("music")).toEqual({ found: 0, total: 3 });
    expect(markDiscovered("music", "record")).toBe(true);
    expect(markDiscovered("music", "record")).toBe(false);
    expect(isDiscovered("music", "record")).toBe(true);
    expect(isDiscovered("music", "synth")).toBe(false);
    expect(roomProgress("music")).toEqual({ found: 1, total: 3 });
  });

  it("tells listeners about first finds, and when a room is complete", () => {
    declareRoom("go", ["bell", "kettle"]);
    const events: DiscoveryEvent[] = [];
    const off = onDiscovery((e) => events.push(e));
    markDiscovered("go", "bell");
    markDiscovered("go", "bell");
    markDiscovered("go", "kettle");
    off();
    markDiscovered("go", "other");
    expect(events).toEqual([
      { roomId: "go", itemId: "bell", found: 1, total: 2, roomComplete: false },
      { roomId: "go", itemId: "kettle", found: 2, total: 2, roomComplete: true },
    ]);
  });

  it("a throwing listener never loses the find", () => {
    declareRoom("gym", ["erg"]);
    const off = onDiscovery(() => {
      throw new Error("boom");
    });
    expect(markDiscovered("gym", "erg")).toBe(true);
    off();
    expect(isDiscovered("gym", "erg")).toBe(true);
  });

  it("sums every declared room for the stamp card", () => {
    declareRoom("a", ["1", "2"]);
    declareRoom("b", ["1"]);
    markDiscovered("a", "2");
    markDiscovered("b", "1");
    // Same item id in two rooms is two different finds.
    expect(allProgress()).toEqual({ rooms: { a: { found: 1, total: 2 }, b: { found: 1, total: 1 } }, found: 2, total: 3 });
  });

  it("undeclared items are remembered but do not move a total", () => {
    declareRoom("a", ["1"]);
    markDiscovered("a", "ghost");
    expect(roomProgress("a")).toEqual({ found: 0, total: 1 });
    declareRoom("a", ["1", "ghost"]);
    expect(roomProgress("a")).toEqual({ found: 1, total: 2 });
  });

  it("round-trips through storage text and survives junk", () => {
    declareRoom("a", ["1", "2"]);
    markDiscovered("a", "1");
    const text = serializeDiscoveries(useDiscoveries.getState().found);
    expect(parseDiscoveries(text)).toEqual({ "a:1": true });
    for (const junk of [null, "", "{", "[]", '{"v":2,"found":["a:1"]}', '{"v":1,"found":"a:1"}', '{"v":1,"found":[3,"nocolon","a:1"]}'])
      expect(Object.keys(parseDiscoveries(junk)).every((k) => k === "a:1")).toBe(true);
    expect(parseDiscoveries('{"v":1,"found":[3,"nocolon","a:1"]}')).toEqual({ "a:1": true });
  });

  it("declaring the same items again changes nothing", () => {
    declareRoom("a", ["1", "2", "2"]);
    const before = useDiscoveries.getState().rooms;
    declareRoom("a", ["1", "2"]);
    expect(useDiscoveries.getState().rooms).toBe(before);
  });
});
