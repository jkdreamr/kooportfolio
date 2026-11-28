import { create } from "zustand";
import {
  approachNpc,
  canTalkToNpc,
  createNpcActors,
  nearestNpc,
  villagers,
  type NpcActor,
  type Villager,
} from "./npcs";
import { runtime, useGame, walkTo } from "./store";
import { destinationsInWorld, doors } from "./world";
import { spotOf } from "./carry";
import type { Choice, Deed, PlaceRef, Script } from "./npcConversation";
import { belongsToWorld, WORLD_IDS, type WorldId } from "./worlds";

export const npcActors = createNpcActors();
export type NpcEntry = { npc: Villager; actor: NpcActor };
const entries: NpcEntry[] = villagers.map((npc, i) => ({
  npc,
  actor: npcActors[i],
}));
const entriesById = new Map(entries.map((entry) => [entry.npc.id, entry]));
const crowds = new Map(
  WORLD_IDS.map((world) => {
    const entriesHere = entries.filter(({ npc }) =>
      belongsToWorld(npc.place, world),
    );
    return [
      world,
      { entries: entriesHere, actors: entriesHere.map(({ actor }) => actor) },
    ];
  }),
);
export const activeNpcCrowd = (world: WorldId) => crowds.get(world)!.entries;
export const activeNpcActors = (world: WorldId) => crowds.get(world)!.actors;
export const useNpcs = create<{
  talking: string | null;
  line: number;
  topic: string | null;
  /** Line within the chosen reply. */
  sub: number;
  script: Script | null;
  pending: string | null;
}>(() => ({ talking: null, line: 0, topic: null, sub: 0, script: null, pending: null }));
let approach: {
  path: typeof runtime.path;
  target: typeof runtime.target;
  stalledFor: number;
} | null = null;

export function nearbyNpcId(x: number, z: number) {
  const { world } = useGame.getState();
  const npc = nearestNpc(activeNpcActors(world), x, z, world);
  return npc ? "npc" : "";
}
export function npcName() {
  const { world } = useGame.getState();
  const actor = nearestNpc(activeNpcActors(world), runtime.x, runtime.z, world);
  return (actor && entriesById.get(actor.id)?.npc.name) ?? "Villager";
}
export function closeConversation() {
  approach = null;
  talkFocus.active = false;
  useNpcs.setState({ talking: null, topic: null, sub: 0, script: null, pending: null });
  if (useGame.getState().panel === "npc") useGame.setState({ panel: "none" });
}
export function talkToNpc(id: string) {
  const game = useGame.getState();
  if (
    game.scene !== "hub" ||
    game.paused ||
    game.panel !== "none"
  )
    return;
  const entry = entriesById.get(id);
  if (!entry || !belongsToWorld(entry.npc.place, game.world)) return;
  const { actor } = entry;
  if (!canTalkToNpc(actor, runtime.x, runtime.z, game.world)) {
    const path = approachNpc(actor, [runtime.x, runtime.z], game.world);
    if (!path.length) return;
    runtime.path = path;
    runtime.target = runtime.path.shift() ?? null;
    approach = { path, target: runtime.target, stalledFor: 0 };
    useNpcs.setState({ pending: id });
    return;
  }
  approach = null;
  runtime.target = null;
  runtime.path = [];
  runtime.moving = false;
  actor.pose = "stand";
  actor.posture = 0;
  actor.heading = Math.atan2(runtime.x - actor.x, runtime.z - actor.z);
  talkFocus.active = true;
  talkFocus.x = (runtime.x + actor.x) / 2;
  talkFocus.z = (runtime.z + actor.z) / 2;
  useNpcs.setState({
    talking: id,
    line: 0,
    topic: null,
    sub: 0,
    script: buildScript(entry.npc, game.world),
    pending: null,
  });
  useGame.setState({ panel: "npc" });
}

export function stepNpcApproach(delta: number, interrupted: boolean) {
  const { pending } = useNpcs.getState();
  if (!pending) return;
  const { world } = useGame.getState();
  const actor = activeNpcActors(world).find((npc) => npc.id === pending);
  if (!interrupted && actor && approach?.path === runtime.path) {
    if (canTalkToNpc(actor, runtime.x, runtime.z, world)) {
      talkToNpc(actor.id);
      return;
    }
    if (runtime.target) {
      if (approach.target !== runtime.target) {
        approach.target = runtime.target;
        approach.stalledFor = 0;
      } else approach.stalledFor += Math.min(delta, 0.04);
      if (approach.stalledFor <= 25) return;
    }
  }
  approach = null;
  useNpcs.setState({ pending: null });
}
const visited = new Set<string>();
/** The UI's typewriter: returns true when a press only finished the reveal. */
let advanceGuard: (() => boolean) | null = null;
export function setAdvanceGuard(guard: (() => boolean) | null) {
  advanceGuard = guard;
}
/** Where the camera eases to while talking (Hub reads it each frame). */
export const talkFocus = { active: false, x: 0, z: 0 };

/** The script writer (core/npcConversation.ts) is loaded on demand: it
 * holds every villager's lines, which the engine chunk has no room for. It
 * registers itself on load; the first talk before then fetches it. */
type ScriptWriter = (npc: Villager, place: PlaceRef, again: boolean) => Script;
let writer: ScriptWriter | null = null;
export function registerScriptWriter(write: ScriptWriter) {
  writer = write;
}
function buildScript(npc: Villager, world: WorldId): Script | null {
  const place = destinationsInWorld(world).find(({ id }) => id === npc.place);
  const ref = place && { id: place.id, name: place.name };
  if (!writer) {
    void import("./npcConversation").then(() => {
      const state = useNpcs.getState();
      if (state.talking === npc.id && !state.script) useNpcs.setState({ script: buildScript(npc, world) });
    });
    return null;
  }
  const again = visited.has(npc.id);
  visited.add(npc.id);
  return writer(npc, ref, again);
}
/** The step on screen: the choice being answered, or the script's line. */
export function currentChoice(): Choice | undefined {
  const { script, line, topic } = useNpcs.getState();
  const step = script?.[line];
  return step && "ask" in step ? step.ask.find((c) => c.id === topic) : undefined;
}
function runDeed(deed: Deed) {
  const { world } = useGame.getState();
  closeConversation();
  if ("walk" in deed) {
    const place = destinationsInWorld(world).find(({ id }) => id === deed.walk);
    if (place) walkTo(place.x, place.z);
  } else {
    const [x, z] = spotOf(deed.spot);
    walkTo(x, z);
  }
}
function finishChoice(choice: Choice) {
  const { script, line } = useNpcs.getState();
  if (!script) return;
  if (choice.deed) return runDeed(choice.deed);
  useNpcs.setState({
    topic: null,
    sub: 0,
    line: choice.end ? script.length - 1 : Math.min(line + 1, script.length - 1),
  });
}
export function chooseNpcTopic(id: string) {
  const { script, line, topic } = useNpcs.getState();
  const step = script?.[line];
  if (!step || !("ask" in step) || topic) return;
  const choice = step.ask.find((c) => c.id === id);
  if (!choice) return;
  if (!choice.reply.length) finishChoice(choice);
  else useNpcs.setState({ topic: id, sub: 0 });
}

export function advanceConversation() {
  if (advanceGuard?.()) return;
  const { script, line, sub } = useNpcs.getState();
  if (!script) return; // still loading the lines
  const choice = currentChoice();
  if (choice) {
    if (sub < choice.reply.length - 1) useNpcs.setState({ sub: sub + 1 });
    else finishChoice(choice);
    return;
  }
  const step = script[line];
  if (step && "ask" in step) return;
  if (line < script.length - 1) useNpcs.setState({ line: line + 1 });
  else closeConversation();
}
/** Called by the existing E-key action, so doors and conversations never double-fire. */
export function interactWithNpc() {
  const game = useGame.getState();
  if (game.scene !== "hub" || game.paused) return false;
  if (game.panel === "npc") {
    advanceConversation();
    return true;
  }
  if (
    game.panel !== "none" ||
    game.near !== "npc" ||
    doors.some((door) => door.id === game.near)
  )
    return false;
  const actor = nearestNpc(
    activeNpcActors(game.world),
    runtime.x,
    runtime.z,
    game.world,
  );
  if (!actor) return false;
  talkToNpc(actor.id);
  return true;
}
