/**
 * The one audio engine. Owns the single AudioContext (created on the first
 * gesture that is allowed to make sound), the mix graph, the voice cap, mute,
 * levels, ducking, the active reverb space and tab-hidden suspension.
 *
 * It knows nothing about the game store: `live.ts` binds it. That keeps this
 * file testable with a fake context and usable offline.
 */
import { buildMixGraph, MASTER_GAIN, setSpace, sliderGain, BUS_GAIN, dbToGain, type Bus, type MixGraph, type Space } from "./graph";
import { buildLoop, LOOP_SPECS, SPECS, voiceLevel, type LoopHandle, type LoopName, type PaletteName } from "./palette";
import { STEAL_FADE, VoicePool } from "./voices";

export type PlayOptions = {
  /** -1 (left) … 1 (right). */
  pan?: number;
  /** Extra linear gain on top of the palette level. */
  gain?: number;
  /** For cues whose length follows an event (flight). */
  duration?: number;
  intensity?: number;
  off?: boolean;
  /** Seconds from now. */
  delay?: number;
  /** Reverb send override (footsteps indoors / outdoors). */
  send?: number;
};

export const MAX_LOOPS = 4;
const UNMUTE_RAMP = 0.25;
const MUTE_TAU = 0.02;
const HIDE_FADE = 0.2;
const SUSPEND_AFTER_MS = 1000;

export type HostOptions = {
  create?: () => AudioContext;
  /** Random source (tests pass a seeded one). */
  random?: () => number;
  reverb?: boolean;
};

export class AudioHost {
  ctx: AudioContext | null = null;
  graph: MixGraph | null = null;
  readonly pool = new VoicePool();
  private loops = new Set<{ stop: (fade?: number) => void }>();
  private random: () => number;
  /** Gates, all of which must be open for sound. */
  private muted = false;
  private hidden = false;
  /** False on the portfolio pages: no context, no sound. */
  private allowed = false;
  private levels = { music: 80, effects: 100 };
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private spaceTimer: ReturnType<typeof setTimeout> | null = null;
  private duckState = new Map<Bus, number>();
  /** Voices and loops built since start (muted ⇒ stays 0). */
  built = 0;
  /** The latest voice per palette name, so an event can end it early. */
  private latest = new Map<PaletteName, { fade: (seconds: number) => void; end: number }>();

  constructor(private options: HostOptions = {}) {
    this.random = options.random ?? Math.random;
  }

  /** Creates and resumes the context. Call from inside a user gesture. */
  unlock(): AudioContext | null {
    if (!this.allowed) return null;
    try {
      if (!this.ctx) {
        const create =
          this.options.create ??
          (() => new AudioContext({ latencyHint: "interactive" }));
        this.ctx = create();
        this.graph = buildMixGraph(this.ctx, { reverb: this.options.reverb });
        this.graph.master.gain.value = 0;
        this.applyLevels(true);
        this.applyMaster(true);
      }
      if (this.ctx.state !== "running" && !this.hidden) void this.ctx.resume().catch(() => {});
      return this.ctx;
    } catch {
      this.ctx = null;
      this.graph = null;
      return null;
    }
  }

  /** The graph when a new voice may be made, else null (muted, hidden, portfolio, no context). */
  ready(): MixGraph | null {
    if (this.muted || this.hidden || !this.allowed || !this.graph || this.ctx?.state === "closed") return null;
    return this.graph;
  }

  get isMuted() {
    return this.muted;
  }

  setMuted(muted: boolean) {
    if (this.muted === muted) return;
    this.muted = muted;
    if (muted) this.pool.clear(this.ctx?.currentTime ?? 0);
    this.applyMaster();
  }

  setAllowed(allowed: boolean) {
    if (this.allowed === allowed) return;
    this.allowed = allowed;
    this.applyMaster();
    this.scheduleSuspend();
  }

  setHidden(hidden: boolean) {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    this.applyMaster();
    this.scheduleSuspend();
  }

  /** Slider values 0–100. Effects scale ui, sfx and ambience; music its own bus. */
  setLevels(levels: { music: number; effects: number }) {
    this.levels = { ...levels };
    this.applyLevels();
  }

  private open() {
    return !this.muted && !this.hidden && this.allowed;
  }

  private applyMaster(immediate = false) {
    const g = this.graph;
    if (!g) return;
    const p = g.master.gain,
      t = g.ctx.currentTime;
    p.cancelScheduledValues(t);
    p.setValueAtTime(immediate ? 0 : p.value, t);
    if (this.open()) p.linearRampToValueAtTime(MASTER_GAIN, t + UNMUTE_RAMP);
    else if (this.muted) p.setTargetAtTime(0, t, MUTE_TAU);
    else p.linearRampToValueAtTime(0, t + HIDE_FADE);
  }

  private applyLevels(immediate = false) {
    const g = this.graph;
    if (!g) return;
    const t = g.ctx.currentTime;
    for (const bus of ["ui", "sfx", "ambience", "music"] as const) {
      const k = sliderGain(bus === "music" ? this.levels.music : this.levels.effects);
      const v = BUS_GAIN[bus] * k;
      for (const node of [g.bus[bus], g.send[bus]]) {
        if (immediate) node.gain.value = v;
        else node.gain.setTargetAtTime(v, t, 0.03);
      }
    }
  }

  /** Hidden or on the portfolio: fade (above), then suspend after 1 s. */
  private scheduleSuspend() {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
    if (this.hidden || !this.allowed) {
      this.suspendTimer = setTimeout(() => {
        this.suspendTimer = null;
        if ((this.hidden || !this.allowed) && ctx.state === "running") void ctx.suspend().catch(() => {});
      }, SUSPEND_AFTER_MS);
    } else if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  }

  /** Reverb follows interior/exterior with a 300 ms crossfade. */
  setSpace(space: Space) {
    const g = this.graph;
    if (!g || g.reverb.space === space) return;
    const settle = setSpace(g, space, 0.3);
    if (this.spaceTimer) clearTimeout(this.spaceTimer);
    // After the fade plus the idle space's tail, stop convolving it.
    this.spaceTimer = setTimeout(settle, 2000);
  }

  /** Ducks a bus by `db` (negative) over `attack`, holds, then recovers. */
  duck(bus: Bus, db: number, attack = 0.06, hold = 0.3, release = 0.6) {
    const g = this.graph;
    if (!g) return;
    const p = g.duck[bus].gain,
      t = g.ctx.currentTime;
    const base = this.duckState.get(bus) ?? 1;
    const target = base * dbToGain(db);
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(target, t + attack);
    p.setValueAtTime(target, t + attack + hold);
    p.linearRampToValueAtTime(base, t + attack + hold + release);
  }

  /** A held duck (dialogue): `db` until called again with 0. */
  holdDuck(bus: Bus, db: number, tau = 0.12) {
    const g = this.graph;
    const target = dbToGain(db);
    this.duckState.set(bus, target);
    if (!g) return;
    const p = g.duck[bus].gain,
      t = g.ctx.currentTime;
    p.cancelScheduledValues(t);
    p.setTargetAtTime(target, t, tau);
  }

  /** Music tone inside rooms: low-passed and lowered. */
  setMusicTone(cutoff: number) {
    const g = this.graph;
    if (!g) return;
    g.musicTone.frequency.setTargetAtTime(cutoff, g.ctx.currentTime, 0.15);
  }

  /** Plays a palette one-shot. Returns false (and builds nothing) when silent. */
  play(name: PaletteName, opts: PlayOptions = {}): boolean {
    const g = this.ready();
    if (!g) return false;
    try {
      return this.voice(g, name, opts);
    } catch {
      return false;
    }
  }

  private voice(g: MixGraph, name: PaletteName, opts: PlayOptions) {
    const ctx = g.ctx,
      spec = SPECS[name];
    const built = buildVoice(ctx, { bus: g.bus[spec.bus], send: g.send[spec.bus] }, name, opts, this.random);
    if (!built) return false;
    const { v, panner, send, result, level, t } = built;
    this.built++;
    const sources = result.sources;
    let ended = 0;
    const release = () => {
      v.disconnect();
      panner?.disconnect();
      send?.disconnect();
    };
    for (const s of sources)
      s.addEventListener?.("ended", () => {
        if (++ended === sources.length) {
          release();
          this.pool.release(record.id);
        }
      });
    const record = this.pool.admit(ctx.currentTime, {
      start: t,
      end: result.end + 0.05,
      level,
      kill: (at) => {
        v.gain.cancelScheduledValues(at);
        v.gain.setValueAtTime(v.gain.value, at);
        v.gain.linearRampToValueAtTime(0, at + STEAL_FADE);
        for (const s of sources)
          try {
            s.stop(at + STEAL_FADE + 0.005);
          } catch {
            /* Already stopped. */
          }
      },
    });
    if ("ducks" in spec && spec.ducks) this.duck("music", -6, 0.06, Math.max(0, result.end - t - 0.06), 0.6);
    this.latest.set(name, {
      end: result.end,
      fade: (seconds) => {
        const at = ctx.currentTime;
        v.gain.cancelScheduledValues(at);
        v.gain.setValueAtTime(v.gain.value, at);
        v.gain.linearRampToValueAtTime(0, at + seconds);
        for (const s of sources)
          try {
            s.stop(at + seconds + 0.02);
          } catch {
            /* Already stopped. */
          }
      },
    });
    return true;
  }

  /** Fades out the latest voice of `name` if it is still sounding (a flight
   * that ends sooner than its default length). */
  fade(name: PaletteName, seconds = 0.4) {
    const voice = this.latest.get(name);
    if (!voice || !this.ctx || voice.end <= this.ctx.currentTime) return false;
    this.latest.delete(name);
    voice.fade(seconds);
    return true;
  }

  /** Starts a loop (sizzle, wheels, fountain, crowd). Null when silent or at the loop cap. */
  loop(name: LoopName, gain = 1): LoopHandle | null {
    const g = this.ready();
    if (!g || this.loops.size >= MAX_LOOPS) return null;
    try {
      const ctx = g.ctx,
        spec = LOOP_SPECS[name];
      const out = ctx.createGain();
      out.gain.setValueAtTime(0, ctx.currentTime);
      out.gain.linearRampToValueAtTime(spec.level * gain, ctx.currentTime + 0.08);
      out.connect(g.bus[spec.bus]);
      let send: GainNode | null = null;
      if (spec.send > 0) {
        send = ctx.createGain();
        send.gain.value = spec.send;
        out.connect(send);
        send.connect(g.send[spec.bus]);
      }
      const { sources, set } = buildLoop(ctx, out, name);
      this.built++;
      let stopped = false;
      const entry = {
        stop: (fade = 0.12) => {
          if (stopped) return;
          stopped = true;
          this.loops.delete(entry);
          const t = ctx.currentTime;
          out.gain.cancelScheduledValues(t);
          out.gain.setValueAtTime(out.gain.value, t);
          out.gain.linearRampToValueAtTime(0, t + fade);
          for (const s of sources)
            try {
              s.stop(t + fade + 0.02);
            } catch {
              /* Already stopped. */
            }
          setTimeout(() => {
            out.disconnect();
            send?.disconnect();
          }, (fade + 0.1) * 1000);
        },
      };
      this.loops.add(entry);
      return { set: (d) => !stopped && set(d), stop: entry.stop };
    } catch {
      return null;
    }
  }

  /** Stops every loop (mute, scene change). */
  stopLoops() {
    for (const l of [...this.loops]) l.stop(0.05);
  }

  /** Routes an external node (ambience beds, G1's fountain, music) into a bus. */
  connect(bus: Bus, node: AudioNode): () => void {
    const g = this.graph;
    if (!g) return () => {};
    node.connect(g.bus[bus]);
    return () => {
      try {
        node.disconnect(g.bus[bus]);
      } catch {
        /* Already disconnected. */
      }
    };
  }
}

/**
 * One palette voice into a bus (and its reverb send): the voice gain, an
 * optional stereo pan and the recipe's layers. Shared by the live engine and
 * offline renders. Returns null for a zero level.
 */
export function buildVoice(
  ctx: BaseAudioContext,
  to: { bus: AudioNode; send?: AudioNode },
  name: PaletteName,
  opts: PlayOptions,
  rnd: () => number,
) {
  const spec = SPECS[name];
  const t = ctx.currentTime + 0.004 + Math.max(0, opts.delay ?? 0);
  const pitch = 1 + (rnd() * 2 - 1) * spec.vary.pitch;
  const jitter = 1 + (rnd() * 2 - 1) * spec.vary.level;
  const level = voiceLevel(name, jitter, opts.gain ?? 1);
  if (!(level > 0)) return null;
  const v = ctx.createGain();
  v.gain.value = level;
  let head: AudioNode = v;
  let panner: StereoPannerNode | null = null;
  if (opts.pan && typeof ctx.createStereoPanner === "function") {
    panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
    v.connect(panner);
    head = panner;
  }
  head.connect(to.bus);
  const sendLevel = opts.send ?? spec.send;
  let send: GainNode | null = null;
  if (sendLevel > 0 && to.send) {
    send = ctx.createGain();
    send.gain.value = sendLevel;
    head.connect(send);
    send.connect(to.send);
  }
  const result = spec.build(ctx, v, t, {
    pitch,
    rnd,
    duration: opts.duration,
    intensity: opts.intensity,
    off: opts.off,
  });
  return { v, panner, send, result, level, t };
}
