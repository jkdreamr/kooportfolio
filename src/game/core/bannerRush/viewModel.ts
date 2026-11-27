/** Pure strings and colours for the view (§8.2): clock, rival colour, live-region sentences, card labels. */
import { CARDS, type CardId } from "./cards";
import type { Side } from "./types";

export function clockText(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const RIVAL_COLOURS = ["#c8892c", "#7a5aa6"] as const;
const rgb = (hex: string) => {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** The rival's colour: ochre, or heather when you wear something close to ochre. */
export function rivalColour(player: string) {
  const [r, g, b] = rgb(player);
  const [x, y, z] = rgb(RIVAL_COLOURS[0]);
  const d = Math.sqrt((r - x) * (r - x) + (g - y) * (g - y) + (b - z) * (b - z));
  return d >= 110 ? RIVAL_COLOURS[0] : RIVAL_COLOURS[1];
}

/** Tower index within a side: 0 left Lookout, 1 right Lookout, 2 Keep (own frame). */
export function towerName(viewer: Side, owner: Side, which: number) {
  if (which === 2) return owner === viewer ? "Your Keep" : "Their Keep";
  // Left/right as the viewer sees the field (the rival's own-left is the viewer's right).
  const left = owner === viewer ? which === 0 : which === 1;
  return `${owner === viewer ? "Your" : "Their"} ${left ? "left" : "right"} Lookout`;
}

/** Live-region sentence when a tower falls. */
export function fallMessage(viewer: Side, owner: Side, which: number, banners: number) {
  const name = towerName(viewer, owner, which);
  const tail = owner !== viewer ? ` You have ${banners} banner${banners === 1 ? "" : "s"}.` : ` They have ${banners} banner${banners === 1 ? "" : "s"}.`;
  return `${name} is down.${tail}`;
}

/** Callout when a tower falls (short, upbeat). */
export function fallCallout(viewer: Side, owner: Side, which: number) {
  const name = towerName(viewer, owner, which);
  return owner === viewer ? `${name} is down` : `${name} is down!`;
}

export function cardLabel(id: CardId, needGlow: number) {
  const c = CARDS[id];
  const kind = c.type === "spell" ? "spell" : c.type === "building" ? "building" : "troop";
  return `${c.name}, cost ${c.cost}, ${kind}${needGlow > 0 ? `, need ${needGlow} more Glow` : ""}`;
}

export function refusalText(reason: string, need: number) {
  switch (reason) {
    case "zone":
      return "Not on their side yet";
    case "blocked":
      return "Something is in the way";
    case "glow":
      return `Need ${need} more Glow`;
    case "cap":
      return "The field is full";
    default:
      return "";
  }
}

export const PHASE_NAMES = ["", "Double Glow", "Overtime", "Triple Glow", ""] as const;
