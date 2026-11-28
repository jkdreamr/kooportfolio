/**
 * Regatta Grand Prix (PLAN_GAMES §2.2): the boat and the race, pure. The
 * crew rows by itself; the cox steers, holds water and calls the Power Ten.
 * Everything steps at the fixed 60 Hz TICK on reused objects (no allocation
 * per step except the rare event records the scene drains).
 */
import {
  APEX_D,
  HALF_WIDTH,
  SHALLOWS,
  bendAhead,
  course as getCourse,
  kappa,
  wrapS,
  type Course,
  type CourseId,
} from "./rowCourse";

export const TICK = 1 / 60;
export const CRUISE = 12.0;
export const TURN_RATE = 0.8;
export const STEER_TAU = 0.12;
export const SCRUB = 0.12;
export const HOLD = { speed: 0.55, turn: 1.6, decel: 2.2 } as const;
export const ACCEL_UP = 0.9;
export const SHALLOW_MULT = 0.8;
export const SLIP = { from: 2, to: 14, across: 2.2, mult: 1.07, arm: 1.5, sling: 1.15, slingTime: 1.2, gain: 10 } as const;
export const CORNER = { perfect: 1.8, clean: 3.5, perfectGain: 50, cleanGain: 25, surge: 1.15, surgeTime: 0.8 } as const;
export const BOOST = { max: 300, charge: 100, start: 100, mult: 1.28, time: 2.5, sector: 25 } as const;
export const ROCKET = { window: 0.12, mult: 1.25, time: 1.0, stall: 0.5 } as const;
export const CHEVRON = { half: 1.5, mult: 1.2, time: 1.0 } as const;
export const BUMP = { radius: 0.9, offsets: [-3.2, 0, 3.2], restitution: 0.3, loss: 0.06, noGain: 0.6 } as const;
export const BUOY = { radius: 0.6, mult: 0.85, time: 0.5 } as const;
/** Hull half-beam for buoys and piers (the bump circles are wider: oars). */
export const HULL_HALF = 0.3;
export const PIER = { d: 3.2, radius: 0.9, mult: 0.35 } as const;
export const WRONG = { angle: (110 * Math.PI) / 180, warn: 1, reset: 2 } as const;
export const COUNT_IN = 3;
/** Upper bound on any boat's speed: cruise × boost × chevron (§2.2 fairness). */
export const V_MAX = CRUISE * BOOST.mult * CHEVRON.mult;

/** Stroke drive curve for the oar animation (unchanged from the old race). */
export function strokeDrive(phase: number) {
  return phase < 0.38 ? (Math.sin((phase / 0.38) * Math.PI) * Math.PI) / 2 : 0;
}

export type Cup = "novice" | "varsity" | "head";
export type RaceMode = "gp" | "sprint" | "tt" | "daily";
/** Rival pace by cup, Blue / White / Green. Plan: 0.920–1.000; moved by the
 * tuning bots (tests/rowing.tuning.test.ts), which are the judge. Varsity
 * and Head softened so the Line bot wins ~60% / ~18% (was 12% / 7.5%). */
export const SKILL: Readonly<Record<Cup, readonly [number, number, number]>> = {
  novice: [0.92, 0.935, 0.95],
  varsity: [0.931, 0.946, 0.961],
  head: [0.945, 0.96, 0.975],
};
export const CREWS = [
  { name: "You", blade: "#8c1515" },
  { name: "Blue", blade: "#7186bd" },
  { name: "White", blade: "#e9e4d8" },
  { name: "Green", blade: "#4a9485" },
] as const;

export type Boat = {
  id: number;
  s: number;
  d: number;
  th: number;
  v: number;
  steer: number;
  skill: number;
  meter: number;
  boostT: number;
  wakeT: number;
  armed: boolean;
  inWake: boolean;
  slingT: number;
  surgeT: number;
  chevT: number;
  buoyT: number;
  scrapeT: number;
  noGainT: number;
  rocketT: number;
  stallT: number;
  wrongT: number;
  rocketUsed: boolean;
  jumped: boolean;
  holding: boolean;
  prevBoost: boolean;
  /** Bend being graded (index into course.bends), and whether it is void. */
  bend: number;
  bendVoid: boolean;
  bendGraded: boolean;
  sectorClean: boolean;
  /** Next checkpoint index (absolute, counting every lap's checkpoints). */
  cp: number;
  lapStart: number;
  lapTimes: number[];
  splits: number[];
  finished: boolean;
  finishTime: number;
  place: number;
  stroke: number;
  passes: number;
  slingPasses: number;
  perfects: number;
  cleans: number;
  bumps: number;
};

export type RowEventKind =
  | "go"
  | "rocket"
  | "jump"
  | "boost"
  | "wake"
  | "sling"
  | "perfect"
  | "clean"
  | "buoy"
  | "scrape"
  | "pier"
  | "bump"
  | "chevron"
  | "lap"
  | "final"
  | "split"
  | "finish"
  | "pass"
  | "passed"
  | "wrong"
  | "reset";
export type RowEvent = { k: RowEventKind; boat: number; v?: number };

export type RowInput = { steer: number; boost: boolean; hold: boolean };
export const freshRowInput = (): RowInput => ({ steer: 0, boost: false, hold: false });

export type Pedal = { s: number; d: number; phase: number };
export type Race = {
  course: Course;
  mode: RaceMode;
  cup: Cup;
  laps: number;
  total: number;
  t: number;
  boats: Boat[];
  rivals: boolean;
  band: boolean;
  pedals: Pedal[];
  /** Checkpoints per lap, starting with the line itself (s = 0). */
  cps: number[];
  rng: number;
  events: RowEvent[];
  over: boolean;
  order: number[];
};

const newBoat = (id: number, s: number, d: number, skill: number): Boat => ({
  id,
  s,
  d,
  th: 0,
  v: 0,
  steer: 0,
  skill,
  meter: BOOST.start,
  boostT: 0,
  wakeT: 0,
  armed: false,
  inWake: false,
  slingT: 0,
  surgeT: 0,
  chevT: 0,
  buoyT: 0,
  scrapeT: 0,
  noGainT: 0,
  rocketT: 0,
  stallT: 0,
  wrongT: 0,
  rocketUsed: false,
  jumped: false,
  holding: false,
  prevBoost: false,
  bend: -1,
  bendVoid: false,
  bendGraded: false,
  sectorClean: true,
  cp: 1,
  lapStart: 0,
  lapTimes: [],
  splits: [],
  finished: false,
  finishTime: 0,
  place: 4,
  stroke: 0,
  passes: 0,
  slingPasses: 0,
  perfects: 0,
  cleans: 0,
  bumps: 0,
});

export type RaceOptions = { mode?: RaceMode; cup?: Cup; course?: CourseId; laps?: number; seed?: number; mirror?: boolean; band?: boolean };

export function newRace(o: RaceOptions = {}): Race {
  const mode = o.mode ?? "gp";
  const cup = o.cup ?? (mode === "daily" ? "varsity" : "novice");
  const courseId: CourseId = o.course ?? (mode === "daily" ? "river" : "loop");
  const c = getCourse(courseId, o.mirror ?? false);
  const laps = c.closed ? o.laps ?? (mode === "sprint" ? 2 : 3) : 1;
  const rivals = mode !== "tt";
  const skill = SKILL[cup];
  // You start 4th on a staggered grid, 6 u apart.
  const boats = rivals
    ? [newBoat(0, 0, -2.5, 1), newBoat(1, 18, 2.5, skill[0]), newBoat(2, 12, -2.5, skill[1]), newBoat(3, 6, 2.5, skill[2])]
    : [newBoat(0, 0, 0, 1)];
  for (const b of boats) {
    b.lapStart = 0;
    b.place = boats.length - (b.id === 0 ? 0 : b.id - 1) - (b.id === 0 ? 0 : 0);
  }
  const race: Race = {
    course: c,
    mode,
    cup,
    laps,
    total: c.length * laps,
    t: -COUNT_IN,
    boats,
    rivals,
    band: (o.band ?? true) && rivals,
    pedals: mode === "tt" ? [] : c.pedals.map((s, i) => ({ s, d: 0, phase: i * 2.1 + (o.seed ?? 1) * 0.37 })),
    cps: [0, ...c.checkpoints],
    rng: ((o.seed ?? 1) * 2654435761) >>> 0 || 1,
    events: [],
    over: false,
    order: boats.map((b) => b.id),
  };
  rankBoats(race);
  return race;
}

export function rand(r: Race): number {
  let x = r.rng | 0 || 0x9e3779b9;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  r.rng = x;
  return (x >>> 0) / 4294967296;
}

function emit(r: Race, k: RowEventKind, boat: number, v?: number) {
  if (r.events.length < 64) r.events.push({ k, boat, v });
}

/** The speed multiplier product for a boat this step (V_target / CRUISE). */
export function speedFactor(r: Race, b: Boat): number {
  let m = b.skill * (1 - SCRUB * Math.abs(b.steer));
  if (b.holding) m *= HOLD.speed;
  if (Math.abs(b.d) > SHALLOWS) m *= SHALLOW_MULT;
  if (b.inWake) m *= SLIP.mult;
  if (b.slingT > 0) m *= SLIP.sling;
  if (b.surgeT > 0) m *= CORNER.surge;
  if (b.boostT > 0) m *= BOOST.mult;
  if (b.rocketT > 0) m *= ROCKET.mult;
  if (b.chevT > 0) m *= CHEVRON.mult;
  if (b.buoyT > 0) m *= BUOY.mult;
  if (b.stallT > 0) m = 0;
  if (b.id !== 0 && r.band) m *= 1 + band(r, b);
  return m;
}

export const BAND_CATCH = 0.04;
export const BAND_WAIT = -0.015;
/** Bounded rubber-banding on a rival's target speed (§2.2). */
export function band(r: Race, b: Boat): number {
  if (!r.band || b.id === 0) return 0;
  const p = r.boats[0];
  if (p.s > r.total * 0.85 || b.s > r.total * 0.85) return 0;
  // Plan: ±4%. A leader waiting for you made a back-marker competitive, so
  // the wait is capped at 1.5% (the bots judge; catch-up keeps the 4%).
  return Math.max(BAND_WAIT, Math.min(BAND_CATCH, (p.s - b.s) * 0.001));
}

const gain = (b: Boat, n: number) => {
  if (b.noGainT > 0 || b.scrapeT > 0) return;
  b.meter = Math.min(BOOST.max, b.meter + n);
};

/** One boat, one step: input, kinematics, hazards, grading, laps. */
export function stepBoat(r: Race, b: Boat, input: RowInput, dt = TICK) {
  const c = r.course;
  const pressed = input.boost && !b.prevBoost;
  b.prevBoost = input.boost;
  if (r.t < 0) {
    // Count-in: an early call stalls the start.
    if (pressed && r.t < -ROCKET.window && !b.jumped) {
      b.jumped = true;
      emit(r, "jump", b.id);
    } else if (pressed && !b.jumped && !b.rocketUsed) {
      // Inside the window just before "Go": the rocket fires on the gun.
      b.rocketUsed = true;
      b.rocketT = ROCKET.time;
      emit(r, "rocket", b.id);
    }
    b.steer = 0;
    return;
  }
  if (pressed) {
    if (r.t <= ROCKET.window && !b.rocketUsed && !b.jumped) {
      b.rocketUsed = true;
      b.rocketT = ROCKET.time;
      emit(r, "rocket", b.id);
    } else if (b.meter >= BOOST.charge && b.boostT <= 0 && !b.finished) {
      b.meter -= BOOST.charge;
      b.boostT = BOOST.time;
      emit(r, "boost", b.id);
    }
  }
  if (b.jumped && !b.rocketUsed) {
    b.rocketUsed = true;
    b.stallT = ROCKET.stall;
  }
  const steerIn = b.finished ? -b.d * 0.15 - b.th : Math.max(-1, Math.min(1, input.steer));
  b.steer += (steerIn - b.steer) * (1 - Math.exp(-dt / STEER_TAU));
  b.holding = input.hold && !b.finished;
  const k = kappa(c, b.s);
  const target = CRUISE * (b.finished ? 0.7 : speedFactor(r, b));
  const rate = target > b.v ? ACCEL_UP : b.holding ? HOLD.decel : ACCEL_UP;
  b.v += (target - b.v) * Math.min(1, rate * dt);
  const omega = TURN_RATE * Math.max(0.4, Math.min(1, b.v / 8)) * b.steer * (b.holding ? HOLD.turn : 1);
  const sd = (b.v * Math.cos(b.th)) / (1 - b.d * k);
  const prevS = b.s;
  b.s += sd * dt;
  b.d += b.v * Math.sin(b.th) * dt;
  b.th += (omega - k * sd) * dt;
  // Timers.
  b.boostT = Math.max(0, b.boostT - dt);
  b.slingT = Math.max(0, b.slingT - dt);
  b.surgeT = Math.max(0, b.surgeT - dt);
  b.chevT = Math.max(0, b.chevT - dt);
  b.buoyT = Math.max(0, b.buoyT - dt);
  b.scrapeT = Math.max(0, b.scrapeT - dt);
  b.noGainT = Math.max(0, b.noGainT - dt);
  b.rocketT = Math.max(0, b.rocketT - dt);
  b.stallT = Math.max(0, b.stallT - dt);
  b.stroke = (b.stroke + dt * ((30 + 8 * Math.max(0, Math.min(1, (b.v - 8) / 6)) + (b.boostT > 0 ? 4 : 0)) / 60)) % 1;
  // The bank.
  if (Math.abs(b.d) >= HALF_WIDTH) {
    b.d = Math.sign(b.d) * HALF_WIDTH;
    if (b.scrapeT <= 0) {
      b.v *= 0.5;
      emit(r, "scrape", b.id);
    }
    b.th = -0.4 * b.th;
    b.scrapeT = 0.6;
    b.bendVoid = true;
    b.sectorClean = false;
  }
  // Wrong way.
  if (Math.abs(b.th) > WRONG.angle) {
    const before = b.wrongT;
    b.wrongT += dt;
    if (before < WRONG.warn && b.wrongT >= WRONG.warn) emit(r, "wrong", b.id);
    if (b.wrongT >= WRONG.reset) {
      b.d = 0;
      b.th = 0;
      b.v = 4;
      b.wrongT = 0;
      emit(r, "reset", b.id);
    }
  } else b.wrongT = 0;
  // Corner grade: apex buoys half-way round each bend, on the inside.
  const w0 = wrapS(c, prevS),
    w1 = wrapS(c, b.s);
  const crossed = (x: number) => b.s > prevS && (w0 <= w1 ? w0 < x && w1 >= x : w0 < x || w1 >= x);
  for (let i = 0; i < c.bends.length; i++) {
    const bend = c.bends[i];
    if (crossed(bend.s0)) {
      b.bend = i;
      b.bendVoid = b.scrapeT > 0;
      b.bendGraded = false;
    }
    if (crossed(bend.apexS) && b.bend === i && !b.bendGraded) {
      b.bendGraded = true;
      const gap = Math.abs(b.d - bend.apexD);
      if (!b.bendVoid && Math.abs(b.d) <= APEX_D + 0.2) {
        if (gap <= CORNER.perfect) {
          gain(b, CORNER.perfectGain);
          b.surgeT = CORNER.surgeTime;
          b.perfects++;
          emit(r, "perfect", b.id);
        } else if (gap <= CORNER.clean) {
          gain(b, CORNER.cleanGain);
          b.cleans++;
          emit(r, "clean", b.id);
        }
      }
    }
    // The buoy itself.
    if (b.buoyT <= 0) {
      let ds = w1 - bend.apexS;
      if (c.closed && ds > c.length / 2) ds -= c.length;
      if (c.closed && ds < -c.length / 2) ds += c.length;
      if (Math.abs(ds) < 4) {
        for (const o of BUMP.offsets) {
          const cs = ds + Math.cos(b.th) * o,
            cd = b.d + Math.sin(b.th) * o - bend.apexD;
          if (Math.hypot(cs, cd) < BUOY.radius + HULL_HALF) {
            b.buoyT = BUOY.time;
            b.bendVoid = true;
            b.sectorClean = false;
            emit(r, "buoy", b.id);
            break;
          }
        }
      }
    }
  }
  // Fast-water chevrons.
  for (const ch of c.chevrons) {
    if (crossed(ch.s) && Math.abs(b.d - ch.d) < CHEVRON.half) {
      b.chevT = CHEVRON.time;
      emit(r, "chevron", b.id);
    }
  }
  // The bridge piers.
  if (Math.abs(w1 - c.bridge) < PIER.radius + 1.5) {
    for (const side of [-1, 1]) {
      if (Math.abs(b.d - side * PIER.d) < PIER.radius + 0.45 && Math.abs(w1 - c.bridge) < PIER.radius + 0.4 && b.scrapeT <= 0) {
        b.v *= PIER.mult;
        b.th = -b.th * 0.5;
        b.d = side * PIER.d + Math.sign(b.d - side * PIER.d || 1) * (PIER.radius + 0.5);
        b.scrapeT = 0.6;
        b.sectorClean = false;
        emit(r, "pier", b.id);
      }
    }
  }
  // Checkpoints, sectors and laps (progress is s, so none can be skipped).
  const per = r.cps.length;
  while (!b.finished) {
    const lap = Math.floor(b.cp / per),
      idx = b.cp % per;
    const at = lap * c.length + r.cps[idx];
    if (b.s < at) break;
    const tc = r.t - dt + (dt * (at - prevS)) / Math.max(1e-9, b.s - prevS);
    if (b.sectorClean) gain(b, BOOST.sector);
    b.sectorClean = true;
    b.splits.push(tc);
    emit(r, "split", b.id, b.splits.length);
    b.cp++;
    if (idx === 0 && c.closed) {
      b.lapTimes.push(tc - b.lapStart);
      b.lapStart = tc;
      emit(r, "lap", b.id, b.lapTimes.length);
      if (b.lapTimes.length === r.laps - 1) emit(r, "final", b.id);
    }
    if (at >= r.total - 1e-6) {
      b.finished = true;
      b.finishTime = tc;
      if (!c.closed) b.lapTimes.push(tc);
      emit(r, "finish", b.id);
      break;
    }
    if (!c.closed && b.cp >= per) {
      // Point to point: the finish is the end of the course.
      if (b.s >= r.total) {
        b.finished = true;
        b.finishTime = tc;
        b.lapTimes.push(tc);
        emit(r, "finish", b.id);
      }
      break;
    }
  }
  if (!c.closed && !b.finished && b.s >= r.total) {
    b.finished = true;
    b.finishTime = r.t - dt + (dt * (r.total - prevS)) / Math.max(1e-9, b.s - prevS);
    b.lapTimes.push(b.finishTime);
    emit(r, "finish", b.id);
  }
}

/** Wake check for one boat against the others (2–14 u behind, within 2.2). */
function wake(r: Race, b: Boat, dt: number) {
  let inWake = false;
  for (const o of r.boats) {
    if (o === b || o.finished) continue;
    const ds = o.s - b.s;
    if (ds >= SLIP.from && ds <= SLIP.to && Math.abs(o.d - b.d) <= SLIP.across) {
      inWake = true;
      break;
    }
  }
  b.inWake = inWake && r.t > 0 && !b.finished;
  if (b.inWake) {
    if (b.wakeT === 0) emit(r, "wake", b.id);
    b.wakeT += dt;
    if (b.wakeT >= SLIP.arm) b.armed = true;
    gain(b, SLIP.gain * dt);
  } else {
    if (b.armed) {
      b.slingT = SLIP.slingTime;
      emit(r, "sling", b.id);
    }
    b.armed = false;
    b.wakeT = 0;
  }
}

/** Boats are three circles along the hull; overlap is pushed apart equally and
 * the closing speed along the normal is exchanged with restitution 0.3. */
export function bump(r: Race, a: Boat, b: Boat, fresh = true): boolean {
  let best = Infinity,
    ns = 0,
    nd = 0;
  for (const oa of BUMP.offsets)
    for (const ob of BUMP.offsets) {
      const ds = b.s + Math.cos(b.th) * ob - (a.s + Math.cos(a.th) * oa),
        dd = b.d + Math.sin(b.th) * ob - (a.d + Math.sin(a.th) * oa);
      const dist = Math.hypot(ds, dd);
      if (dist < best) {
        best = dist;
        ns = ds;
        nd = dd;
      }
    }
  const min = BUMP.radius * 2;
  if (best >= min) return false;
  const len = best || 1e-6;
  ns /= len;
  nd /= len;
  const push = (min - best) / 2;
  a.s -= ns * push;
  a.d -= nd * push;
  b.s += ns * push;
  b.d += nd * push;
  let avs = a.v * Math.cos(a.th),
    avd = a.v * Math.sin(a.th),
    bvs = b.v * Math.cos(b.th),
    bvd = b.v * Math.sin(b.th);
  const closing = (avs - bvs) * ns + (avd - bvd) * nd;
  if (closing > 0) {
    const j = ((1 + BUMP.restitution) / 2) * closing;
    avs -= j * ns;
    avd -= j * nd;
    bvs += j * ns;
    bvd += j * nd;
  }
  // A new contact costs 6%; leaning on a boat already touching only pushes.
  const loss = fresh ? 1 - BUMP.loss : 1;
  a.v = Math.hypot(avs, avd) * loss;
  b.v = Math.hypot(bvs, bvd) * loss;
  a.th = Math.atan2(avd, avs);
  b.th = Math.atan2(bvd, bvs);
  a.noGainT = b.noGainT = BUMP.noGain;
  a.sectorClean = b.sectorClean = false;
  return true;
}

/** Order by progress (finished boats by time); updates places and passes. */
export function rankBoats(r: Race) {
  const order = r.order;
  order.sort((i, j) => {
    const a = r.boats[i],
      b = r.boats[j];
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.s - a.s;
  });
  for (let n = 0; n < order.length; n++) {
    const b = r.boats[order[n]];
    const place = n + 1;
    if (r.t > 0 && place < b.place) {
      b.passes += b.place - place;
      if (b.slingT > 0 || b.boostT > 0) b.slingPasses++;
      emit(r, "pass", b.id, place);
    } else if (r.t > 0 && place > b.place) emit(r, "passed", b.id, place);
    b.place = place;
  }
}

const bumpCd = new Float32Array(16);
/** One race step: every boat (inputs from `inputs[id]`), wakes, bumps, ranks. */
export function stepRace(r: Race, inputs: readonly RowInput[], dt = TICK) {
  r.events.length = 0;
  if (r.over) return;
  const before = r.t;
  r.t += dt;
  if (before < 0 && r.t >= 0) emit(r, "go", 0);
  for (const b of r.boats) wake(r, b, dt);
  for (const b of r.boats) stepBoat(r, b, inputs[b.id], dt);
  // Pedal boats cross on fixed paths at 3 u/s.
  for (const p of r.pedals) {
    p.d = Math.sin(r.t * (3 / 8) + p.phase) * 8;
    for (const b of r.boats) {
      const ds = wrapS(r.course, b.s) - p.s;
      if (Math.abs(ds) < 4.4 && Math.abs(b.d - p.d) < 1.5 && b.scrapeT <= 0 && b.noGainT <= 0) {
        b.v *= 0.7;
        b.d += Math.sign(b.d - p.d || 1) * 0.6;
        b.scrapeT = 0.3;
        b.noGainT = 1.2;
        b.sectorClean = false;
        b.bumps++;
        emit(r, "bump", b.id);
      }
    }
  }
  for (let i = 0; i < 16; i++) bumpCd[i] = Math.max(0, bumpCd[i] - dt);
  for (let i = 0; i < r.boats.length; i++)
    for (let j = i + 1; j < r.boats.length; j++) {
      const a = r.boats[i],
        b = r.boats[j];
      if (a.finished || b.finished || Math.abs(a.s - b.s) > 9) continue;
      const fresh = bumpCd[i * 4 + j] <= 0;
      if (bump(r, a, b, fresh)) {
        const was = bumpCd[i * 4 + j];
        bumpCd[i * 4 + j] = 0.4;
        if (was > 0) continue;
        a.bumps++;
        b.bumps++;
        emit(r, "bump", a.id, b.id);
      }
    }
  if (r.t > 0) rankBoats(r);
  if (r.boats[0].finished) {
    // Everyone still racing finishes within a few seconds of the last place
    // being decided; the race is over when the player and every rival are in.
    if (r.boats.every((b) => b.finished) || r.t - r.boats[0].finishTime > 30) r.over = true;
  }
}

/** Finishing place of boat 0 once over: rivals still out are behind you. */
export const playerPlace = (r: Race) => r.boats[0].place;

/** The day's seed, on the shared UTC day (`core/daily.ts`). */
export function dailySeed(date = new Date()) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000) % 997;
}

/** Is there a bend within `ahead` u of s? */
export const bendWithin = (r: Race, s: number, ahead: number) => bendAhead(r.course, s, ahead) !== null;
