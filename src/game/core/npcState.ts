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
import { runtime, useGame } from "./store";
import { doors } from "./world";
import { belongsToWorld, WORLD_IDS, type WorldId } from "./worlds";
import { topicsFor } from "./npcTopics";

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
  pending: string | null;
}>(() => ({ talking: null, line: 0, topic: null, pending: null }));

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
  useNpcs.setState({ talking: null, topic: null, pending: null });
  if (useGame.getState().panel === "npc") useGame.setState({ panel: "none" });
}
export function talkToNpc(id: string) {
  const game = useGame.getState();
  if (
    game.scene !== "hub" ||
    game.paused ||
    game.build ||
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
    useNpcs.setState({ pending: id });
    return;
  }
  runtime.target = null;
  runtime.path = [];
  runtime.moving = false;
  actor.pose = "stand";
  actor.posture = 0;
  actor.heading = Math.atan2(runtime.x - actor.x, runtime.z - actor.z);
  useNpcs.setState({ talking: id, line: 0, topic: null, pending: null });
  useGame.setState({ panel: "npc" });
}
export function chooseNpcTopic(id: string) {
  const { talking, line } = useNpcs.getState();
  const npc = talking ? entriesById.get(talking)?.npc : undefined;
  if (
    npc &&
    line === npc.lines.length - 1 &&
    topicsFor(npc.id).some((topic) => topic.id === id)
  )
    useNpcs.setState({ topic: id });
}

export function advanceConversation() {
  const state = useNpcs.getState(),
    npc = state.talking ? entriesById.get(state.talking)?.npc : undefined;
  if (npc && state.line < npc.lines.length - 1)
    useNpcs.setState({ line: state.line + 1 });
  else if (state.topic)
    useNpcs.setState({ topic: null });
  else if (npc && topicsFor(npc.id).length)
    return;
  else closeConversation();
}
/** Called by the existing E-key action, so doors and conversations never double-fire. */
export function interactWithNpc() {
  const game = useGame.getState();
  if (game.scene !== "hub" || game.paused || game.build) return false;
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
