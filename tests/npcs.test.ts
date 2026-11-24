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
import { islandLocals } from "../src/game/core/npcPopulation";
import { canWalk, doors, findPath, moveWorld } from "../src/game/core/world";
import {
  activeNpcActors,
  advanceConversation,
  chooseNpcTopic,
  closeConversation,
  interactWithNpc,
  npcActors,
  nearbyNpcId,
  stepNpcApproach,
  talkToNpc,
  useNpcs,
} from "../src/game/core/npcState";
import { topicsFor } from "../src/game/core/npcTopics";
import { runtime, useGame, walkTo } from "../src/game/core/store";
import { belongsToWorld, WORLD_IDS } from "../src/game/core/worlds";

const worldFor = (place: string) =>
  WORLD_IDS.find((world) => belongsToWorld(place, world))!;

describe("wandering village crowd", () => {
  it("has a distinct crowd and mostly illustrated conversations on each island", () => {
    const visited = new Set<string>();
    const additions = new Set(islandLocals.map(({ id }) => id));
    for (const world of WORLD_IDS) {
      const actors = activeNpcActors(world);
      expect(
        actors.filter(({ id }) => additions.has(id)).length,
        world,
      ).toBeGreaterThanOrEqual(6);
      expect(
        actors.filter(({ id }) => {
          const topics = topicsFor(id);
          return topics.length >= 2 && topics.some(({ picture }) => picture);
        }).length,
        world,
      ).toBeGreaterThan(actors.length / 2);
      for (const { id } of actors) {
        expect(visited.has(id), id).toBe(false);
        visited.add(id);
      }
    }
    expect(visited.size).toBe(villagers.length);
  });
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
  it("lets the player pick an illustrated reply, go back, and ask something else", () => {
    const local = npcActors.find((actor) => actor.id === "mapmaker")!;
    runtime.x = local.x - 1;
    runtime.z = local.z;
    talkToNpc(local.id);
    expect(useNpcs.getState().talking).toBe(local.id);
    expect(interactWithNpc()).toBe(true);
    expect(useNpcs.getState().topic).toBeNull();
    expect(useGame.getState().panel).toBe("npc");
    chooseNpcTopic("missing");
    expect(useNpcs.getState().topic).toBeNull();
    chooseNpcTopic("campus");
    expect(
      topicsFor(local.id).find(({ id }) => id === useNpcs.getState().topic)?.picture,
    ).toBe("campus");
    expect(interactWithNpc()).toBe(true);
    expect(useNpcs.getState().topic).toBeNull();
    chooseNpcTopic("water");
    expect(useNpcs.getState().topic).toBe("water");
    closeConversation();
    talkToNpc(local.id);
    expect(useNpcs.getState().topic).toBeNull();
    expect(useNpcs.getState().line).toBe(0);
  });
  it("does not approach a local from another island", () => {
    talkToNpc("postie");
    expect(useNpcs.getState().talking).toBeNull();
    expect(useNpcs.getState().pending).toBeNull();
    expect(runtime.target).toBeNull();
    expect(useGame.getState().panel).toBe("none");
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

  it("opens Bridge lookout after an uninterrupted detour from the Korea promenade", () => {
    useGame.setState({ world: "korea" });
    const id = "bridge-lookout";
    runtime.x = 25;
    runtime.z = 19;
    talkToNpc(id);
    expect(useNpcs.getState().pending).toBe(id);

    const delta = 0.04;
    let frames = 0;
    for (; frames < 1000 && runtime.target; frames++) {
      stepNpcApproach(delta, false);
      if (frames === 650) {
        expect(useNpcs.getState().pending).toBe(id);
        expect(useGame.getState().panel).toBe("none");
      }
      if (!runtime.target) break;
      const [x, z] = runtime.target;
      const distance = Math.hypot(x - runtime.x, z - runtime.z);
      if (distance < 0.0001) {
        [runtime.x, runtime.z] = runtime.target;
        runtime.target = runtime.path.shift() ?? null;
      } else {
        const step = Math.min(4.6 * delta, distance) / distance;
        [runtime.x, runtime.z] = moveWorld(
          runtime.x,
          runtime.z,
          (x - runtime.x) * step,
          (z - runtime.z) * step,
          "korea",
        );
      }
    }
    expect(frames * delta).toBeGreaterThan(26);
    expect(useNpcs.getState()).toMatchObject({ pending: null, talking: id });
    expect(useGame.getState().panel).toBe("npc");
  });

  it("cancels a pending conversation when a new walk replaces its route", () => {
    runtime.x = 0;
    runtime.z = 5;
    const id = npcActors[2].id;
    talkToNpc(id);
    expect(useNpcs.getState().pending).toBe(id);
    walkTo(0, 8);
    expect(runtime.target).not.toBeNull();
    stepNpcApproach(0.04, false);
    expect(useNpcs.getState()).toMatchObject({ pending: null, talking: null });
    expect(runtime.target).not.toBeNull();
  });
});
