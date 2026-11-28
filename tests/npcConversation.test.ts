import { describe, expect, it } from "vitest";
import { villagers } from "../src/game/core/npcs";
import { AUTHORED_IDS, scriptFor, type Script } from "../src/game/core/npcConversation";
import { destinationsInWorld } from "../src/game/core/world";
import { belongsToWorld, WORLD_IDS } from "../src/game/core/worlds";
import { spotOf } from "../src/game/core/carry";

const worldOf = (place: string) => WORLD_IDS.find((w) => belongsToWorld(place, w))!;
const placeOf = (npc: (typeof villagers)[number]) => {
  const p = destinationsInWorld(worldOf(npc.place)).find(({ id }) => id === npc.place);
  return p && { id: p.id, name: p.name };
};
/** Spoken lines along the shortest path (first option of each choice). */
function pathLines(script: Script) {
  let lines = 0;
  for (const step of script) {
    if ("say" in step) lines++;
    else {
      const replies = step.ask.map((c) => c.reply.length);
      lines += Math.min(...replies);
    }
  }
  return lines;
}

describe("npc conversation trees", () => {
  it("give every villager 1–2 choice points of 2–3 options and a few lines", () => {
    for (const npc of villagers)
      for (const again of [false, true]) {
        const script = scriptFor(npc, placeOf(npc), again);
        const asks = script.filter((step) => "ask" in step);
        expect(asks.length, npc.id).toBeGreaterThanOrEqual(1);
        expect(asks.length, npc.id).toBeLessThanOrEqual(2);
        for (const step of asks) {
          if (!("ask" in step)) continue;
          expect(step.ask.length, npc.id).toBeGreaterThanOrEqual(2);
          expect(step.ask.length, npc.id).toBeLessThanOrEqual(3);
          expect(new Set(step.ask.map((c) => c.id)).size, npc.id).toBe(step.ask.length);
        }
        expect("say" in script.at(-1)!, npc.id).toBe(true);
        if (!again) expect(pathLines(script), npc.id).toBeLessThanOrEqual(7);
      }
  });
  it("keep repeat visits shorter", () => {
    for (const npc of villagers) {
      const first = scriptFor(npc, placeOf(npc));
      const again = scriptFor(npc, placeOf(npc), true);
      expect(again.length, npc.id).toBeLessThanOrEqual(first.length);
      expect("say" in again[0] && "ask" in again[1], npc.id).toBe(true);
    }
  });
  it("only point deeds at places and quest spots that exist in the villager's world", () => {
    for (const id of AUTHORED_IDS) {
      const npc = villagers.find((v) => v.id === id)!;
      expect(npc, id).toBeTruthy();
      const world = worldOf(npc.place);
      for (const step of scriptFor(npc, placeOf(npc)))
        if ("ask" in step)
          for (const c of step.ask) {
            if (!c.deed) continue;
            if ("walk" in c.deed) {
              const walk = c.deed.walk;
              expect(destinationsInWorld(world).some((p) => p.id === walk), `${id}/${walk}`).toBe(true);
            } else expect(spotOf(c.deed.spot), id).toBeTruthy();
          }
    }
  });
  it("never say Josh walked on as a freshman", () => {
    for (const npc of villagers)
      for (const step of scriptFor(npc, placeOf(npc)))
        for (const say of "say" in step ? [step.say] : step.ask.flatMap((c) => c.reply))
          if (/walk(ed)? on/i.test(say.text)) expect(say.text, npc.id).not.toMatch(/freshman/i);
  });
});
