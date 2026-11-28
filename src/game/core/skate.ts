/**
 * Skate park rules (PLAN_GAMES §2.6, "Line Run"). Pure and allocation-free in
 * the step: the scene owns one state object and one input object and mutates
 * them.
 *
 * Scoring in one paragraph: a trick pays only when it is popped at speed
 * (≥ POP_MIN_SPEED), finished in the air and landed rolling. Its value is
 * `base × clamp(speed / 7, 0.45, 1)`, ×1.5 inside a hip air, and the same
 * trick pays the same every time (no repetition penalty). After a landing the
 * board needs POP_RECOVER s before the next pop, and a combo stays open only
 * through a manual, a grind or a hip air: landing on the flat with nothing to
 * link banks it after LAND_WINDOW s. Multiplier = landed scoring elements
 * (tricks, grinds, manuals, hip airs, transfers), capped at ×6. Standing
 * still therefore scores nothing, whatever the trick.
 */

// The rendered terrain and simulation share these dimensions and height field.
export const SKATE = {
  worldScale: 2,
  halfWidth: 10.5,
  halfDepth: 12.5,
  bankX: 7.5,
  bankZ: 9.5,
  gravity: 18,
  duration: 60,
} as const;
/** World-space gate target for the host's Exit button; z > 23 shows the exit prompt. */
export const SKATE_EXIT: [number, number] = [0, 24];

/** Rails 0 and 1 are the two rails ("Rail to rail"); 2 is the low ledge. */
export const SKATE_RAILS = [
  { x: -3.6, from: -7, to: 2, height: 0.7 },
  { x: 5.5, from: 2, to: 7, height: 0.55 },
  { x: -6.4, from: -5, to: 4, height: 0.35 },
] as const;

/* ------------------------------------------------------------- tuning */
/** Minimum speed (of 10) at the pop for a trick to score. */
export const POP_MIN_SPEED = 3;
/** Speed at which a trick pays full value. */
export const FULL_SPEED = 7;
/** Floor of the speed factor (a trick at exactly POP_MIN_SPEED pays ≈ 43–45%). */
export const SPEED_FLOOR = 0.45;
/** "Set your feet": time after a landing before the next pop. */
export const POP_RECOVER = 0.45;
/** Landing on the flat with nothing linking banks the combo after this. */
export const LAND_WINDOW = 0.35;
/** Below this speed a landing is not "rolling": the air's tricks are lost. */
export const ROLLING_SPEED = 1;
/** Hitting a wall faster than this is a bail; slower is a stop. */
export const WALL_BAIL_SPEED = 4;
export const MAX_MULTIPLIER = 6;
export const HIP_AIR_SPEED = 4;
export const HIP_FACTOR = 1.5;
export const MANUAL_MIN_SPEED = 3;
export const MANUAL_MAX = 4;
export const LETTER_BONUS = 1000;
export const RAIL_TO_RAIL_BONUS = 500;

export type SkateTrick = "kickflip" | "shove-it";
export const TRICKS: Readonly<Record<SkateTrick, { label: string; base: number; duration: number }>> = {
  kickflip: { label: "Kickflip", base: 120, duration: 0.42 },
  "shove-it": { label: "Shove-it", base: 90, duration: 0.36 },
};
export const GRIND_BASE = 200;
export const GRIND_PER_S = 65;
export const MANUAL_PER_S = 60;
export const HIP_TRANSFER = 400;
/** Hip air: 150 + 100 per 0.2 s of air over 0.4 s. */
export const hipAirValue = (air: number) => 150 + 100 * Math.max(0, Math.floor((air - 0.4) / 0.2 + 1e-9));
/** A trick's value at pop speed `speed`, in or out of a hip air. */
export const trickValue = (trick: SkateTrick, speed: number, hip = false) =>
  Math.round(TRICKS[trick].base * clamp(speed / FULL_SPEED, SPEED_FLOOR, 1) * (hip ? HIP_FACTOR : 1));

/** The hip's footprint (centre and half extents), shared with the height field. */
export const HIP = { x: 3, z: -3, hx: 2.2, hz: 2.8, height: 1.25 } as const;

/** J-O-S-H letters, park units: rail end, hip crest, back bank lip, centre. */
export const SKATE_LETTERS = [
  { letter: "J", x: -3.6, z: -7.4, y: 1.6 },
  { letter: "O", x: 3, z: -3, y: 2.6 },
  { letter: "S", x: 0, z: -10.4, y: 2.2 },
  { letter: "H", x: 0, z: 1.5, y: 1.4 },
] as const;
const LETTER_RADIUS = 1;

/* ---------------------------------------------------------------- goals */
export type SkateGoalId =
  | "both-rails"
  | "combo-1500"
  | "kickflip-hip"
  | "manual-3"
  | "josh"
  | "no-bails"
  | "kickflips-5"
  | "transfer"
  | "score-4000"
  | "multiplier-4"
  | "grind-2"
  | "big-air";
export const SKATE_GOALS: Readonly<Record<SkateGoalId, string>> = {
  "both-rails": "Grind both rails",
  "combo-1500": "Land a 1,500 combo",
  "kickflip-hip": "Kickflip the hip",
  "manual-3": "Manual for 3 s",
  josh: "Collect J-O-S-H",
  "no-bails": "No bails",
  "kickflips-5": "Land 5 kickflips",
  transfer: "Hip transfer",
  "score-4000": "Score 4,000",
  "multiplier-4": "Reach a ×4 combo",
  "grind-2": "Grind for 2 s",
  "big-air": "Hip air of 0.8 s",
};
export const SKATE_GOAL_IDS = Object.keys(SKATE_GOALS) as SkateGoalId[];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Three distinct goals from the pool, deterministic in `seed`. */
export function skateGoals(seed: number): SkateGoalId[] {
  const rnd = mulberry32(seed * 2654435761 + 17),
    pool = [...SKATE_GOAL_IDS];
  const out: SkateGoalId[] = [];
  while (out.length < 3) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}

/* ---------------------------------------------------------------- state */
export type SkateInput = {
  push: number;
  steer: number;
  /** S: a manual while rolling at speed, otherwise the brake. */
  brake: boolean;
  jump: boolean;
  trick: SkateTrick | null;
  grind: boolean;
};
export const idleSkateInput = (): SkateInput => ({
  push: 0,
  steer: 0,
  brake: false,
  jump: false,
  trick: null,
  grind: false,
});
export type SkateStats = {
  bails: number;
  kickflips: number;
  hipKickflips: number;
  transfers: number;
  longestManual: number;
  longestGrind: number;
  longestHipAir: number;
  maxMultiplier: number;
  railToRail: number;
};
export type SkateState = {
  mode: "free" | "run" | "daily";
  phase: "riding" | "done";
  x: number;
  z: number;
  y: number;
  vy: number;
  heading: number;
  speed: number;
  slope: number;
  grounded: boolean;
  rail: number;
  railLock: number;
  railTime: number;
  time: number;
  score: number;
  /** Unbanked combo points and its landed element count. */
  combo: number;
  count: number;
  bestCombo: number;
  /** Rails grind in this combo (bit per rail) and whether Rail to rail paid. */
  comboRails: number;
  railBonus: boolean;
  /** Seconds left before a flat landing banks (0 = not counting). */
  landWindow: number;
  /** Seconds left before the next pop is allowed. */
  recover: number;
  lastTrick: string;
  trick: SkateTrick | null;
  trickTime: number;
  trickDuration: number;
  /** This air: pop speed, whether a trick may score, hip air, takeoff, time. */
  popSpeed: number;
  popValid: boolean;
  hipAir: boolean;
  takeoffX: number;
  takeoffZ: number;
  airTime: number;
  /** Tricks finished this air, waiting for the landing. */
  pending: number;
  pendingCount: number;
  pendingKickflips: number;
  manual: boolean;
  manualTime: number;
  /** One manual per landing: set when one starts, cleared by the next landing. */
  manualUsed: boolean;
  /** Manual balance, −1…1; past either end is a bail. */
  needle: number;
  bailTime: number;
  /** J-O-S-H letters collected this run (bit per letter). */
  letters: number;
  goals: SkateGoalId[];
  stats: SkateStats;
  message: string;
  messageTime: number;
};

export function skateHeight(x: number, z: number) {
  const frontOpening = z > 0 ? Math.min(1, Math.max(0, (Math.abs(x) - 2) / 2)) : 1;
  const bank =
    Math.max(
      Math.max(0, Math.abs(x) - SKATE.bankX) ** 2,
      Math.max(0, Math.abs(z) - SKATE.bankZ) ** 2 * frontOpening,
    ) * 0.25;
  const hip = HIP.height * Math.max(0, 1 - Math.max(Math.abs(x - HIP.x) / HIP.hx, Math.abs(z - HIP.z) / HIP.hz));
  return 0.18 + Math.max(bank, hip);
}
const onHip = (x: number, z: number, margin = 0.3) =>
  Math.abs(x - HIP.x) < HIP.hx + margin && Math.abs(z - HIP.z) < HIP.hz + margin;

export function newSkateGame(mode: SkateState["mode"] = "free", seed = 1): SkateState {
  return {
    mode,
    phase: "riding",
    x: 0,
    z: 8,
    y: skateHeight(0, 8),
    vy: 0,
    heading: 0,
    speed: 0,
    slope: 0,
    grounded: true,
    rail: -1,
    railLock: 0,
    railTime: 0,
    time: 0,
    score: 0,
    combo: 0,
    count: 0,
    bestCombo: 0,
    comboRails: 0,
    railBonus: false,
    landWindow: 0,
    recover: 0,
    lastTrick: "",
    trick: null,
    trickTime: 0,
    trickDuration: 0,
    popSpeed: 0,
    popValid: false,
    hipAir: false,
    takeoffX: 0,
    takeoffZ: 0,
    airTime: 0,
    pending: 0,
    pendingCount: 0,
    pendingKickflips: 0,
    manual: false,
    manualTime: 0,
    manualUsed: false,
    needle: 0,
    bailTime: 0,
    letters: 0,
    goals: mode === "free" ? [] : skateGoals(seed),
    stats: {
      bails: 0,
      kickflips: 0,
      hipKickflips: 0,
      transfers: 0,
      longestManual: 0,
      longestGrind: 0,
      longestHipAir: 0,
      maxMultiplier: 0,
      railToRail: 0,
    },
    message: "Push to roll",
    messageTime: 2.5,
  };
}
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
const multiplier = (g: SkateState) => Math.min(MAX_MULTIPLIER, Math.max(1, g.count));
export function skateComboValue(g: SkateState) {
  return Math.round(g.combo * multiplier(g));
}
function feedback(g: SkateState, message: string) {
  g.message = message;
  g.messageTime = 1.8;
}
/** A landed scoring element joins the combo. */
function addElement(g: SkateState, label: string, points: number) {
  g.combo += points;
  g.count++;
  g.lastTrick = label;
  g.stats.maxMultiplier = Math.max(g.stats.maxMultiplier, multiplier(g));
  feedback(g, `${label} ×${multiplier(g)}`);
}
function clearCombo(g: SkateState) {
  g.combo = g.count = g.comboRails = g.landWindow = 0;
  g.railBonus = false;
  g.lastTrick = "";
}
export function bankSkateCombo(g: SkateState) {
  const value = g.count ? skateComboValue(g) : 0;
  if (value) {
    g.score += value;
    g.bestCombo = Math.max(g.bestCombo, value);
    feedback(g, `Landed +${value.toLocaleString("en-US")}`);
  }
  clearCombo(g);
}
function clearAir(g: SkateState) {
  g.pending = g.pendingCount = g.pendingKickflips = 0;
  g.hipAir = false;
  g.airTime = 0;
  g.popValid = false;
}
function bail(g: SkateState, why: string) {
  clearCombo(g);
  clearAir(g);
  g.trick = null;
  g.manual = false;
  g.bailTime = 0.85;
  g.speed *= 0.15;
  g.stats.bails++;
  feedback(g, why);
}
function takeOff(g: SkateState, vy: number) {
  g.vy = vy;
  g.grounded = false;
  g.manual = false;
  g.landWindow = 0;
  g.popSpeed = g.speed;
  g.popValid = g.speed >= POP_MIN_SPEED;
  g.hipAir = g.speed >= HIP_AIR_SPEED && onHip(g.x, g.z);
  g.takeoffX = g.x;
  g.takeoffZ = g.z;
  g.airTime = 0;
  g.pending = g.pendingCount = g.pendingKickflips = 0;
}
/** The air's tricks, hip air and transfer join the combo (landed rolling or on a rail). */
function commitAir(g: SkateState, onRail: boolean) {
  if (!onRail && g.speed < ROLLING_SPEED) {
    if (g.pendingCount) feedback(g, "Land rolling");
    clearAir(g);
    return;
  }
  if (g.hipAir && !onRail) {
    addElement(g, "Hip air", hipAirValue(g.airTime));
    g.stats.longestHipAir = Math.max(g.stats.longestHipAir, g.airTime);
    const ax = g.takeoffX - HIP.x,
      az = g.takeoffZ - HIP.z,
      bx = g.x - HIP.x,
      bz = g.z - HIP.z;
    if (ax * bx + az * bz < 0 && Math.hypot(bx, bz) < 5) {
      addElement(g, "Hip transfer", HIP_TRANSFER);
      g.stats.transfers++;
    }
  }
  if (g.pendingCount) {
    const label = g.lastTrick;
    g.combo += g.pending;
    g.count += g.pendingCount;
    g.stats.kickflips += g.pendingKickflips;
    if (g.hipAir) g.stats.hipKickflips += g.pendingKickflips;
    g.stats.maxMultiplier = Math.max(g.stats.maxMultiplier, multiplier(g));
    feedback(g, `${label} ×${multiplier(g)}`);
  }
  clearAir(g);
}
function forwardSlope(g: SkateState) {
  const dx = Math.sin(g.heading) * 0.04,
    dz = -Math.cos(g.heading) * 0.04;
  return (skateHeight(g.x + dx, g.z + dz) - skateHeight(g.x, g.z)) / 0.04;
}

/**
 * Advances the simulation by `delta` s. Mutates `g`; reads `input` (the
 * one-shot `jump` / `trick` fields act on the first substep only). Substeps
 * keep ramp contacts stable at low FPS. Allocates nothing.
 */
export function stepSkate(g: SkateState, input: SkateInput, delta: number) {
  if (g.phase === "done" || !Number.isFinite(delta) || delta <= 0) return;
  const dt = Math.min(delta, 0.1),
    steps = Math.ceil(dt / (1 / 120));
  for (let i = 0; i < steps; i++) integrate(g, input, i === 0, dt / steps);
  // Deadline uses active elapsed time, not the capped physics budget. A slow
  // frame may simplify contacts but must never grant extra scoring time.
  g.time += delta;
  if (g.mode !== "free" && g.time + 1e-8 >= SKATE.duration) {
    g.time = SKATE.duration;
    if (g.grounded && !g.trick) bankSkateCombo(g);
    else clearCombo(g);
    clearAir(g);
    g.trick = null;
    g.manual = false;
    g.phase = "done";
    g.speed = 0;
  }
}

function integrate(g: SkateState, input: SkateInput, first: boolean, dt: number) {
  g.messageTime = Math.max(0, g.messageTime - dt);
  g.railLock = Math.max(0, g.railLock - dt);
  g.recover = Math.max(0, g.recover - dt);
  if (g.bailTime > 0) g.bailTime = Math.max(0, g.bailTime - dt);
  const available = g.bailTime === 0;
  const jump = first && input.jump,
    trick = first ? input.trick : null;
  if (available) {
    const push = Number.isFinite(input.push) ? clamp(input.push, 0, 1) : 0;
    const steer = Number.isFinite(input.steer) ? clamp(input.steer, -1, 1) : 0;
    // S at speed is a manual; below it (or off the ground) it is the brake.
    const wantsManual = input.brake && g.grounded && g.rail < 0;
    if (wantsManual && !g.manual && !g.manualUsed && g.speed >= MANUAL_MIN_SPEED) {
      g.manual = true;
      g.manualUsed = true;
      g.manualTime = 0;
      g.needle = 0.08 * (Math.sin(g.time * 7.3 + g.x) >= 0 ? 1 : -1);
      g.landWindow = 0;
      addElement(g, "Manual", 0);
    } else if (g.manual && (!wantsManual || g.speed < MANUAL_MIN_SPEED * 0.8 || g.manualTime >= MANUAL_MAX)) {
      endManual(g);
    }
    if (g.rail < 0 && g.grounded) {
      g.heading += steer * (g.manual ? 0.8 : 2.2) * dt;
      const brake = input.brake && !g.manual ? 9 : 0;
      g.speed += (push * (g.manual ? 0 : 5.8) - 0.55 - brake) * dt;
    } else if (g.rail < 0) g.heading += steer * 1.1 * dt;
    if (g.manual) {
      // The needle drifts away from centre and steering pushes it back.
      g.needle += (g.needle * 1.8 + Math.sign(g.needle || 1) * 0.35 - steer * 2.6) * dt;
      g.manualTime += dt;
      g.combo += MANUAL_PER_S * dt;
      g.stats.longestManual = Math.max(g.stats.longestManual, g.manualTime);
      if (Math.abs(g.needle) >= 1) {
        bail(g, "Lost the manual");
        return;
      }
    }
    // A flip includes its own pop so keyboard and touch never need two timed
    // inputs just to start a trick. Airborne flips still risk a late landing.
    if ((jump || trick) && (g.rail >= 0 || (g.grounded && g.recover === 0))) {
      // Pop relative to the surface: an uphill bank can rise faster than the
      // flat-ground impulse. Carry its lift rather than landing in this step.
      const lift = g.grounded ? Math.max(0, forwardSlope(g) * g.speed) : 0;
      if (g.rail >= 0) endGrind(g);
      takeOff(g, 7.2 + lift);
      g.railLock = 0.22;
      if (!trick) feedback(g, "Ollie");
    } else if ((jump || trick) && g.grounded && g.recover > 0 && g.messageTime < 1.2) feedback(g, "Set your feet");
    if (trick && !g.grounded && g.rail < 0 && !g.trick) {
      g.trick = trick;
      g.trickTime = 0;
      g.trickDuration = TRICKS[trick].duration;
      feedback(g, g.popValid ? `${TRICKS[trick].label}…` : "Need speed");
    }
  }
  if (g.trick) {
    g.trickTime += dt;
    if (g.trickTime >= g.trickDuration) {
      if (g.popValid) {
        g.pending += trickValue(g.trick, g.popSpeed, g.hipAir);
        g.pendingCount++;
        if (g.trick === "kickflip") g.pendingKickflips++;
        g.lastTrick = TRICKS[g.trick].label;
      } else feedback(g, "Need speed");
      g.trick = null;
    }
  }
  g.speed = clamp(g.speed, 0, 10);
  if (g.rail >= 0) {
    const rail = SKATE_RAILS[g.rail];
    g.x = rail.x;
    g.z -= Math.cos(g.heading) * g.speed * dt;
    g.y = rail.height;
    g.combo += GRIND_PER_S * dt;
    g.railTime += dt;
    g.stats.longestGrind = Math.max(g.stats.longestGrind, g.railTime);
    if (!input.grind || g.z < rail.from || g.z > rail.to || !available) {
      endGrind(g);
      g.railLock = 0.3;
      g.grounded = false;
      g.vy = 0;
      // Dropping off a rail is a little air, not a pop: nothing to score in it.
      g.popValid = false;
      g.hipAir = false;
      g.airTime = 0;
    }
  } else {
    const dx = Math.sin(g.heading),
      dz = -Math.cos(g.heading);
    const slope = forwardSlope(g);
    if (g.grounded) g.speed = clamp(g.speed - slope * 9 * dt, 0, 10);
    g.x += dx * g.speed * dt;
    g.z += dz * g.speed * dt;
    // Walls: a hard hit is a bail, a soft one a stop. No pinball bounce.
    const hitX = Math.abs(g.x) >= SKATE.halfWidth,
      hitZ = Math.abs(g.z) >= SKATE.halfDepth;
    if (hitX || hitZ) {
      g.x = clamp(g.x, -SKATE.halfWidth + 0.01, SKATE.halfWidth - 0.01);
      g.z = clamp(g.z, -SKATE.halfDepth + 0.01, SKATE.halfDepth - 0.01);
      // Up a bank the coping turns you round (a stall: you roll back down);
      // a flat wall (the open front) stops you, or bails you when fast.
      const onBank = skateHeight(g.x, g.z) > 0.9;
      if (!onBank && g.speed > WALL_BAIL_SPEED && available) bail(g, "Hit the wall");
      g.speed = onBank ? g.speed * 0.3 : 0;
      g.heading += Math.PI;
      if (onBank && g.grounded) g.slope = 0;
    }
    const floor = skateHeight(g.x, g.z);
    if (g.grounded) {
      g.y = floor;
      // Carry uphill momentum off the crest of the central hip.
      if (g.slope > 0.2 && slope < 0.05 && g.speed > 4) {
        takeOff(g, g.speed * Math.min(g.slope, 0.8));
      }
      g.slope = slope;
    } else {
      g.vy -= SKATE.gravity * dt;
      g.y += g.vy * dt;
      g.airTime += dt;
      if (g.y <= floor) {
        g.y = floor;
        g.vy = 0;
        g.grounded = true;
        g.recover = POP_RECOVER;
        g.manualUsed = false;
        if (g.trick) bail(g, "Bail: flip earlier");
        else {
          commitAir(g, false);
          if (g.count) g.landWindow = LAND_WINDOW;
        }
      }
    }
    if (
      available &&
      input.grind &&
      !g.trick &&
      g.railLock === 0 &&
      g.speed > 1.5 &&
      Math.abs(Math.cos(g.heading)) > 0.7
    ) {
      for (let r = 0; r < SKATE_RAILS.length; r++) {
        const rail = SKATE_RAILS[r];
        if (Math.abs(g.x - rail.x) < 0.65 && g.z > rail.from && g.z < rail.to && Math.abs(g.y - rail.height) < 0.7 && g.vy < 3) {
          startGrind(g, r);
          break;
        }
      }
    }
  }
  collectLetters(g);
  if (g.landWindow > 0 && g.grounded && g.rail < 0 && !g.manual) {
    g.landWindow -= dt;
    if (g.landWindow <= 0) bankSkateCombo(g);
  }
}

function startGrind(g: SkateState, r: number) {
  if (!g.grounded) commitAir(g, true);
  else clearAir(g);
  if (g.manual) g.manual = false;
  g.rail = r;
  g.railTime = 0;
  g.grounded = false;
  g.landWindow = 0;
  g.heading = Math.cos(g.heading) > 0 ? 0 : Math.PI;
  g.y = SKATE_RAILS[r].height;
  g.vy = 0;
  addElement(g, r === 2 ? "Ledge grind" : "50–50 grind", GRIND_BASE);
  if (r < 2) g.comboRails |= 1 << r;
  if (g.comboRails === 3 && !g.railBonus) {
    g.railBonus = true;
    g.combo += RAIL_TO_RAIL_BONUS;
    g.stats.railToRail++;
    feedback(g, "Rail to rail +500");
  }
}
function endGrind(g: SkateState) {
  g.rail = -1;
}
function endManual(g: SkateState) {
  g.manual = false;
  if (g.count) g.landWindow = LAND_WINDOW;
}
function collectLetters(g: SkateState) {
  if (g.mode === "free" || g.letters === 15) return;
  for (let i = 0; i < SKATE_LETTERS.length; i++) {
    if (g.letters & (1 << i)) continue;
    const l = SKATE_LETTERS[i];
    if (Math.abs(g.x - l.x) < LETTER_RADIUS && Math.abs(g.z - l.z) < LETTER_RADIUS && Math.abs(g.y - l.y) < 2.2) {
      g.letters |= 1 << i;
      if (g.letters === 15) {
        g.score += LETTER_BONUS;
        feedback(g, "J-O-S-H +1,000");
      } else feedback(g, `Letter ${l.letter}`);
    }
  }
}

/** Goals met by a finished (or running) run. */
export function skateGoalMet(id: SkateGoalId, g: SkateState): boolean {
  const s = g.stats;
  switch (id) {
    case "both-rails":
      return s.railToRail > 0;
    case "combo-1500":
      return g.bestCombo >= 1500;
    case "kickflip-hip":
      return s.hipKickflips > 0;
    case "manual-3":
      return s.longestManual >= 3;
    case "josh":
      return g.letters === 15;
    case "no-bails":
      return g.phase === "done" && s.bails === 0;
    case "kickflips-5":
      return s.kickflips >= 5;
    case "transfer":
      return s.transfers > 0;
    case "score-4000":
      return g.score >= 4000;
    case "multiplier-4":
      return s.maxMultiplier >= 4;
    case "grind-2":
      return s.longestGrind >= 2;
    case "big-air":
      return s.longestHipAir >= 0.8;
  }
}
export const skateGoalsMet = (g: SkateState) => g.goals.filter((id) => skateGoalMet(id, g)).length;
/** Gold run score (also in core/medals.ts). */
export const SKATE_GOLD = 12000;
/** Clean Line: gold, no bails, all three goals. */
export const isCleanLine = (g: SkateState) =>
  g.phase === "done" && g.score >= SKATE_GOLD && g.stats.bails === 0 && g.goals.length === 3 && skateGoalsMet(g) === 3;
