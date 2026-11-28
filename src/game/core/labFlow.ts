/**
 * Beat Lab "Open Mic" flow rules (PLAN_GAMES §2.5). Pure: grades taps on the
 * flow pad against the beat's grid, keeps the room's Hype, and sums a take
 * up for the flow sheet. Nothing is recorded or stored here.
 *
 * Times are seconds since the take started (the count-in included), already
 * corrected for the browser's output latency by the caller.
 *
 * Tuning notes (the bots in tests/labFlow.test.ts are the judge):
 * - Taps are graded on the **eighth-note** grid, swing included. A
 *   sixteenth grid at 90 BPM is 167 ms wide, so ±45 ms would call half of
 *   all random taps "pocket"; eighths keep the grade meaning something.
 * - Hype also settles back by HYPE_SETTLE of itself every bar, so steady
 *   good flow climbs and holds, and loose flow finds a lower level instead
 *   of creeping to the top.
 */

export const POCKET_MS = 45;
export const CLOSE_MS = 90;
export const RHYME_MS = 90;
export const HYPE_START = 20;
export const HYPE = { pocket: 4, close: 1, loose: -2, adlib: 1, rhyme: 8, emptyBar: -6 } as const;
/** Share of Hype the room gives back at the end of every bar. */
export const HYPE_SETTLE = 0.35;
/** Taps that set the automatic latency offset, its window and clamp. */
export const CALIBRATION_TAPS = 8;
export const CALIBRATION_WINDOW_S = 0.2;
export const OFFSET_CLAMP_S = 0.15;
/** The offset is re-estimated from the last this many calibration taps. */
export const RECALIBRATE_EVERY = 16;

export type Grade = "pocket" | "close" | "loose";
export const gradeOffset = (ms: number): Grade =>
  Math.abs(ms) <= POCKET_MS ? "pocket" : Math.abs(ms) <= CLOSE_MS ? "close" : "loose";

/** One take's timing: the beat length, swing (fraction of a sixteenth that
 * odd sixteenths sit late), the count-in and the number of bars. */
export type FlowGrid = { beatS: number; swing: number; countIn: number; bars: number };

/** Signed offset (s) of time `t` from the nearest eighth note. */
export function eighthOffset(t: number, grid: FlowGrid): number {
  const eighth = grid.beatS / 2;
  const rel = t - grid.countIn;
  const n = Math.round(rel / eighth);
  return rel - n * eighth;
}
/** Signed offset (s) of `t` from the nearest beat (quarter note). */
export function beatOffset(t: number, grid: FlowGrid): number {
  const rel = t - grid.countIn;
  return rel - Math.round(rel / grid.beatS) * grid.beatS;
}
export const barOf = (t: number, grid: FlowGrid) => Math.floor((t - grid.countIn) / (grid.beatS * 4));

export type Flow = {
  hype: number;
  /** Automatic latency offset (s), subtracted from every tap. */
  offset: number;
  /** Raw beat offsets of calibration taps (s). */
  calib: number[];
  taps: number;
  pocket: number;
  close: number;
  loose: number;
  run: number;
  bestRun: number;
  /** Graded offsets (ms), for the style line. */
  offsets: number[];
  landed: boolean[];
  barTaps: number[];
  /** Hype each bar reached (at its end, before the room settles). */
  barHype: number[];
  /** Last bar closed with `flowBar`. */
  closed: number;
};

export function newFlow(bars = 16): Flow {
  return {
    hype: HYPE_START,
    offset: 0,
    calib: [],
    taps: 0,
    pocket: 0,
    close: 0,
    loose: 0,
    run: 0,
    bestRun: 0,
    offsets: [],
    landed: new Array(bars).fill(false),
    barTaps: new Array(bars).fill(0),
    barHype: [],
    closed: -1,
  };
}
const clampHype = (h: number) => Math.max(0, Math.min(100, h));
function median(xs: readonly number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Feeds the latency estimator with one raw tap time. */
function calibrate(f: Flow, t: number, grid: FlowGrid) {
  const raw = beatOffset(t, grid);
  if (Math.abs(raw) > CALIBRATION_WINDOW_S) return;
  f.calib.push(raw);
  const n = f.calib.length;
  if (n === CALIBRATION_TAPS || (n > CALIBRATION_TAPS && (n - CALIBRATION_TAPS) % RECALIBRATE_EVERY === 0)) {
    const recent = f.calib.slice(-RECALIBRATE_EVERY);
    f.offset = Math.max(-OFFSET_CLAMP_S, Math.min(OFFSET_CLAMP_S, median(recent)));
  }
}

export type TapResult = { grade: Grade; offsetMs: number; bar: number; landed: boolean } | null;
/**
 * A tap on the flow pad at take time `t`. Count-in and after-the-end taps
 * only calibrate. Returns the grade, or null when it was not graded.
 */
export function flowTap(f: Flow, t: number, grid: FlowGrid): TapResult {
  if (t >= grid.countIn - grid.beatS) calibrate(f, t, grid);
  const at = t - f.offset;
  const bar = barOf(at, grid);
  if (bar < 0 || bar >= grid.bars) return null;
  const offsetMs = eighthOffset(at, grid) * 1000;
  const grade = gradeOffset(offsetMs);
  f.taps++;
  f.barTaps[bar]++;
  f[grade]++;
  f.offsets.push(offsetMs);
  f.run = grade === "pocket" ? f.run + 1 : 0;
  f.bestRun = Math.max(f.bestRun, f.run);
  f.hype = clampHype(f.hype + HYPE[grade]);
  // The bar's rhyme word sits on its last beat.
  const lastBeat = grid.countIn + bar * grid.beatS * 4 + grid.beatS * 3;
  let landed = false;
  if (!f.landed[bar] && Math.abs(at - lastBeat) * 1000 <= RHYME_MS) {
    f.landed[bar] = landed = true;
    f.hype = clampHype(f.hype + HYPE.rhyme);
  }
  return { grade, offsetMs, bar, landed };
}

/** An ad-lib pad on the grid nudges Hype up. Returns true when on the grid. */
export function flowAdlib(f: Flow, t: number, grid: FlowGrid): boolean {
  const at = t - f.offset;
  if (barOf(at, grid) < 0) return false;
  const on = Math.abs(eighthOffset(at, grid)) * 1000 <= CLOSE_MS;
  if (on) f.hype = clampHype(f.hype + HYPE.adlib);
  return on;
}

/** Closes every bar that ended before take time `t`: an empty bar drains,
 * and the room settles a little every bar. */
export function flowCloseBars(f: Flow, t: number, grid: FlowGrid) {
  const last = Math.min(grid.bars - 1, barOf(t - f.offset, grid) - 1);
  while (f.closed < last) {
    const bar = ++f.closed;
    if (bar < 0) continue;
    if (!f.barTaps[bar]) f.hype = clampHype(f.hype + HYPE.emptyBar);
    f.barHype.push(f.hype);
    f.hype = clampHype(f.hype * (1 - HYPE_SETTLE));
  }
}

/** Room level for the scene: 0 calm, 1 warm (≥ 40), 2 loud (≥ 70), 3 roof's off (≥ 90). */
export const hypeLevel = (hype: number) => (hype >= 90 ? 3 : hype >= 70 ? 2 : hype >= 40 ? 1 : 0);

export type FlowSheet = {
  taps: number;
  pocketPct: number;
  bestRun: number;
  landed: number;
  bars: number;
  tapsPerBar: number;
  style: string;
  verdict: "Calm room" | "Warm room" | "Loud room" | "Roof's off";
};
/** The flow sheet's facts: describes, does not judge. */
export function flowSheet(f: Flow): FlowSheet {
  const bars = f.landed.length;
  const tapsPerBar = f.taps / bars;
  const m = median(f.offsets);
  let style = f.taps < 4 ? "Listening" : Math.abs(m) <= 15 ? "In the pocket" : m > 15 ? "Laid back" : "On top";
  if (tapsPerBar >= 10) style += ", double-time";
  else if (f.taps >= 4 && tapsPerBar <= 3) style += ", sparse";
  const share = (level: number) => (f.barHype.length ? f.barHype.filter((h) => h >= level).length / f.barHype.length : 0);
  const verdict = share(90) >= 0.25 ? "Roof's off" : share(70) >= 0.25 ? "Loud room" : share(40) >= 0.25 ? "Warm room" : "Calm room";
  return {
    taps: f.taps,
    pocketPct: f.taps ? Math.round((f.pocket / f.taps) * 100) : 0,
    bestRun: f.bestRun,
    landed: f.landed.filter(Boolean).length,
    bars,
    tapsPerBar: Math.round(tapsPerBar * 10) / 10,
    style,
    verdict,
  };
}

/* ------------------------------------------------------- prompts */
export type RhymeScheme = "AABB" | "ABAB" | "AAAA";
export const RHYME_SCHEMES: readonly RhymeScheme[] = ["AABB", "ABAB", "AAAA"];
/** Which of a take's families bar `bar` draws from (0 = A, 1 = B, …). In
 * AABB each couplet has its own family; ABAB alternates two per four bars;
 * AAAA keeps one family for four bars. */
export function schemeFamilySlot(scheme: RhymeScheme, bar: number): number {
  const group = Math.floor(bar / 4);
  if (scheme === "AABB") return Math.floor(bar / 2);
  if (scheme === "ABAB") return group * 2 + (bar % 2);
  return group;
}
/** Village-flavour topic cards. They say nothing about Josh. */
export const LAB_TOPICS: readonly string[] = [
  "late-night ramen",
  "missed the train",
  "rain on the quad",
  "first day of spring",
  "the last bus home",
  "a cat on the windowsill",
  "coffee gone cold",
  "summer on the river",
  "the corner store",
  "a lost umbrella",
  "the morning commute",
  "fireflies at dusk",
  "a borrowed bike",
  "the long weekend",
  "a power cut",
  "street food at midnight",
  "the library at closing",
  "sneakers in the snow",
  "a phone at one percent",
  "the group chat",
  "an old mixtape",
  "the rooftop view",
  "a broken alarm",
  "the city at sunrise",
  "a game-winning shot",
  "a crowded subway",
  "the first snow",
  "kites on the hill",
  "a slow Sunday",
  "the night market",
  "a paper plane",
  "the big exam",
  "the neighbour's dog",
  "a road trip playlist",
  "a skate park at dusk",
  "the ice cream truck",
  "a thunderstorm",
  "lights on the bridge",
  "the long way home",
  "a fresh notebook",
];
