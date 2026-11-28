/**
 * The match runtime (§1.8): a fixed 20 Hz step with an accumulator,
 * interpolation buffers, the human's queued input, and the event fan-out to
 * the view, HUD, sound and juice sinks. No React state; zero allocation in
 * the frame path.
 */
import { createMatch, step } from "../../core/bannerRush";
import { GLOW_UNIT, MAX_ENTS, MAX_PROJ, PH_OVER } from "../../core/bannerRush/constants";
import { checkDeploy, deployOut, R_OK, reasonName } from "../../core/bannerRush/field";
import type { DeployInput, MatchConfig, MatchState } from "../../core/bannerRush/types";
import { BOTS, botMemory, type BotMemory, type BotName } from "../../core/bannerRush/bots";
import { quantise } from "../../core/bannerRush/replay";

export const TICK_S = 0.05;

export type EventSink = (rt: RushRuntime, type: number, a: number, b: number, c: number, d: number, x: number, y: number) => void;

export class RushRuntime {
  state: MatchState;
  readonly config: MatchConfig;
  /** Accumulator (seconds) and the sim speed multiplier (dips, relaxed mode, QA). */
  acc = 0;
  speed = 1;
  relaxed = false;
  /** Sim frozen (pause, curtain, overtime freeze) when > now or `held`. */
  held = true;
  freezeUntil = 0;
  /** Speed dip after a tower falls: until `dipUntil` (ms) the speed is `dip`. */
  dip = 1;
  dipUntil = 0;
  maxTicksPerFrame = 4;
  /** Real-time clock for effects (ms), advanced only while visible. */
  now = 0;
  alpha = 0;
  readonly prevX = new Float64Array(MAX_ENTS);
  readonly prevY = new Float64Array(MAX_ENTS);
  readonly prevGen = new Uint16Array(MAX_ENTS);
  readonly pPrevX = new Float64Array(MAX_PROJ);
  readonly pPrevY = new Float64Array(MAX_PROJ);
  readonly pPrevGen = new Uint16Array(MAX_PROJ);
  /** The human's input for the next tick. */
  private pending: DeployInput = { side: 0, slot: 0, x: 0.5, y: 0.5 };
  private hasPending = false;
  private batch: DeployInput[] = [];
  readonly sinks: EventSink[] = [];
  /** A one-shot outside input for side 1 (the tutorial's silent opponent). */
  enemyInput: DeployInput | null = null;
  /** QA autoplay of side 0 through the input path. */
  autoBot: BotName | null = null;
  private botMem: BotMemory;
  /** Perf samples (ms) for QA. */
  readonly simMs = new Float32Array(600);
  readonly viewMs = new Float32Array(600);
  simN = 0;
  viewN = 0;
  ticks = 0;
  frames = 0;

  constructor(config: MatchConfig) {
    this.config = config;
    this.state = createMatch(config);
    this.botMem = botMemory(config.seed);
    this.snap();
  }

  /** Copy current positions into the previous buffers (no interpolation). */
  snap() {
    const s = this.state;
    this.prevX.set(s.x);
    this.prevY.set(s.y);
    this.prevGen.set(s.gen);
    this.pPrevX.set(s.pX);
    this.pPrevY.set(s.pY);
    this.pPrevGen.set(s.pGen);
  }

  /** Validate a human deploy now (for the ghost and immediate feedback). */
  check(slot: number, x: number, y: number) {
    return checkDeploy(this.state, 0, slot, x, y);
  }

  /** Queue the human's deploy for the next tick; returns the reason code now. */
  deploy(slot: number, x: number, y: number): number {
    const r = checkDeploy(this.state, 0, slot, x, y);
    if (r !== R_OK) return r;
    if (this.hasPending) return 7;
    this.pending.side = 0;
    this.pending.slot = slot;
    this.pending.x = quantise(deployOut.x);
    this.pending.y = quantise(deployOut.y);
    this.hasPending = true;
    return R_OK;
  }
  get queued() {
    return this.hasPending;
  }

  // @hot
  private tick() {
    const s = this.state;
    const t0 = performance.now();
    this.prevX.set(s.x);
    this.prevY.set(s.y);
    this.prevGen.set(s.gen);
    this.pPrevX.set(s.pX);
    this.pPrevY.set(s.pY);
    this.pPrevGen.set(s.pGen);
    this.batch.length = 0;
    if (this.autoBot && !this.hasPending) {
      const input = BOTS[this.autoBot](s, 0, this.botMem);
      if (input) this.deploy(input.slot, input.x, input.y);
    }
    if (this.hasPending) {
      this.batch.push(this.pending);
      this.hasPending = false;
    }
    if (this.enemyInput) {
      this.batch.push(this.enemyInput);
      this.enemyInput = null;
    }
    step(s, this.batch);
    this.simMs[this.simN++ % this.simMs.length] = performance.now() - t0;
    this.ticks++;
    for (let e = 0; e < s.eventCount; e++)
      for (let k = 0; k < this.sinks.length; k++)
        this.sinks[k](this, s.evType[e], s.evA[e], s.evB[e], s.evC[e], s.evD[e], s.evX[e], s.evY[e]);
  }

  // @hot
  /** Advance by a frame of `dt` seconds. */
  advance(dt: number) {
    const ms = Math.min(dt, 0.1) * 1000;
    this.now += ms;
    if (this.held || this.now < this.freezeUntil || this.state.phase === PH_OVER) {
      this.alpha = 1;
      return;
    }
    const speed = (this.now < this.dipUntil ? this.dip : 1) * this.speed * (this.relaxed ? 0.75 : 1);
    this.acc += Math.min(dt, 0.1) * speed;
    let n = 0;
    while (this.acc >= TICK_S && n < this.maxTicksPerFrame) {
      this.acc -= TICK_S;
      this.tick();
      n++;
      if (this.state.phase === PH_OVER) break;
    }
    if (n === this.maxTicksPerFrame && this.acc > TICK_S) this.acc = TICK_S * 0.999;
    this.alpha = Math.min(1, this.acc / TICK_S);
  }

  glowExact(side = 0) {
    return this.state.glow[side] / GLOW_UNIT;
  }

  reasonName(code: number) {
    return reasonName(code);
  }

  perf() {
    const stat = (a: Float32Array, n: number) => {
      const m = Math.min(n, a.length);
      if (!m) return { mean: 0, p95: 0, max: 0 };
      const v = Array.from(a.subarray(0, m)).sort((x, y) => x - y);
      return { mean: +(v.reduce((x, y) => x + y, 0) / m).toFixed(3), p95: +v[Math.floor(m * 0.95)].toFixed(3), max: +v[m - 1].toFixed(3) };
    };
    return { simMs: stat(this.simMs, this.simN), viewMs: stat(this.viewMs, this.viewN), ticks: this.ticks, frames: this.frames };
  }
  resetPerf() {
    this.simN = this.viewN = this.ticks = this.frames = 0;
  }
}
