import { describe, expect, it, vi } from "vitest";
import { AudioHost } from "../src/game/core/audio/engine";
import { VoicePool } from "../src/game/core/audio/voices";
import { defaultSoundPrefs, parseSoundPrefs, readSoundPrefs, snapLevel, SOUND_DEFAULT_ON, SOUND_KEY, writeSoundPrefs } from "../src/game/core/audio/prefs";
import { impulseSamples, sliderGain, SPACES } from "../src/game/core/audio/graph";
import { PALETTE_NAMES, SPECS, TRIM } from "../src/game/core/audio/palette";
import { pickEvents, placeEvent, makeLoopable, normalise, pinkSamples } from "../src/game/core/audio/ambience";
import { equalPower, MusicPlayer } from "../src/game/core/audio/music";
import { activeSpan, dcOffset, peak, rms, spectrum } from "../src/game/core/audio/metrics";
import { encodeWav } from "../src/game/core/audio/wav";

/** A permissive fake AudioContext that counts every node it creates. */
function fakeContext() {
  const calls: string[] = [];
  const param = () => {
    const p = { value: 0 } as Record<string, unknown>;
    for (const m of ["setValueAtTime", "linearRampToValueAtTime", "exponentialRampToValueAtTime", "setTargetAtTime", "cancelScheduledValues", "setValueCurveAtTime"])
      p[m] = vi.fn((v: number) => {
        if (m !== "cancelScheduledValues") p.value = v;
        return p;
      });
    return p;
  };
  const node = (kind: string) => {
    calls.push(kind);
    return {
      kind,
      gain: param(),
      frequency: param(),
      detune: param(),
      Q: param(),
      pan: param(),
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
      playbackRate: param(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn(),
      buffer: null as unknown,
      loop: false,
      type: "",
      normalize: true,
    };
  };
  const ctx = {
    calls,
    state: "running",
    currentTime: 1,
    sampleRate: 8000,
    destination: {},
    resume: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
    createGain: () => node("gain"),
    createBiquadFilter: () => node("filter"),
    createOscillator: () => node("osc"),
    createBufferSource: () => node("source"),
    createStereoPanner: () => node("pan"),
    createConvolver: () => node("convolver"),
    createDynamicsCompressor: () => node("compressor"),
    createBuffer: (channels: number, length: number, sampleRate: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { sampleRate, length, duration: length / sampleRate, numberOfChannels: channels, getChannelData: (c: number) => data[c] };
    },
  };
  return ctx;
}
type Fake = ReturnType<typeof fakeContext>;

function host() {
  let ctx: Fake | undefined;
  const h = new AudioHost({ create: () => (ctx = fakeContext()) as unknown as AudioContext, random: () => 0.5 });
  return { h, ctx: () => ctx! };
}

describe("audio engine (D1)", () => {
  it("makes no context on the portfolio, and none before a gesture", () => {
    const { h } = host();
    expect(h.unlock()).toBeNull();
    expect(h.play("score")).toBe(false);
    h.setAllowed(true);
    expect(h.ctx).toBeNull();
    expect(h.unlock()).not.toBeNull();
  });

  it("builds the bus graph once: compressor, limiter and both reverbs", () => {
    const { h, ctx } = host();
    h.setAllowed(true);
    h.unlock();
    const kinds = ctx().calls;
    expect(kinds.filter((k) => k === "compressor")).toHaveLength(2);
    expect(kinds.filter((k) => k === "convolver")).toHaveLength(2);
    h.unlock();
    expect(ctx().calls).toHaveLength(kinds.length);
  });

  it("creates no voice nodes at all while muted", () => {
    const { h, ctx } = host();
    h.setAllowed(true);
    h.unlock();
    h.setMuted(true);
    const before = ctx().calls.length;
    for (const name of PALETTE_NAMES) expect(h.play(name)).toBe(false);
    expect(h.loop("sizzle")).toBeNull();
    expect(ctx().calls.length - before).toBe(0);
    expect(h.built).toBe(0);
    h.setMuted(false);
    expect(h.play("score")).toBe(true);
    expect(ctx().calls.length).toBeGreaterThan(before);
  });

  it("ramps master to 0 on mute and back up over 250 ms", () => {
    const { h } = host();
    h.setAllowed(true);
    h.unlock();
    const master = h.graph!.master.gain as unknown as Record<string, ReturnType<typeof vi.fn>>;
    h.setMuted(true);
    expect(master.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, 0.02);
    h.setMuted(false);
    expect(master.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.8, 1.25);
  });

  it("is silent with the tab hidden and suspends after a second", () => {
    vi.useFakeTimers();
    try {
      const { h, ctx } = host();
      h.setAllowed(true);
      h.unlock();
      h.setHidden(true);
      expect(h.play("score")).toBe(false);
      vi.advanceTimersByTime(1100);
      expect(ctx().suspend).toHaveBeenCalledTimes(1);
      ctx().state = "suspended";
      h.setHidden(false);
      expect(ctx().resume).toHaveBeenCalled();
      expect(h.play("score")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets the landing end a flight sound that is still playing", () => {
    const { h } = host();
    h.setAllowed(true);
    h.unlock();
    expect(h.fade("flight")).toBe(false);
    expect(h.play("flight", { duration: 4.6 })).toBe(true);
    expect(h.fade("flight", 0.45)).toBe(true);
    expect(h.fade("flight")).toBe(false);
  });

  it("caps simultaneous voices at 24", () => {
    const { h } = host();
    h.setAllowed(true);
    h.unlock();
    for (let i = 0; i < 40; i++) h.play("win");
    expect(h.pool.active(1)).toHaveLength(24);
    expect(h.pool.stolen).toBe(16);
  });

  it("applies the sliders to the buses (effects: ui, sfx, ambience)", () => {
    const { h } = host();
    h.setAllowed(true);
    h.unlock();
    h.setLevels({ music: 50, effects: 0 });
    const sfx = h.graph!.bus.sfx.gain as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const musicBus = h.graph!.bus.music.gain as unknown as Record<string, ReturnType<typeof vi.fn>>;
    expect(sfx.setTargetAtTime.mock.lastCall![0]).toBe(0);
    expect(musicBus.setTargetAtTime.mock.lastCall![0]).toBeCloseTo(0.5 * 0.25);
  });

  it("routes external nodes (ambience, fountain) into a bus and back out", () => {
    const { h } = host();
    h.setAllowed(true);
    h.unlock();
    const node = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
    const off = h.connect("ambience", node);
    expect(node.connect).toHaveBeenCalledWith(h.graph!.bus.ambience);
    off();
    expect(node.disconnect).toHaveBeenCalledWith(h.graph!.bus.ambience);
  });

  it("runs at most four loops and stops them", () => {
    const { h } = host();
    h.setAllowed(true);
    h.unlock();
    const loops = [h.loop("sizzle"), h.loop("wheels"), h.loop("crowd"), h.loop("fountain-bed")];
    expect(loops.every(Boolean)).toBe(true);
    expect(h.loop("sizzle")).toBeNull();
    loops[0]!.stop();
    expect(h.loop("sizzle")).not.toBeNull();
    h.stopLoops();
  });
});

describe("voice pool", () => {
  it("steals the quietest voice, the oldest among equals, with a fade", () => {
    const pool = new VoicePool(3);
    const kills: number[] = [];
    const add = (start: number, level: number) => pool.admit(start, { start, end: 10, level, kill: () => kills.push(start) });
    add(0, 0.5);
    add(1, 0.1);
    add(2, 0.1);
    add(3, 0.9);
    expect(kills).toEqual([1]);
    expect(pool.active(3).map((v) => v.start)).toEqual([0, 2, 3]);
    expect(pool.active(11)).toHaveLength(0);
  });
});

describe("sound preference", () => {
  it("defaults to on, as the owner decided", () => {
    expect(SOUND_DEFAULT_ON).toBe(true);
    expect(defaultSoundPrefs()).toEqual({ muted: false, music: 80, effects: 100 });
  });
  it("parses tolerantly and snaps levels to the slider step", () => {
    expect(parseSoundPrefs(null)).toEqual(defaultSoundPrefs());
    expect(parseSoundPrefs("{bad")).toEqual(defaultSoundPrefs());
    expect(parseSoundPrefs('{"muted":true,"music":33,"effects":140}')).toEqual({ muted: true, music: 35, effects: 100 });
    expect(snapLevel(-3, 50)).toBe(0);
    expect(snapLevel("x", 50)).toBe(50);
  });
  it("round-trips through storage under its own key, and survives blocked storage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    writeSoundPrefs(storage, { muted: true, music: 10, effects: 20 });
    expect(store.has(SOUND_KEY)).toBe(true);
    expect(readSoundPrefs(storage)).toEqual({ muted: true, music: 10, effects: 20 });
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readSoundPrefs(blocked)).toEqual(defaultSoundPrefs());
    expect(() => writeSoundPrefs(blocked, defaultSoundPrefs())).not.toThrow();
  });
  it("maps sliders to gain on a squared curve", () => {
    expect(sliderGain(0)).toBe(0);
    expect(sliderGain(100)).toBe(1);
    expect(sliderGain(50)).toBeCloseTo(0.25);
    expect(sliderGain(NaN)).toBe(0);
  });
});

describe("store sound API", () => {
  it("remembers the preference and mirrors the old muted field", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.resetModules();
    try {
      const { useGame, setMuted, toggleMuted, setMusicLevel, setEffectsLevel } = await import("../src/game/core/store");
      expect(useGame.getState().sound.muted).toBe(!SOUND_DEFAULT_ON);
      setMuted(true);
      expect(useGame.getState().muted).toBe(true);
      expect(JSON.parse(store.get(SOUND_KEY)!).muted).toBe(true);
      toggleMuted();
      expect(useGame.getState().sound.muted).toBe(false);
      setMusicLevel(42);
      setEffectsLevel(61);
      expect(useGame.getState().sound).toEqual({ muted: false, music: 40, effects: 60 });
      // Old call sites set `muted` directly; the preference follows.
      useGame.setState({ muted: true });
      expect(useGame.getState().sound.muted).toBe(true);
      expect(JSON.parse(store.get(SOUND_KEY)!)).toEqual({ muted: true, music: 40, effects: 60 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("palette spec", () => {
  it("every sound has a bus, a level, a length and a measured trim", () => {
    for (const name of PALETTE_NAMES) {
      const s = SPECS[name];
      expect(s.level).toBeGreaterThan(0);
      expect(s.level).toBeLessThanOrEqual(0.1);
      expect(s.dur).toBeGreaterThan(0.01);
      expect(TRIM[name]).toBeGreaterThan(0.5);
      expect(TRIM[name]).toBeLessThan(6);
    }
  });
});

describe("reverb impulses", () => {
  it.each(["outdoor", "room"] as const)("%s: right length, pre-delay, unit energy, decays", (space) => {
    const [l, r] = impulseSamples(8000, space);
    expect(l.length).toBe(Math.ceil(8000 * SPACES[space].length));
    expect(l[0]).toBe(0);
    let e = 0;
    for (const v of l) e += v * v;
    expect(e).toBeCloseTo(1, 5);
    const head = rms(l.subarray(0, 800)),
      tail = rms(l.subarray(l.length - 800));
    expect(tail).toBeLessThan(head * 0.05);
    expect(l).not.toEqual(r);
  });
});

describe("ambience events", () => {
  const rnd = () => 0;
  it("never starts events indoors or beyond the cap", () => {
    expect(pickEvents("home", { day: 1, wind: 1, outdoors: false }, 1, 3, rnd)).toEqual([]);
    expect(pickEvents("home", { day: 1, wind: 1, outdoors: true }, 1, 0, rnd)).toEqual([]);
    expect(pickEvents("home", { day: 1, wind: 1, outdoors: true }, 1, 1, rnd)).toHaveLength(1);
  });
  it("birds only by day; no city cars at home", () => {
    const kinds = pickEvents("home", { day: 0, wind: 0, outdoors: true }, 10, 3, rnd);
    expect(kinds).not.toContain("bird");
    expect(kinds).not.toContain("car");
    expect(pickEvents("korea", { day: 0, wind: 0, outdoors: true }, 10, 3, rnd)).toEqual(["car"]);
  });
  it("pans by bearing and attenuates by distance", () => {
    const facingNorth = { x: 0, z: 0, fx: 0, fz: -1 };
    expect(placeEvent(facingNorth, [10, 0], 10).pan).toBeGreaterThan(0.5);
    expect(placeEvent(facingNorth, [-10, 0], 10).pan).toBeLessThan(-0.5);
    expect(placeEvent(facingNorth, [0, -40], 10).gain).toBeCloseTo(0.25);
  });
  it("loops crossfade without a seam and are normalised, zero-mean", () => {
    const data = normalise(makeLoopable(pinkSamples(4000, 3), 400));
    expect(data.length).toBe(3600);
    expect(Math.abs(dcOffset(data))).toBeLessThan(1e-6);
    expect(peak(data)).toBeCloseTo(0.9);
  });
});

describe("music plumbing", () => {
  it("equal-power crossfade keeps the summed power constant", () => {
    for (const x of [0, 0.25, 0.5, 1]) {
      const [a, b] = equalPower(x);
      expect(a * a + b * b).toBeCloseTo(1);
    }
  });
  it("fetches nothing while disabled or with no tracks", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const h = { ctx: fakeContext() as unknown as AudioContext, connect: () => () => {} };
      await new MusicPlayer(h, { home: { url: "/m.mp3" } }, false).setWorld("home");
      await new MusicPlayer(h, {}, true).setWorld("home");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("metrics and wav", () => {
  const sr = 8000;
  const sine = (f: number, seconds: number, amp = 0.5) =>
    Float32Array.from({ length: sr * seconds }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / sr));
  it("measures peak, rms, dc and span", () => {
    const s = sine(440, 1);
    expect(peak(s)).toBeCloseTo(0.5, 2);
    expect(rms(s)).toBeCloseTo(0.5 / Math.SQRT2, 2);
    expect(Math.abs(dcOffset(s))).toBeLessThan(1e-3);
    const padded = new Float32Array(sr * 2);
    padded.set(sine(440, 0.5), sr / 2);
    const span = activeSpan(sr, -40, padded);
    expect(span.start).toBeCloseTo(0.5, 2);
    expect(span.length).toBeCloseTo(0.5, 2);
  });
  it("finds a tone's spectral centroid", () => {
    expect(spectrum(sine(1000, 1), sr).centroid).toBeGreaterThan(900);
    expect(spectrum(sine(1000, 1), sr).centroid).toBeLessThan(1100);
  });
  it("writes a valid 16-bit stereo header", () => {
    const wav = encodeWav(sr, [sine(440, 0.1), sine(440, 0.1)]);
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(sr);
    expect(wav.length).toBe(44 + 800 * 4);
  });
});
