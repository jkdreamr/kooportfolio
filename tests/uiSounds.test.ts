import { describe, expect, it } from "vitest";
import { cueFor, hoverGate, type ControlInfo } from "../src/game/ui/uiSounds";

const c = (over: Partial<ControlInfo>): ControlInfo => ({
  tag: "button",
  type: null,
  classes: [],
  parentClasses: [],
  disabled: false,
  dataCue: null,
  ariaPressed: null,
  ariaLabel: null,
  ...over,
});

describe("click cues", () => {
  it("maps each kind of control to its cue", () => {
    expect(cueFor(c({ ariaPressed: "false" }))).toBe("ui-toggle");
    expect(cueFor(c({ classes: ["close-button"] }))).toBe("ui-back");
    expect(cueFor(c({ ariaLabel: "Dismiss notification" }))).toBe("ui-back");
    expect(cueFor(c({ classes: ["back-link"] }))).toBe("ui-back");
    expect(cueFor(c({ classes: ["primary-button"] }))).toBe("ui-confirm");
    expect(cueFor(c({ classes: ["launcher"] }))).toBe("ui-confirm");
    expect(cueFor(c({ type: "submit" }))).toBe("ui-confirm");
    expect(cueFor(c({ parentClasses: ["context-action"] }))).toBe("ui-confirm");
    expect(cueFor(c({}))).toBe("ui-select");
  });
  it("honours data-cue, stays silent when disabled, and leaves sliders alone", () => {
    expect(cueFor(c({ dataCue: "ui-toggle", classes: ["icon-button"] }))).toBe("ui-toggle");
    expect(cueFor(c({ dataCue: "none" }))).toBeNull();
    expect(cueFor(c({ disabled: true, classes: ["primary-button"] }))).toBeNull();
    expect(cueFor(c({ tag: "input", type: "range" }))).toBeNull();
  });
});

describe("hover gate", () => {
  it("plays once per control entered and at most once per 60 ms", () => {
    const gate = hoverGate(60);
    const a = {}, b = {};
    expect(gate.enter(a, 0)).toBe(true);
    expect(gate.enter(a, 100)).toBe(false);
    expect(gate.enter(b, 30)).toBe(false);
    gate.leave();
    expect(gate.enter(a, 200)).toBe(true);
    expect(gate.enter(b, 300)).toBe(true);
  });
});
