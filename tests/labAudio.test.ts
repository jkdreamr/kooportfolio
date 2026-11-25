import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../src/game/core/store", () => ({
  useGame: { getState: () => ({ muted: false }) },
}));

function oscillator() {
  return {
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn<(when: number) => void>(),
    stop: vi.fn(),
  };
}

function bufferSource() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn<(when: number) => void>(),
    stop: vi.fn(),
  };
}

let clicks: ReturnType<typeof oscillator>[];
let noises: ReturnType<typeof bufferSource>[];
let state: "suspended" | "running";
let finishResume: () => void;

class AudioClock {
  state = state;
  currentTime = 10;
  destination = {};
  sampleRate = 8000;
  resume = () =>
    new Promise<void>((resolve) => {
      finishResume = resolve;
    });
  createOscillator() {
    const click = oscillator();
    clicks.push(click);
    return click;
  }
  createBufferSource() {
    const src = bufferSource();
    noises.push(src);
    return src;
  }
  createBuffer(channels: number, length: number) {
    return {
      sampleRate: 8000,
      getChannelData: () => new Float32Array(length),
    };
  }
  createBiquadFilter() {
    return {
      type: "",
      frequency: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
}

beforeEach(() => {
  vi.resetModules();
  clicks = [];
  noises = [];
  state = "running";
  vi.stubGlobal("AudioContext", AudioClock);
});
afterEach(() => vi.unstubAllGlobals());

it("plays a metronome count-in then the drum pattern", async () => {
  const { scheduleLabBeat } = await import("../src/game/scenes/labAudio");
  // Count-in is one 16-step bar; Boom Bap kicks on slots 0, 7, 10.
  scheduleLabBeat(() => 0, 4.8, 0.6, "boombap");
  const clickStarts = clicks.map((c) => c.start.mock.calls[0][0] - 10);
  // Count-in clicks at beats 0-3 of bar 0; then boom bap kicks and a snare tone.
  expect(clickStarts[0]).toBeCloseTo(0);
  expect(clickStarts[1]).toBeCloseTo(0.6);
  // Steps 0-15 are count-in (4 clicks); kick slots 0,7,10 in bar 1 → steps 16,23,26.
  expect(clickStarts[4]).toBeCloseTo(16 * 0.15); // kick, slot 0
  expect(clickStarts[5]).toBeCloseTo(20 * 0.15); // snare tone, slot 4
  expect(clickStarts[6]).toBeCloseTo(23 * 0.15); // kick, slot 7
  expect(noises.length).toBeGreaterThan(0);
});

it("schedules only hits still ahead of the read time", async () => {
  const { scheduleLabBeat } = await import("../src/game/scenes/labAudio");
  const cancel = scheduleLabBeat(() => 2.8, 4.2, 0.6, "boombap");
  const starts = clicks.map((c) => c.start.mock.calls[0][0]);
  expect(starts.every((when) => when >= 10)).toBe(true);
  cancel();
  expect(
    clicks.every((click) => click.stop.mock.calls.length >= 1) &&
      noises.every((src) => src.stop.mock.calls.length >= 1),
  ).toBe(true);
});

it("does not start a track cancelled before audio unlocks", async () => {
  state = "suspended";
  const { scheduleLabBeat } = await import("../src/game/scenes/labAudio");
  const cancel = scheduleLabBeat(() => 0, 4.2, 0.6, "boombap");
  cancel();
  finishResume();
  await Promise.resolve();
  expect(clicks).toHaveLength(0);
});
