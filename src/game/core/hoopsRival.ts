/**
 * Blacktop rivals (PLAN_GAMES §2.1): three fictional villagers named by
 * role. They play by the player's own movement and shot rules (the same
 * `moveActor`, `dash`, `startShot`, `release`, `jump`), seeded through the
 * game's rng, with no speed-up when behind and no hidden help.
 */
import {
  HOOP_X,
  HOOP_Z,
  DRIVE,
  METER,
  ZONE,
  charge,
  delayedHolder,
  dash,
  dist,
  jump,
  moveActor,
  rand,
  release,
  startShot,
  type Hoops,
} from "./hoops";

export type RivalId = "classmate" | "hooper" | "legend";
export type RivalSpec = {
  name: string;
  /** One line for the ladder card. */
  blurb: string;
  speed: number;
  reaction: number;
  bite: number;
  reach: number;
  block: number;
  three: number;
  mid: number;
  layup: number;
  /** Chase-down block chance on a layup that beat him. */
  chase: number;
  /** How far he sags off the ball. */
  sag: number;
  /** Crossovers (ball exposed) per possession. */
  crosses: number;
  /** Chance per decision to pull up when open. */
  pull: number;
  /** Chance a guarded pull-up is a pump fake. */
  fake: number;
  shirt: string;
};

export const RIVALS: Readonly<Record<RivalId, RivalSpec>> = {
  classmate: {
    name: "The Classmate",
    blurb: "Settles for jumpers. Sags off. Loose with the ball.",
    speed: 3.9,
    reaction: 0.36,
    bite: 0.55,
    reach: 1.2,
    block: 0.1,
    three: 0.22,
    mid: 0.38,
    layup: 0.62,
    chase: 0,
    sag: 1.9,
    crosses: 2,
    pull: 0.75,
    fake: 0.1,
    shirt: "#5b86b8",
  },
  hooper: {
    name: "The Hooper",
    blurb: "Drives when you play up, pulls up when you sag.",
    speed: 4.5,
    reaction: 0.26,
    bite: 0.35,
    reach: 1.5,
    block: 0.28,
    three: 0.31,
    mid: 0.46,
    layup: 0.72,
    chase: 0,
    sag: 1.0,
    crosses: 1,
    pull: 0.65,
    fake: 0.4,
    shirt: "#c4703f",
  },
  legend: {
    name: "The Legend",
    blurb: "Bully drives, a turnaround fade, and the chase-down block.",
    speed: 5.0,
    reaction: 0.18,
    bite: 0.18,
    reach: 1.8,
    block: 0.42,
    three: 0.36,
    mid: 0.52,
    layup: 0.8,
    chase: 0.45,
    sag: 0.9,
    crosses: 1,
    pull: 0.6,
    fake: 0.55,
    shirt: "#7a4a8c",
  },
};
export const RIVAL_ORDER: readonly RivalId[] = ["classmate", "hooper", "legend"];

export type RivalBrain = {
  /** Next decision time (offence). 0 = decide now. */
  plan: number;
  action: 0 | 1 | 2 | 3 | 4;
  side: number;
  relAt: number;
  jumpPlanAt: number;
  jumpFor: number;
  possessionCrosses: number;
  /** Game time of the last juke that bit (slams after a bite). */
  bitAt: number;
  /** The player's bite chance on the rival's crossovers (0: humans don't bite). */
  playerBite: number;
  dunkJumped: number;
  fake: boolean;
};
export const newBrain = (): RivalBrain => ({
  plan: 0,
  action: 0,
  side: 1,
  relAt: -1,
  jumpPlanAt: -1,
  jumpFor: -9,
  possessionCrosses: 0,
  bitAt: -9,
  playerBite: 0,
  dunkJumped: -9,
  fake: false,
});

const gauss = (g: Hoops) => (rand(g) + rand(g) + rand(g) - 1.5) * 1.41;

/** Steers the rival for one step: offence, defence, rebounds. */
export function rivalStep(g: Hoops, dt: number) {
  const r = g.r,
    p = g.p,
    R = RIVALS[g.rival],
    b = g.ball,
    m = g.brain;
  let tx = r.x,
    tz = r.z,
    urgency = 1;
  const t = g.t;
  if (b.phase === "held" && b.holder === 1) {
    // ---------------------------------------------------------- offence
    const d = dist(r.x, r.z),
      gap = Math.hypot(p.x - r.x, p.z - r.z);
    if (r.gatherAt >= 0) {
      tx = r.x;
      tz = r.z;
      if (m.fake && t >= r.gatherAt + 0.28) {
        // Pump fake: the ball comes back down and he goes.
        r.gatherAt = -1;
        m.fake = false;
        m.action = 0;
        m.plan = t + 0.7;
        g.events.push({ k: "fake", who: 1 });
      } else if (!m.fake && t >= m.relAt) release(g, 1, charge(g, r));
    } else if (t >= g.checkUntil) {
      const hx = (HOOP_X - r.x) / (d || 1),
        hz = (HOOP_Z - r.z) / (d || 1);
      if (m.plan === 0) m.plan = t + 0.8 + rand(g) * 1.0; // size him up
      if (t >= m.plan) {
        m.plan = t + 0.25;
        const open = gap > 2.2 || t < p.rootedUntil;
        // Is he in the lane (between me and the rim)?
        const along = (p.x - r.x) * hx + (p.z - r.z) * hz,
          across = Math.abs((p.x - r.x) * -hz + (p.z - r.z) * hx);
        const lane = along > 0 && along < d && across < 1.3 && t >= p.rootedUntil;
        const roll = rand(g);
        if (g.takeBack) m.action = 3;
        else if (g.shotClock < 2.2) m.action = 2;
        else if (d <= 2.8) m.action = 2;
        else if (!lane) m.action = 0;
        else if (open && d < ZONE.three - 0.2 && roll < R.pull) m.action = 2;
        else if (open && gap > 2.8 && roll < R.pull * R.three * 1.2) m.action = 2;
        else if (gap > 1.15 && d < ZONE.three - 0.2 && roll < R.pull * 0.35) m.action = 2; // over the top
        else if (g.shotClock < 4.5 && gap > 1.5) m.action = 2;
        else if (g.shotClock < 4.5) m.action = 4;
        else m.action = 0;
        if (m.action === 0 && rand(g) < 0.3) m.side = -m.side;
      }
      if (m.action === 3) {
        // Take it back past the arc, then come again.
        tx = Math.max(-3, Math.min(3, r.x * 0.6));
        tz = HOOP_Z + ZONE.three + 1.2;
        if (!g.takeBack) {
          m.action = 0;
          m.plan = t + 0.3;
        }
      } else if (m.action === 2) {
        startShot(g, 1);
        if (r.gatherAt >= 0) {
          m.fake = gap < 1.8 && g.shotClock > 3 && d > ZONE.paint && rand(g) < R.fake;
          r.gatherFade = g.rival === "legend" && d > ZONE.paint && gap < 1.6;
          const meter = METER[r.gatherType];
          // Release tempo varies (a quick trigger beats a timed contest).
          const spread = g.rival === "classmate" ? 0.2 : 0.4;
          m.relAt = r.gatherAt + meter.fill * meter.centre * (1 - spread + 1.5 * spread * rand(g));
        } else m.action = 0;
      } else if (m.action === 4) {
        // Step back for space, then rise if it opened up.
        tx = r.x - hx * 2;
        tz = r.z - hz * 2;
        if (gap > 1.7 || t >= m.plan) {
          m.action = gap > 1.5 ? 2 : 0;
          m.plan = t + 0.25;
        }
      } else {
        // Drive: at the hoop, shading away from the defender.
        tx = HOOP_X - hz * m.side * 0.9;
        tz = HOOP_Z + 1.2 + hx * m.side * 0.9;
        const inPath = (p.x - r.x) * hx + (p.z - r.z) * hz > 0 && gap < 1.4;
        if (inPath && t >= r.cdUntil && t >= m.plan - 0.2) {
          const roll = rand(g);
          if (m.possessionCrosses < R.crosses && roll < 0.55) {
            m.possessionCrosses++;
            m.side = -m.side;
            dash(g, 1, -hz * m.side, hx * m.side);
          } else if (g.rival !== "classmate" && roll < (g.rival === "legend" ? 0.85 : 0.65)) {
            r.bully = t + DRIVE.time;
            dash(g, 1, hx, hz); // bully drive: he moves you
          } else if (roll < 0.9) {
            m.action = 4;
            m.plan = t + 0.6;
          } else {
            m.side = -m.side;
            dash(g, 1, -hz * m.side, hx * m.side); // a second crossover, ball tight
          }
        }
      }
    }
  } else if (b.phase === "held" && b.holder === 0) {
    // ---------------------------------------------------------- defence
    const [hx0, hz0] = delayedHolder(g, R.reaction);
    const d = dist(hx0, hz0) || 1;
    const ux = (HOOP_X - hx0) / d,
      uz = (HOOP_Z - hz0) / d;
    let sag = R.sag + (g.takeBack ? 1.2 : 0);
    if (d > ZONE.three + 1.5) sag += 0.8;
    tx = hx0 + ux * Math.min(sag, d - 0.5);
    tz = hz0 + uz * Math.min(sag, d - 0.5);
    const gap = Math.hypot(p.x - r.x, p.z - r.z);
    if (p.gatherAt >= 0) {
      // Close out and time the jump to the meter's green.
      tx = p.x + ux * 0.55;
      tz = p.z + uz * 0.55;
      urgency = 1.4;
      if (m.jumpFor !== p.gatherAt) {
        m.jumpFor = p.gatherAt;
        const meter = METER[p.gatherType];
        m.jumpPlanAt = p.gatherAt + meter.fill * meter.centre + R.reaction * 0.35 * gauss(g);
      }
      if (m.jumpPlanAt > 0 && t >= m.jumpPlanAt) {
        m.jumpPlanAt = -1;
        if (gap < R.reach + 1.1) jump(g, 1);
      }
    } else if (dist(p.x, p.z) < 3.2 && gap < 1.5 && Math.hypot(p.vx, p.vz) > 3 && t - m.dunkJumped > 1.2) {
      // A drive at the rim: go up with him, sometimes.
      m.dunkJumped = t;
      if (rand(g) < R.block * 1.4) jump(g, 1);
    }
  } else if (b.phase === "loose" || b.phase === "dead") {
    if (t - b.since > R.reaction * 0.6) {
      // Run to where it is going, not where it is.
      tx = b.x + b.vx * 0.35;
      tz = b.z + b.vz * 0.35;
      urgency = 1.5;
    }
  } else if (b.phase === "flight") {
    // Crash or box out: toward the rim side of the shooter.
    tx = HOOP_X + (b.shooter === 0 ? 0.8 : -0.6);
    tz = HOOP_Z + 2.4;
    urgency = 0.6;
  }
  const dx = tx - r.x,
    dz = tz - r.z,
    dd = Math.hypot(dx, dz);
  let mx = 0,
    mz = 0;
  if (dd > 0.05) {
    const k = Math.min(1, (dd * 3 * urgency) / R.speed) / dd;
    mx = dx * k;
    mz = dz * k;
  }
  moveActor(g, r, mx, mz, R.speed, dt);
}
