/**
 * Banner Rush field, clock and pool constants. Rules are in tiles and ticks
 * (20 per second); the view scales tiles to metres.
 */
export const RULES_VERSION = 1;

export const TICK_HZ = 20;
export const W = 16;
export const L = 28;
export const RIVER_Y0 = 13;
export const RIVER_Y1 = 15;
/** Bridge centres (x); a bridge is 2 tiles wide. */
export const BRIDGE_X0 = 3;
export const BRIDGE_X1 = 13;
export const BRIDGE_HALF = 1;
/** Ground troops may stand in the river band only this close to a bridge centre. */
export const BRIDGE_SPAN = 0.7;
export const LANE_SPLIT_X = 8;
export const POCKET_DEPTH = 5;

/** Tower slots: side * 3 + (0 own-left Lookout, 1 own-right Lookout, 2 Keep). */
export const LOOKOUT_L = 0;
export const LOOKOUT_R = 1;
export const KEEP = 2;
/** Own-frame (side 0) tower centres. */
export const TOWER_X = [3, 13, 8] as const;
export const TOWER_Y = [20.5, 20.5, 25] as const;
/** Half footprints (Lookout 3 × 3, Keep 4 × 4). */
export const TOWER_HALF = [1.5, 1.5, 2] as const;

export const MAX_ENTS = 72;
export const MAX_PROJ = 64;
export const MAX_EFFECTS = 8;
export const EVENT_CAP = 128;
export const DAMAGE_CAP = 512;
export const TROOP_CAP = 24;
export const BUILDING_CAP = 4;

export const GLOW_UNIT = 168;
export const GLOW_MAX = 10;
export const GLOW_CAP = GLOW_MAX * GLOW_UNIT;
export const GLOW_START = 5 * GLOW_UNIT;
export const GLOW_PER_TICK = 3;

/** Clock (ticks). */
export const DOUBLE_AT = 2400;
export const REGULATION_END = 3600;
export const TRIPLE_AT = 4200;
export const OVERTIME_END = 4800;

export const DEPLOY_TICKS = 20;
export const MEMBER_STAGGER = 2;

/** Phase codes. */
export const PH_REGULATION = 0;
export const PH_DOUBLE = 1;
export const PH_OVERTIME = 2;
export const PH_TRIPLE = 3;
export const PH_OVER = 4;
