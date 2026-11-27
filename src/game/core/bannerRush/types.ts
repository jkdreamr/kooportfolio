import type { CardId, UnitKind } from "./cards";

export type Side = 0 | 1;
export type AiTier = "sprout" | "villager" | "captain" | "maxed";
export const AI_TIERS: readonly AiTier[] = ["sprout", "villager", "captain", "maxed"];

export type DeployInput = { side: Side; slot: number; x: number; y: number };
export type DeployReason = "ok" | "phase" | "slot" | "glow" | "zone" | "blocked" | "cap" | "busy";
export const REASONS: readonly DeployReason[] = ["ok", "phase", "slot", "glow", "zone", "blocked", "cap", "busy"];
export type DeployCheck = { ok: boolean; reason: DeployReason; x: number; y: number };

export type Modifier =
  | { kind: "doubleStart" }
  | { kind: "shortMatch" }
  | { kind: "hideNext" }
  | { kind: "heavyLookouts" }
  | { kind: "swiftRiver" }
  | { kind: "fixedHand"; side: Side; cards: CardId[] }
  | { kind: "glowStart"; side: Side; glow: number }
  | { kind: "glowRate"; side: Side; mult: number }
  | { kind: "towerHp"; hp: number[] }
  | { kind: "unbreakable"; side: Side };

export type MatchConfig = {
  seed: number;
  decks: [readonly CardId[], readonly CardId[]];
  ai: [AiTier | null, AiTier | null];
  modifiers?: Modifier[];
};

export type OutcomeReason = "keep" | "banners" | "sudden" | "tiebreak" | "draw";
export const OUTCOME_REASONS: readonly OutcomeReason[] = ["keep", "banners", "sudden", "tiebreak", "draw"];
export type Outcome = { winner: Side | null; reason: OutcomeReason; banners: [number, number]; endTick: number };

/** Event type codes (events.ts writes them into the ring). */
export const EV_DEPLOY = 1;
export const EV_SPAWN = 2;
export const EV_SWING = 3;
export const EV_SHOT = 4;
export const EV_HIT = 5;
export const EV_HEAL = 6;
export const EV_DEATH = 7;
export const EV_STUN = 8;
export const EV_KNOCK = 9;
export const EV_TOWER_DOWN = 10;
export const EV_KEEP_WAKE = 11;
export const EV_POCKET_OPEN = 12;
export const EV_PHASE = 13;
export const EV_GLOW_FULL = 14;
export const EV_SPELL = 15;
export const EV_REFUSED = 16;
export const EV_END = 17;
export const EV_IMPACT = 18;
export const EV_SPAWN_COOK = 19;

/** Hit flags. */
export const HF_PROJ = 1;
export const HF_SPELL = 2;
export const HF_SPLASH = 4;
export const HF_SWISH = 8;
export const HF_KILL = 16;
export const HF_BEAM = 32;
export const HF_MELEE = 64;
export const HF_CHARGE = 128;

/** AI memory: numbers and typed arrays only (it lives in the state and is cloned and hashed with it). */
export type AiMemory = {
  tier: number;
  enabled: number;
  thinkT: number;
  /** Scheduled action: due tick, card slot, position, plan kind, the value that justified it. */
  due: number;
  slot: number;
  x: number;
  y: number;
  plan: number;
  planValue: number;
  planLane: number;
  lastDeploy: number;
  /** Opponent's estimated Glow (in Glow units ×168). */
  enemyGlow: number;
  /** Opponent cards seen (card index → 1), and the order of its last 8 plays. */
  seen: Uint8Array;
  lastPlays: Int8Array;
  playCount: number;
  capTicks: number;
  /** Follow-up support for a push: lead entity slot and its generation. */
  leadSlot: number;
  leadGen: number;
  followDone: number;
  defendedLane: number;
  defendEnd: number;
  /** Tick of the opponent's last ≥ 5-cost play at its back (−1 none). */
  backSpend: number;
  emote: number;
  decisions: number;
  mistakes: number;
};

export type MatchState = {
  v: number;
  seed: number;
  tick: number;
  phase: number;
  winner: number;
  reason: number;
  endTick: number;
  /** Streams: 0 deck, 1 AI side 0, 2 AI side 1. */
  rng: Int32Array;
  glow: Int32Array;
  banners: Int32Array;
  /** Per side 8 card indices: 0–3 hand, 4 next, 5–7 queue. */
  cards: Int8Array;
  deckIds: Int8Array;
  /** Clock and modifiers (read once at createMatch). */
  doubleAt: number;
  regEnd: number;
  tripleAt: number;
  otEnd: number;
  doubleStart: number;
  hideNext: number;
  speedMul: number;
  glowMul: Float64Array;
  unbreakable: Uint8Array;
  /** Entities (struct of arrays). */
  alive: Uint8Array;
  gen: Uint16Array;
  kind: Uint8Array;
  side: Uint8Array;
  x: Float64Array;
  y: Float64Array;
  fx: Float64Array;
  fy: Float64Array;
  hp: Int32Array;
  maxHp: Int32Array;
  deployT: Int16Array;
  cd: Int16Array;
  swingT: Int16Array;
  target: Int16Array;
  targetGen: Uint16Array;
  stunT: Int16Array;
  kbT: Int16Array;
  kbX: Float64Array;
  kbY: Float64Array;
  walkT: Int16Array;
  charged: Uint8Array;
  shots: Uint8Array;
  rampT: Int32Array;
  lifeAcc: Int32Array;
  spawnT: Int32Array;
  auraT: Int16Array;
  stuckX: Float64Array;
  stuckY: Float64Array;
  stuckT: Int16Array;
  sidestepT: Int16Array;
  planted: Uint8Array;
  moving: Uint8Array;
  asleep: Uint8Array;
  wakeT: Int16Array;
  member: Uint8Array;
  /** Projectiles. */
  pAlive: Uint8Array;
  pSide: Uint8Array;
  pSrc: Int16Array;
  pSrcKind: Uint8Array;
  pTarget: Int16Array;
  pTargetGen: Uint16Array;
  pX: Float64Array;
  pY: Float64Array;
  pTX: Float64Array;
  pTY: Float64Array;
  pSpeed: Float64Array;
  pDmg: Int32Array;
  pSplash: Float64Array;
  pTargets: Uint8Array;
  pFlags: Uint8Array;
  pDist: Float64Array;
  pTravel: Float64Array;
  pGen: Uint16Array;
  /** Spell effects: 0 Go Stone, 1 Smash, 2 Comet, 3 Balloon pop. */
  eAlive: Uint8Array;
  eKind: Uint8Array;
  eSide: Uint8Array;
  eX: Float64Array;
  eY: Float64Array;
  eT: Int16Array;
  eDir: Float64Array;
  eProg: Float64Array;
  eHit: Uint16Array;
  /** Damage queue (applied at the end of the tick). */
  qCount: number;
  qTarget: Int16Array;
  qAmount: Int32Array;
  qFlags: Uint8Array;
  qSrc: Int16Array;
  qStun: Int16Array;
  /** Event ring. */
  eventCount: number;
  evType: Uint8Array;
  evA: Int32Array;
  evB: Int32Array;
  evC: Int32Array;
  evD: Int32Array;
  evX: Float32Array;
  evY: Float32Array;
  /** One deploy per side per tick; AI outputs. */
  aiOut: Float64Array;
  ai: [AiMemory, AiMemory];
  /** Counters for tests and tuning. */
  stats: Int32Array;
};

/** stats indices */
export const ST_LEAK0 = 0;
export const ST_LEAK1 = 1;
export const ST_PLAYS0 = 2;
export const ST_PLAYS1 = 3;
export const ST_WATCHDOG = 4;
export const ST_UNIT_TICKS = 5;
export const ST_MAX_EVENTS = 6;
export const ST_REFUSED = 7;

export type OwnView = { side: Side; hand: CardId[]; next: CardId | null; glow: number; glowExact: number };
export type PublicUnit = { slot: number; kind: UnitKind; side: Side; x: number; y: number; hp: number; maxHp: number; inert: boolean };
export type PublicView = {
  tick: number;
  phase: number;
  banners: [number, number];
  towers: number[];
  units: PublicUnit[];
};
