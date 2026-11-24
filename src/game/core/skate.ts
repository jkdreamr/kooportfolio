// The rendered terrain and simulation share these dimensions and height field.
export const SKATE = {
  worldScale: 2,
  halfWidth: 10.5,
  halfDepth: 12.5,
  bankX: 7.5,
  bankZ: 9.5,
  gravity: 18,
  comboWindow: 2.4,
  duration: 60,
} as const;
/** World-space gate target for the host's Exit button; z > 23 shows the exit prompt. */
export const SKATE_EXIT: [number, number] = [0, 24];

export const SKATE_RAILS = [
  { x: -3.6, from: -7, to: 2, height: 0.7 },
  { x: 5.5, from: 2, to: 7, height: 0.55 },
] as const;
export type SkateTrick = "kickflip" | "shove-it";
export type SkateInput = {
  push: number;
  steer: number;
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
export type SkateState = {
  mode: "free" | "run";
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
  time: number;
  score: number;
  combo: number;
  count: number;
  bestCombo: number;
  comboTime: number;
  lastTrick: string;
  trick: SkateTrick | null;
  trickTime: number;
  trickDuration: number;
  bailTime: number;
  message: string;
  messageTime: number;
};
export function skateHeight(x: number, z: number) {
  const frontOpening =
    z > 0 ? Math.min(1, Math.max(0, (Math.abs(x) - 2) / 2)) : 1;
  const bank =
    Math.max(
      Math.max(0, Math.abs(x) - SKATE.bankX) ** 2,
      Math.max(0, Math.abs(z) - SKATE.bankZ) ** 2 * frontOpening,
    ) * 0.25;
  const hip =
    1.25 *
    Math.max(0, 1 - Math.max(Math.abs(x - 3) / 2.2, Math.abs(z + 3) / 2.8));
  return 0.18 + Math.max(bank, hip);
}
export function newSkateGame(mode: SkateState["mode"] = "free"): SkateState {
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
    time: 0,
    score: 0,
    combo: 0,
    count: 0,
    bestCombo: 0,
    comboTime: 0,
    lastTrick: "",
    trick: null,
    trickTime: 0,
    trickDuration: 0,
    bailTime: 0,
    message: "Push to roll",
    messageTime: 2.5,
  };
}
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const multiplier = (g: SkateState) => Math.min(8, Math.max(1, g.count));
export function skateComboValue(g: SkateState) {
  return Math.round(g.combo * multiplier(g));
}
function feedback(g: SkateState, message: string) {
  g.message = message;
  g.messageTime = 1.8;
}
function addTrick(g: SkateState, label: string, points: number) {
  g.combo += g.lastTrick === label ? Math.round(points * 0.4) : points;
  g.count++;
  g.lastTrick = label;
  g.comboTime = SKATE.comboWindow;
  feedback(g, label);
}
export function bankSkateCombo(g: SkateState) {
  const value = skateComboValue(g);
  if (value) {
    g.score += value;
    g.bestCombo = Math.max(g.bestCombo, value);
    feedback(g, `Landed +${value.toLocaleString("en-US")}`);
  }
  g.combo = g.count = g.comboTime = 0;
  g.lastTrick = "";
}
function bail(g: SkateState) {
  g.combo = g.count = g.comboTime = 0;
  g.lastTrick = "";
  g.trick = null;
  g.bailTime = 0.85;
  g.speed *= 0.15;
  feedback(g, "Bail — try an earlier flip");
}
function forwardSlope(g: SkateState) {
  return (
    (skateHeight(
      g.x + Math.sin(g.heading) * 0.04,
      g.z - Math.cos(g.heading) * 0.04,
    ) -
      skateHeight(g.x, g.z)) /
    0.04
  );
}

// Mutates one local simulation; substeps keep ramp contacts stable at low FPS.
export function stepSkate(g: SkateState, input: SkateInput, delta: number) {
  if (g.phase === "done" || !Number.isFinite(delta) || delta <= 0) return;
  const dt = Math.min(delta, 0.1),
    steps = Math.ceil(dt / (1 / 120));
  for (let i = 0; i < steps; i++) {
    integrate(
      g,
      {
        ...input,
        jump: i === 0 && input.jump,
        trick: i === 0 ? input.trick : null,
      },
      dt / steps,
    );
  }
  // Deadline uses active elapsed time, not the capped physics budget. A slow
  // frame may simplify contacts but must never grant extra scoring time.
  g.time += delta;
  if (g.mode === "run" && g.time + 1e-8 >= SKATE.duration) {
    g.time = SKATE.duration;
    if (g.grounded && !g.trick) bankSkateCombo(g);
    else {
      g.combo = g.count = g.comboTime = 0;
    }
    g.trick = null;
    g.phase = "done";
    g.speed = 0;
  }
}
function integrate(g: SkateState, input: SkateInput, dt: number) {
  g.messageTime = Math.max(0, g.messageTime - dt);
  g.railLock = Math.max(0, g.railLock - dt);
  if (g.bailTime > 0) {
    g.bailTime = Math.max(0, g.bailTime - dt);
  }
  const available = g.bailTime === 0;
  if (available) {
    const push = Number.isFinite(input.push) ? clamp(input.push, 0, 1) : 0;
    const steer = Number.isFinite(input.steer) ? clamp(input.steer, -1, 1) : 0;
    if (g.rail < 0) {
      g.heading += steer * (g.grounded ? 2.2 : 1.1) * dt;
      g.speed += (push * 5.8 - 0.55 - (input.brake ? 9 : 0)) * dt;
    }
    // A flip includes its own pop so keyboard and touch never need two timed
    // inputs just to start a trick. Airborne flips still risk a late landing.
    if ((input.jump || input.trick) && (g.grounded || g.rail >= 0)) {
      // Pop relative to the surface: an uphill bank can rise faster than the
      // flat-ground impulse. Carry its lift rather than landing in this step.
      g.vy = 7.2 + (g.grounded ? Math.max(0, forwardSlope(g) * g.speed) : 0);
      g.grounded = false;
      g.rail = -1;
      g.railLock = 0.22;
      addTrick(g, "Ollie", 80);
    }
    if (input.trick && !g.grounded && g.rail < 0 && !g.trick) {
      g.trick = input.trick;
      g.trickTime = 0;
      g.trickDuration = input.trick === "kickflip" ? 0.48 : 0.38;
      feedback(g, input.trick === "kickflip" ? "Kickflip…" : "Shove-it…");
    }
  }
  if (g.trick) {
    g.trickTime += dt;
    if (g.trickTime >= g.trickDuration) {
      addTrick(
        g,
        g.trick === "kickflip" ? "Kickflip" : "Shove-it",
        g.trick === "kickflip" ? 250 : 180,
      );
      g.trick = null;
    }
  }
  g.speed = clamp(g.speed, 0, 10);
  if (g.rail >= 0) {
    const rail = SKATE_RAILS[g.rail];
    g.x = rail.x;
    g.z -= Math.cos(g.heading) * g.speed * dt;
    g.y = rail.height;
    g.combo += 65 * dt;
    g.comboTime = SKATE.comboWindow;
    if (!input.grind || g.z < rail.from || g.z > rail.to || !available) {
      g.rail = -1;
      g.railLock = 0.3;
      g.grounded = false;
      g.vy = 0;
    }
  } else {
    const dx = Math.sin(g.heading),
      dz = -Math.cos(g.heading);
    const slope = forwardSlope(g);
    if (g.grounded) g.speed = clamp(g.speed - slope * 9 * dt, 0, 10);
    g.x += dx * g.speed * dt;
    g.z += dz * g.speed * dt;
    if (Math.abs(g.x) >= SKATE.halfWidth) {
      g.x = clamp(g.x, -SKATE.halfWidth, SKATE.halfWidth);
      g.heading = -g.heading;
      g.speed *= 0.75;
    }
    if (Math.abs(g.z) >= SKATE.halfDepth) {
      g.z = clamp(g.z, -SKATE.halfDepth, SKATE.halfDepth);
      g.heading = Math.PI - g.heading;
      g.speed *= 0.75;
    }
    const floor = skateHeight(g.x, g.z);
    if (g.grounded) {
      g.y = floor;
      // Carry uphill momentum off the crest of the central hip.
      if (g.slope > 0.2 && slope < 0.05 && g.speed > 4) {
        g.grounded = false;
        g.vy = g.speed * Math.min(g.slope, 0.8);
      }
      g.slope = slope;
    } else {
      g.vy -= SKATE.gravity * dt;
      g.y += g.vy * dt;
      if (g.y <= floor) {
        g.y = floor;
        g.vy = 0;
        g.grounded = true;
        if (g.trick) bail(g);
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
      const rail = SKATE_RAILS.findIndex(
        (r) =>
          Math.abs(g.x - r.x) < 0.65 &&
          g.z > r.from &&
          g.z < r.to &&
          Math.abs(g.y - r.height) < 0.7 &&
          g.vy < 3,
      );
      if (rail >= 0) {
        g.rail = rail;
        g.grounded = false;
        g.heading = Math.cos(g.heading) > 0 ? 0 : Math.PI;
        g.y = SKATE_RAILS[rail].height;
        g.vy = 0;
        addTrick(g, "50–50 grind", 200);
      }
    }
  }
  if (g.combo && g.grounded && g.rail < 0) {
    g.comboTime -= dt;
    if (g.comboTime <= 0) bankSkateCombo(g);
  }
}
