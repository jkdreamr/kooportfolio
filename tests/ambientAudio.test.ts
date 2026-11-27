import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AmbientAudio,
  bedMix,
  emittersFor,
  INTERIOR_CUTOFF,
  type AmbientEnvironment,
} from "../src/game/core/ambientAudio";
import { surfaceAt } from "../src/game/core/sound";

// 4 bed loops + engine + wind (noise + gust LFO) + far city, then one voice
// per emitter once in the hub.
const BASE = 8;
const HOME_VOICES = emittersFor("home").length;

const param = () => ({ value: 0, setTargetAtTime: vi.fn() });
function node() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    gain: param(),
    frequency: param(),
    Q: param(),
    playbackRate: param(),
    positionX: param(),
    positionY: param(),
    positionZ: param(),
    onended: null as null | (() => void),
    loop: false,
    buffer: null,
    type: "",
  };
}
let sources: ReturnType<typeof node>[],
  filters: ReturnType<typeof node>[],
  contexts: FakeContext[];
class FakeContext {
  state = "running";
  currentTime = 1;
  destination = {};
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  decodeAudioData = vi.fn(async () => ({}));
  createBufferSource = () => {
    const source = node();
    sources.push(source);
    return source;
  };
  createOscillator = this.createBufferSource;
  createGain = node;
  createBiquadFilter = () => {
    const filter = node();
    filters.push(filter);
    return filter;
  };
  createPanner = node;
  listener = {
    positionX: param(),
    positionY: param(),
    positionZ: param(),
    forwardX: param(),
    forwardY: param(),
    forwardZ: param(),
    upX: param(),
    upY: param(),
    upZ: param(),
  };
  createBuffer = (_channels: number, length: number) => ({
    getChannelData: () => new Float32Array(length),
  });
  constructor() {
    contexts.push(this);
  }
}
let environment: AmbientEnvironment, audio: AmbientAudio;
beforeEach(() => {
  sources = [];
  filters = [];
  contexts = [];
  environment = {
    muted: true,
    paused: false,
    active: true,
    hidden: false,
    scene: "hub",
    hour: 12,
    x: 0,
    z: 5,
    seconds: 0,
  };
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array([0, 1, 2]))),
  );
  // The engine's role, reduced: hand out one context, accept the bus output.
  const host = {
    unlock: () => {
      try {
        return new (globalThis as unknown as { AudioContext: new () => AudioContext }).AudioContext();
      } catch {
        return null;
      }
    },
    connect: () => () => {},
  };
  audio = new AmbientAudio(() => environment, host);
});
afterEach(() => {
  audio.dispose();
  vi.unstubAllGlobals();
});

describe("ambient audio lifecycle", () => {
  it("requires a gesture and unmute before loading or playing any media", async () => {
    environment.muted = false;
    audio.sync();
    expect(contexts).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    environment.muted = true;
    audio.unlock();
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    environment.muted = false;
    audio.sync();
    await vi.waitFor(() =>
      expect(sources).toHaveLength(BASE + HOME_VOICES),
    );
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(sources.every((s) => s.start.mock.calls.length === 1)).toBe(true);
  });

  it.each(["muted", "paused", "hidden", "inactive", "theater"])(
    "stops all sources for %s and reuses decoded audio on return",
    async (reason) => {
      environment.muted = false;
      audio.unlock();
      await vi.waitFor(() =>
        expect(sources).toHaveLength(BASE + HOME_VOICES),
      );
      if (reason === "inactive") environment.active = false;
      else if (reason === "theater") environment.scene = "theater";
      else environment[reason as "muted" | "paused" | "hidden"] = true;
      audio.sync();
      expect(
        sources.every(
          (s) =>
            s.stop.mock.calls.length === 1 &&
            s.disconnect.mock.calls.length === 1,
        ),
      ).toBe(true);
      Object.assign(environment, {
        muted: false,
        paused: false,
        hidden: false,
        active: true,
        scene: "hub",
      });
      audio.sync();
      await vi.waitFor(() =>
        expect(sources).toHaveLength(2 * (BASE + HOME_VOICES)),
      );
      expect(fetch).toHaveBeenCalledTimes(4);
      audio.dispose();
      // The context is the engine's shared one: ambience never closes it.
      expect(contexts[0].close).toHaveBeenCalledTimes(0);
      audio.unlock();
      expect(contexts).toHaveLength(1);
    },
  );

  it("cannot start a late network/decode completion after mute or unmount", async () => {
    const responses: ((response: Response) => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => responses.push(resolve))),
    );
    environment.muted = false;
    audio.unlock();
    await vi.waitFor(() => expect(responses).toHaveLength(4));
    environment.muted = true;
    audio.sync();
    audio.dispose();
    for (const resolve of responses) resolve(new Response(new Uint8Array([0])));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sources).toHaveLength(0);
  });

  it("fails silently if the browser has no AudioContext or media cannot load", async () => {
    environment.muted = false;
    vi.stubGlobal("AudioContext", undefined);
    expect(() => audio.unlock()).not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    vi.stubGlobal("AudioContext", FakeContext);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    audio.unlock();
    // Engine drone, wind (noise + gust LFO), the far city and the stadium
    // crowd emitter: all synthesised, so they play with no media at all.
    await vi.waitFor(() => expect(sources).toHaveLength(5));
    expect(sources[0].type).toBe("sawtooth");
  });

  it("muffles the outdoor bed behind walls instead of cutting it", async () => {
    environment.muted = false;
    audio.unlock();
    await vi.waitFor(() =>
      expect(sources).toHaveLength(BASE + HOME_VOICES),
    );
    environment.scene = "kappa";
    audio.sync();
    expect(sources.every((s) => s.stop.mock.calls.length === 0)).toBe(true);
    const cutoffs = filters.flatMap((f) =>
      f.frequency.setTargetAtTime.mock.calls.map((call) => call[0]),
    );
    expect(cutoffs).toContain(INTERIOR_CUTOFF);
    const inside = bedMix({ ...environment, scene: "kappa" });
    expect(inside.water).toBe(0);
    expect(inside.birds).toBeGreaterThan(0);
    expect(inside.birds).toBeLessThan(
      bedMix({ ...environment, scene: "basketball" }).birds,
    );
  });

  it("crossfades to the new island's emitters after travel", async () => {
    environment.muted = false;
    audio.unlock();
    await vi.waitFor(() =>
      expect(sources).toHaveLength(BASE + HOME_VOICES),
    );
    const homeVoices = sources.slice(BASE);
    environment.world = "korea";
    audio.sync();
    expect(sources).toHaveLength(
      BASE + HOME_VOICES + emittersFor("korea").length,
    );
    // Old voices are scheduled to stop after their fade, not cut.
    for (const voice of homeVoices)
      expect(voice.stop.mock.calls[0][0]).toBeGreaterThan(1);
  });
});

describe("spatial layout", () => {
  it.each(["home", "korea", "stanford"] as const)(
    "places falls, groves and crickets on %s",
    (world) => {
      const list = emittersFor(world);
      expect(list.some((e) => e.id.startsWith("falls"))).toBe(true);
      expect(list.filter((e) => e.layer === "birds")).toHaveLength(3);
      expect(list.filter((e) => e.layer === "crickets")).toHaveLength(2);
      expect(list.some((e) => e.id === "pond")).toBe(world !== "home");
      for (const e of list) expect(e.position.every(Number.isFinite)).toBe(true);
      expect(new Set(list.map((e) => e.id)).size).toBe(list.length);
    },
  );

  it("voices footsteps by what the avatar stands on", () => {
    expect(surfaceAt("hub", "home", 999, 999)).toBe("grass");
    expect(surfaceAt("hub", "stanford", 999, 999)).toBe("gravel");
    expect(surfaceAt("kappa", "home", 0, 0)).toBe("wood");
    expect(surfaceAt("kitchen", "home", 0, 0)).toBe("stone");
    expect(surfaceAt("theater", "home", 0, 0)).toBe("soft");
  });
});
