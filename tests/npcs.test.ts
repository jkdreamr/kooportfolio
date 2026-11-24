import { beforeEach, describe, expect, it } from "vitest";
import {
  approachNpc,
  canTalkToNpc,
  createNpcActors,
  nearestNpc,
  stepNpc,
  TALK_DISTANCE,
  villagers,
} from "../src/game/core/npcs";
import { canWalk, doors, findPath } from "../src/game/core/world";
import {
  advanceConversation,
  closeConversation,
  interactWithNpc,
  npcActors,
  nearbyNpcId,
  talkToNpc,
  useNpcs,
} from "../src/game/core/npcState";
import { runtime, useGame } from "../src/game/core/store";
import { belongsToWorld, WORLD_IDS } from "../src/game/core/worlds";

const worldFor = (place: string) =>
  WORLD_IDS.find((world) => belongsToWorld(place, world))!;

describe("wandering village crowd", () => {
  it.each(villagers)(
    "gives $id a reachable loop without cutting through world obstacles",
    (npc) => {
      const actors = createNpcActors();
      expect(actors.length).toBeGreaterThanOrEqual(24);
      const actor = actors.find((actor) => actor.id === npc.id)!,
        world = worldFor(npc.place);
      expect(canWalk(actor.x, actor.z, world), npc.id).toBe(true);
      for (let j = 0; j < npc.route.length; j++) {
        const from = npc.route[j],
          to = npc.route[(j + 1) % npc.route.length];
        expect(canWalk(...to, world), `${npc.id}: ${to}`).toBe(true);
        expect(
          findPath(from, to, world).length,
          `${npc.id}: ${from} → ${to}`,
        ).toBeGreaterThan(0);
      }
      const visited = new Set<string>();
      for (let frame = 0; frame < 60 * 90; frame++) {
        stepNpc(actor, npc, 1 / 60, [1000, 1000], false, false, world);
        expect(canWalk(actor.x, actor.z, world), npc.id).toBe(true);
        visited.add(`${Math.round(actor.x)},${Math.round(actor.z)}`);
      }
      expect(visited.size, `${npc.id} should actually wander`).toBeGreaterThan(
        12,
      );
    },
    15000,
  );
  it("stops near the player, faces them, and freezes without consuming a route while paused", () => {
    const actor = createNpcActors()[0],
      npc = villagers[0];
    const position = [actor.x, actor.z];
    stepNpc(actor, npc, 1 / 60, [actor.x + 1, actor.z]);
    expect([actor.x, actor.z]).toEqual(position);
    expect(actor.heading).toBeCloseTo(Math.PI / 2);
    expect(actor.moving).toBe(false);
    const before = structuredClone(actor);
    stepNpc(actor, npc, 8, [100, 100], true);
    expect(actor).toEqual(before);
    expect(
      nearestNpc([actor], actor.x + TALK_DISTANCE + 0.1, actor.z),
    ).toBeUndefined();
    expect(nearestNpc([actor], actor.x + 1, actor.z)).toBe(actor);
  });
  it("approaches a selected local on a walkable path ending within talking distance", () => {
    for (const actor of createNpcActors()) {
      const npc = villagers.find((npc) => npc.id === actor.id)!;
      const world = worldFor(npc.place);
      const path = approachNpc(actor, [0, 5], world);
      expect(path.length, actor.id).toBeGreaterThan(0);
      expect(path.every((point) => canWalk(...point, world))).toBe(true);
      const last = path.at(-1)!;
      expect(Math.hypot(last[0] - actor.x, last[1] - actor.z)).toBeLessThan(
        TALK_DISTANCE,
      );
    }
  });
  it("rests on the bench visually without routing into its solid table, then resumes the errand", () => {
    const actor = createNpcActors().find((actor) => actor.id === "reader")!;
    const npc = villagers.find((npc) => npc.id === actor.id)!;
    expect(actor.pose).toBe("sit");
    expect(canWalk(actor.x, actor.z, "home")).toBe(true);
    expect(canWalk(...actor.seat!.position, "home")).toBe(false);
    const waiting = actor.wait;
    stepNpc(actor, npc, 1 / 60, [actor.x + 1, actor.z], false, true, "home");
    expect(actor.pose).toBe("stand");
    expect(actor.wait).toBe(waiting);
    expect(actor.heading).toBeCloseTo(Math.PI / 2);
    const paused = structuredClone(actor);
    stepNpc(actor, npc, 1, [1000, 1000], true, false, "home");
    expect(actor).toEqual(paused);
    stepNpc(actor, npc, 1 / 60, [1000, 1000], false, false, "home");
    expect(actor.pose).toBe("sit");
    for (let frame = 0; frame < 60 * 30; frame++) {
      stepNpc(actor, npc, 1 / 60, [1000, 1000], false, false, "home");
      expect(canWalk(actor.x, actor.z, "home")).toBe(true);
    }
    expect(
      Math.hypot(actor.x - npc.route[0][0], actor.z - npc.route[0][1]),
    ).toBeGreaterThan(2);
  });
  it("uses the active world's collision for conversations instead of phantom buildings", () => {
    const [x, z] = doors.find((door) => door.id === "kappa")!.footprint;
    const actor = { ...createNpcActors()[0], x, z };
    expect(canWalk(x, z, "home")).toBe(true);
    expect(canWalk(x, z, "stanford")).toBe(false);
    expect(canTalkToNpc(actor, x + 1, z, "home")).toBe(true);
    expect(canTalkToNpc(actor, x + 1, z, "stanford")).toBe(false);
  });
  it("does not offer a conversation through a collision corner", () => {
    const actor = { ...createNpcActors()[0], x: 1.9, z: 1.5 };
    // Both sides of the garden corner are walkable, but the diagonal cuts it.
    expect(canWalk(actor.x, actor.z)).toBe(true);
    expect(canWalk(1.5, 1.9)).toBe(true);
    expect(canTalkToNpc(actor, 1.5, 1.9)).toBe(false);
    expect(nearestNpc([actor], 1.5, 1.9)).toBeUndefined();
  });
});

describe("NPC interaction boundaries", () => {
  beforeEach(() => {
    useGame.setState({
      scene: "hub",
      world: "stanford",
      panel: "none",
      paused: false,
      build: false,
      near: "npc",
    });
    useNpcs.setState({ talking: null, pending: null, line: 0 });
    runtime.x = npcActors[0].x + 1;
    runtime.z = npcActors[0].z;
    runtime.path = [];
    runtime.target = null;
  });
  it("opens, advances, and dismisses without awarding money or leaving stale walking input", () => {
    const save = useGame.getState().save;
    runtime.target = [20, 10];
    expect(nearbyNpcId(runtime.x, runtime.z)).toBe("npc");
    expect(interactWithNpc()).toBe(true);
    expect(useNpcs.getState().talking).toBe(npcActors[0].id);
    expect(useGame.getState().panel).toBe("npc");
    expect(runtime.target).toBeNull();
    expect(interactWithNpc()).toBe(true);
    expect(useNpcs.getState().line).toBe(1);
    advanceConversation();
    expect(useGame.getState().panel).toBe("none");
    expect(useNpcs.getState().talking).toBeNull();
    expect(useGame.getState().save).toBe(save);
  });
  it("never talks through pause, build, unrelated panels, doors or the bulletin", () => {
    for (const blocked of [
      { paused: true },
      { build: true },
      { panel: "help" as const },
      { panel: "places" as const },
      { near: "read" },
      { near: doors[0].id },
    ]) {
      const baseline = {
        paused: false,
        build: false,
        panel: "none" as const,
        near: "npc",
      };
      useGame.setState({ ...baseline, ...blocked });
      expect(interactWithNpc()).toBe(false);
      expect(useNpcs.getState().talking).toBeNull();
    }
    useGame.setState({ panel: "help", near: "npc" });
    talkToNpc(npcActors[0].id);
    expect(useNpcs.getState().talking).toBeNull();
  });
  it("walks to a distant local and cancels conversation cleanly", () => {
    runtime.x = 0;
    runtime.z = 5;
    talkToNpc(npcActors[2].id);
    expect(useNpcs.getState().pending).toBe(npcActors[2].id);
    expect(useNpcs.getState().talking).toBeNull();
    expect(runtime.target).not.toBeNull();
    expect(useGame.getState().panel).toBe("none");
    closeConversation();
    expect(useNpcs.getState().pending).toBeNull();
  });
});
