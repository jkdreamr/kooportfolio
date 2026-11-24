import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AmbientAudio,
  type AmbientEnvironment,
} from "../src/game/core/ambientAudio";

const param = () => ({ value: 0, setTargetAtTime: vi.fn() });
function node() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    gain: param(),
    frequency: param(),
    loop: false,
    buffer: null,
    type: "",
  };
}
let sources: ReturnType<typeof node>[], contexts: FakeContext[];
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
  createBiquadFilter = node;
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
  audio = new AmbientAudio(() => environment);
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
    await vi.waitFor(() => expect(sources).toHaveLength(6));
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(sources.every((s) => s.start.mock.calls.length === 1)).toBe(true);
  });

  it.each(["muted", "paused", "hidden", "inactive", "interior"])(
    "stops all sources for %s and reuses decoded audio on return",
    async (reason) => {
      environment.muted = false;
      audio.unlock();
      await vi.waitFor(() => expect(sources).toHaveLength(6));
      if (reason === "inactive") environment.active = false;
      else if (reason === "interior") environment.scene = "kappa";
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
      await vi.waitFor(() => expect(sources).toHaveLength(12));
      expect(fetch).toHaveBeenCalledTimes(4);
      audio.dispose();
      expect(contexts[0].close).toHaveBeenCalledTimes(1);
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
    expect(contexts[0].close).toHaveBeenCalledTimes(1);
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
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(sources[0].type).toBe("sawtooth");
  });
});
