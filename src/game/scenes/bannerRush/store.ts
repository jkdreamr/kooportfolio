/**
 * useRushHud (§8.1): only what the DOM shows. The runtime writes it when a
 * value changes (at most a few times a second), never per frame.
 */
import { create } from "zustand";
import type { CardId } from "../../core/bannerRush/cards";

export type Screen = "lobby" | "deck" | "trail" | "daily" | "stats" | "how" | "versus" | "match" | "result" | "tutorial";

export type ResultInfo = {
  winner: 0 | 1 | null;
  reason: string;
  banners: [number, number];
  seconds: number;
  ribbonsBefore: number;
  ribbonsAfter: number;
  unlocked: CardId | null;
  tip: string;
  tutorial: boolean;
  daily: { score: number; best: number; attempts: number } | null;
  stamp: boolean;
  newBest: boolean;
};

export type HudState = {
  screen: Screen;
  hand: (CardId | null)[];
  next: CardId | null;
  glow: number;
  banners: [number, number];
  seconds: number;
  phase: number;
  callout: string;
  calloutTone: "info" | "good" | "bad" | "gold";
  calloutKey: number;
  selected: number;
  towers: number[];
  towerMax: number[];
  result: ResultInfo | null;
  paused: boolean;
  countdown: number;
  banner: { text: string; sub: string; key: number; tone: "gold" | "coral" | "plain" } | null;
  emote: { side: 0 | 1; text: string; key: number } | null;
  live: string;
  liveKey: number;
  /** Tutorial prompt and highlight. */
  prompt: string;
  hint: string;
  vs: { name: string; tier: string; ground: string } | null;
  rush: number;
  dealt: number;
};

export const useRushHud = create<HudState>(() => ({
  screen: "lobby",
  hand: [null, null, null, null],
  next: null,
  glow: 5,
  banners: [0, 0],
  seconds: 180,
  phase: 0,
  callout: "",
  calloutTone: "info",
  calloutKey: 0,
  selected: -1,
  towers: [2400, 2400, 4000, 2400, 2400, 4000],
  towerMax: [2400, 2400, 4000, 2400, 2400, 4000],
  result: null,
  paused: false,
  countdown: 0,
  banner: null,
  emote: null,
  live: "",
  liveKey: 0,
  prompt: "",
  hint: "",
  vs: null,
  rush: 0,
  dealt: 4,
}));

let calloutTimer = 0;
let urgentUntil = 0;
/** Show a callout. A plain "info" hint never replaces a refusal or score line still on screen. */
export function callout(text: string, tone: HudState["calloutTone"] = "info", ms = 1400): boolean {
  const now = performance.now();
  if (tone === "info" && now < urgentUntil) return false;
  urgentUntil = tone === "info" ? 0 : now + ms;
  window.clearTimeout(calloutTimer);
  useRushHud.setState((s) => ({ callout: text, calloutTone: tone, calloutKey: s.calloutKey + 1 }));
  calloutTimer = window.setTimeout(() => useRushHud.setState({ callout: "" }), ms);
  return true;
}
