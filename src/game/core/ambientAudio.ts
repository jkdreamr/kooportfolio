import { ambientMix, planePose } from "./wildlife";

export type AmbientEnvironment = {
  muted: boolean;
  paused: boolean;
  active: boolean;
  hidden: boolean;
  scene: string;
  hour: number;
  x: number;
  z: number;
  seconds: number;
};
const FILES = {
  birds: "/audio/birds.mp3",
  crickets: "/audio/crickets.mp3",
  water: "/audio/water.mp3",
  rain: "/audio/rain.mp3",
} as const;
type Layer = keyof typeof FILES;

/** Owns every source so mute, navigation and async loads cannot leave orphan audio. */
export class AmbientAudio {
  private context?: AudioContext;
  private buffers = new Map<Layer, AudioBuffer>();
  private gains = new Map<Layer, GainNode>();
  private sources: AudioScheduledSourceNode[] = [];
  private nodes: AudioNode[] = [];
  private engineGain?: GainNode;
  private engine?: OscillatorNode;
  private windGain?: GainNode;
  private request?: AbortController;
  private generation = 0;
  private starting = false;
  private disposed = false;

  constructor(private environment: () => AmbientEnvironment) {}

  /** Must be called synchronously from a pointer/keyboard gesture, never on mount. */
  unlock() {
    if (this.disposed) return;
    try {
      this.context ??= new AudioContext();
      void this.context
        .resume()
        .then(() => this.sync())
        .catch(() => {});
    } catch {
      /* No WebAudio is a supported silent fallback. */
    }
  }

  private enabled() {
    const e = this.environment();
    return (
      !e.muted &&
      !e.paused &&
      e.active &&
      !e.hidden &&
      (e.scene === "hub" || e.scene === "rowing" || e.scene === "basketball")
    );
  }

  sync() {
    if (this.disposed) return;
    if (!this.enabled()) {
      this.stop();
      return;
    }
    const context = this.context;
    if (!context || context.state !== "running") return;
    if (!this.sources.length && !this.starting) void this.start(context);
    const e = this.environment(),
      mix = ambientMix(e.hour, e.x, e.z, e.scene);
    for (const [layer, gain] of this.gains)
      gain.gain.setTargetAtTime(mix[layer], context.currentTime, 0.5);
    const plane = planePose(e.seconds);
    this.engineGain?.gain.setTargetAtTime(
      e.scene === "hub" ? plane.volume * 0.009 : 0,
      context.currentTime,
      0.35,
    );
    this.engine?.frequency.setTargetAtTime(
      plane.x < 0 ? 82 : 71,
      context.currentTime,
      0.5,
    );
    this.windGain?.gain.setTargetAtTime(mix.wind, context.currentTime, 0.8);
  }

  private async start(context: AudioContext) {
    this.starting = true;
    const generation = ++this.generation;
    const request = new AbortController();
    this.request = request;
    await Promise.all(
      (Object.keys(FILES) as Layer[]).map(async (layer) => {
        if (this.buffers.has(layer)) return;
        try {
          const response = await fetch(FILES[layer], {
            signal: request.signal,
          });
          if (!response.ok) return;
          const buffer = await context.decodeAudioData(
            await response.arrayBuffer(),
          );
          if (!this.disposed) this.buffers.set(layer, buffer);
        } catch {
          /* Missing/blocked media never interrupts the world. */
        }
      }),
    );
    if (this.disposed || generation !== this.generation || !this.enabled())
      return;
    this.starting = false;
    this.request = undefined;
    for (const [layer, buffer] of this.buffers) {
      const source = context.createBufferSource(),
        gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(context.destination);
      source.start();
      this.gains.set(layer, gain);
      this.sources.push(source);
      this.nodes.push(gain);
    }
    // Original, very quiet propeller synthesis; the nature layers are field recordings.
    const engine = context.createOscillator(),
      filter = context.createBiquadFilter(),
      gain = context.createGain();
    engine.type = "sawtooth";
    engine.frequency.value = 76;
    filter.type = "lowpass";
    filter.frequency.value = 340;
    gain.gain.value = 0;
    engine.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    engine.start();
    this.engine = engine;
    this.engineGain = gain;
    this.sources.push(engine);
    this.nodes.push(filter, gain);
    // Seeded filtered air noise under the snow/mist, not a downloaded wind sample.
    const wind = context.createBufferSource(),
      windFilter = context.createBiquadFilter(),
      windGain = context.createGain();
    const windBuffer = context.createBuffer(1, 44100, 22050),
      samples = windBuffer.getChannelData(0);
    let seed = 731;
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      samples[i] = seed / 2147483648;
    }
    wind.buffer = windBuffer;
    wind.loop = true;
    windFilter.type = "lowpass";
    windFilter.frequency.value = 420;
    windGain.gain.value = 0;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(context.destination);
    wind.start();
    this.windGain = windGain;
    this.sources.push(wind);
    this.nodes.push(windFilter, windGain);
    this.sync();
  }

  stop() {
    // Invalidate even a decode that was already in flight when fetch was aborted.
    if (this.starting || this.sources.length) this.generation++;
    this.request?.abort();
    this.request = undefined;
    this.starting = false;
    for (const source of this.sources) {
      source.stop();
      source.disconnect();
    }
    for (const node of this.nodes) node.disconnect();
    this.sources = [];
    this.nodes = [];
    this.gains.clear();
    this.engine = undefined;
    this.engineGain = undefined;
    this.windGain = undefined;
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.buffers.clear();
    void this.context?.close().catch(() => {});
    this.context = undefined;
  }
}
