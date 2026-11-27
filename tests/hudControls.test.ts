import { afterEach, describe, expect, it, vi } from "vitest";
import { useGame } from "../src/game/core/store";
import {
  isMuteKey,
  setSoundPrefs,
  snapToStep,
  SOUND_HINT_KEY,
  takeSoundHint,
  toggleMute,
} from "../src/game/ui/soundPrefs";
import { pushToast, tickToasts, TOAST_MS, type Toast } from "../src/game/ui/toasts";

const key = (k: string, extra: Partial<KeyboardEvent> = {}) =>
  ({ key: k, repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: null, ...extra }) as KeyboardEvent;

describe("mute shortcut", () => {
  it("is M or m without modifiers or repeats", () => {
    expect(isMuteKey(key("m"))).toBe(true);
    expect(isMuteKey(key("M"))).toBe(true);
    expect(isMuteKey(key("m", { repeat: true }))).toBe(false);
    expect(isMuteKey(key("m", { ctrlKey: true }))).toBe(false);
    expect(isMuteKey(key("m", { metaKey: true }))).toBe(false);
    expect(isMuteKey(key("n"))).toBe(false);
  });
});

describe("sound preference controls", () => {
  const initial = useGame.getState();
  afterEach(() => useGame.setState(initial, true));
  it("snap levels to 0–100 in steps of 5", () => {
    expect(snapToStep(-3)).toBe(0);
    expect(snapToStep(42)).toBe(40);
    expect(snapToStep(43)).toBe(45);
    expect(snapToStep(250)).toBe(100);
  });
  it("write through the store's setSound when it exists", () => {
    const setSound = vi.fn();
    useGame.setState({ setSound } as never);
    setSoundPrefs({ music: 37 });
    expect(setSound).toHaveBeenCalledWith({ music: 35 });
  });
  it("still toggle the legacy mute flag without it", () => {
    useGame.setState({ muted: true, setSound: undefined, sound: undefined } as never);
    toggleMute();
    expect(useGame.getState().muted).toBe(false);
    toggleMute();
    expect(useGame.getState().muted).toBe(true);
  });
});

describe("one-time sound hint", () => {
  it("shows once per browser", () => {
    const data = new Map<string, string>();
    const storage = () => ({ getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) });
    expect(takeSoundHint(storage)).toBe(true);
    expect(data.get(SOUND_HINT_KEY)).toBe("1");
    expect(takeSoundHint(storage)).toBe(false);
  });
  it("shows once per page when storage is blocked", () => {
    const blocked = () => {
      throw new DOMException("Denied", "SecurityError");
    };
    expect(takeSoundHint(blocked)).toBe(true);
    expect(takeSoundHint(blocked)).toBe(false);
  });
});

describe("toast queue", () => {
  const t = (id: number, text: string, sticky = false): Toast => ({ id, text, sticky, left: TOAST_MS });
  it("keeps at most two, newest last, without duplicates", () => {
    let list = pushToast([], t(1, "a"));
    list = pushToast(list, t(2, "b"));
    list = pushToast(list, t(3, "c"));
    expect(list.map((x) => x.text)).toEqual(["b", "c"]);
    list = pushToast(list, t(4, "b"));
    expect(list.map((x) => x.id)).toEqual([3, 4]);
  });
  it("expires after 4 s, pauses on hover, and keeps sticky ones", () => {
    let list = [t(1, "a"), t(2, "warn", true)];
    list = tickToasts(list, 3000, true);
    expect(list).toHaveLength(2);
    list = tickToasts(list, 3000, false);
    expect(list.map((x) => x.text)).toEqual(["a", "warn"]);
    list = tickToasts(list, 1001, false);
    expect(list.map((x) => x.text)).toEqual(["warn"]);
  });
});
