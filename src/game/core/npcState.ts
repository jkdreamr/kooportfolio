import { create } from "zustand";
import {
  approachNpc,
  createNpcActors,
  nearestNpc,
  villagers,
  TALK_DISTANCE,
} from "./npcs";
import { runtime, useGame } from "./store";
import { doors } from "./world";

export const npcActors = createNpcActors();
export const useNpcs = create<{
  talking: string | null;
  line: number;
  pending: string | null;
}>(() => ({ talking: null, line: 0, pending: null }));

export function nearbyNpcId(x: number, z: number) {
  const npc = nearestNpc(npcActors, x, z);
  return npc ? "npc" : "";
}
export function npcName() {
  const actor = nearestNpc(npcActors, runtime.x, runtime.z);
  return villagers.find((npc) => npc.id === actor?.id)?.name ?? "Villager";
}
export function closeConversation() {
  useNpcs.setState({ talking: null, pending: null });
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
  const actor = npcActors.find((npc) => npc.id === id);
  if (!actor) return;
  if (Math.hypot(actor.x - runtime.x, actor.z - runtime.z) > TALK_DISTANCE) {
    const path = approachNpc(actor, [runtime.x, runtime.z]);
    if (!path.length) return;
    runtime.path = path;
    runtime.target = runtime.path.shift() ?? null;
    useNpcs.setState({ pending: id });
    return;
  }
  runtime.target = null;
  runtime.path = [];
  runtime.moving = false;
  useNpcs.setState({ talking: id, line: 0, pending: null });
  useGame.setState({ panel: "npc" });
}
export function advanceConversation() {
  const state = useNpcs.getState(),
    npc = villagers.find((npc) => npc.id === state.talking);
  if (npc && state.line < npc.lines.length - 1)
    useNpcs.setState({ line: state.line + 1 });
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
  const actor = nearestNpc(npcActors, runtime.x, runtime.z);
  if (!actor) return false;
  talkToNpc(actor.id);
  return true;
}
