import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../src/game/core/store", () => ({
  useGame: { getState: () => ({ muted: false }) },
}));

function oscillator() {
  return {
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn<(when: number) => void>(),
    stop: vi.fn(),
  };
}

let clicks: ReturnType<typeof oscillator>[];
let state: "suspended" | "running";
let finishResume: () => void;

class AudioClock {
  state = state;
  currentTime = 10;
  destination = {};
  resume = () =>
    new Promise<void>((resolve) => {
      finishResume = resolve;
    });
  createOscillator() {
    const click = oscillator();
    clicks.push(click);
    return click;
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
  state = "running";
  vi.stubGlobal("AudioContext", AudioClock);
});
afterEach(() => vi.unstubAllGlobals());

it("queues upcoming clicks at audio time and skips expired beats", async () => {
  const { scheduleLabBeatClicks } = await import("../src/game/scenes/labAudio");
  const cancel = scheduleLabBeatClicks(() => 2.8, 4.2);
  expect(clicks).toHaveLength(2);
  expect(clicks[0].start.mock.calls[0][0]).toBeCloseTo(10.2);
  expect(clicks[1].start.mock.calls[0][0]).toBeCloseTo(10.8);
  cancel();
  expect(clicks.every((click) => click.stop.mock.calls.length === 2)).toBe(
    true,
  );
});

it("does not start a track cancelled before audio unlocks", async () => {
  state = "suspended";
  const { scheduleLabBeatClicks } = await import("../src/game/scenes/labAudio");
  const cancel = scheduleLabBeatClicks(() => 0, 4.2);
  cancel();
  finishResume();
  await Promise.resolve();
  expect(clicks).toHaveLength(0);
});
