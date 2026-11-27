import type { Cue } from "../core/audio/cues";

/**
 * Which cue a click on an element asks for, decided by markup so every
 * button in the game sounds the same way without each handler calling
 * cue() itself. An explicit `data-cue` wins; `data-cue="none"` silences.
 */
export const HOVER_THROTTLE_MS = 60;
/** Keyboard focus moves get the hover sound at half gain, nothing else. */
export const FOCUS_GAIN = 0.5;

const CONTROL = "button, a[href], summary, [role='button'], input[type='range']";

/** What the click rules need to know about a control (pure, for tests). */
export type ControlInfo = {
  tag: string;
  type: string | null;
  classes: readonly string[];
  parentClasses: readonly string[];
  disabled: boolean;
  dataCue: string | null;
  ariaPressed: string | null;
  ariaLabel: string | null;
};

const BACK = ["close-button", "story-close", "back-link", "writing-back"];
const CONFIRM = ["primary-button", "launcher", "photo-booth-primary"];

export function cueFor(c: ControlInfo): Cue | null {
  if (c.disabled) return null;
  if (c.dataCue) return c.dataCue === "none" ? null : (c.dataCue as Cue);
  if (c.tag === "input") return null;
  if (c.ariaPressed !== null) return "ui-toggle";
  if (c.classes.some((x) => BACK.includes(x)) || /^(Close|Dismiss)/.test(c.ariaLabel ?? ""))
    return "ui-back";
  if (
    c.classes.some((x) => CONFIRM.includes(x)) ||
    (c.tag === "button" && c.type === "submit") ||
    (c.tag === "button" && c.parentClasses.includes("context-action"))
  )
    return "ui-confirm";
  return "ui-select";
}

export function describeControl(el: Element): ControlInfo {
  return {
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute("type"),
    classes: [...el.classList],
    parentClasses: el.parentElement ? [...el.parentElement.classList] : [],
    disabled: (el as HTMLButtonElement).disabled === true,
    dataCue: el.getAttribute("data-cue"),
    ariaPressed: el.getAttribute("aria-pressed"),
    ariaLabel: el.getAttribute("aria-label"),
  };
}

/** Hover: one per control entered, at most one per throttle window. */
export function hoverGate(throttleMs = HOVER_THROTTLE_MS) {
  let lastAt = -Infinity;
  let current: unknown = null;
  return {
    enter(el: unknown, now: number) {
      if (!el || el === current) return false;
      current = el;
      if (now - lastAt < throttleMs) return false;
      lastAt = now;
      return true;
    },
    leave() {
      current = null;
    },
  };
}

/** Scene UIs inside the canvas voice their own controls (their games own
 * those sounds); only the dialogs this layer owns are included there. */
const OWNED_IN_CANVAS = ".writing-dialog";
const ours = (el: Element) =>
  !el.closest(".stage-canvas") || !!el.closest(OWNED_IN_CANVAS);

/** Wires the delegated UI sounds to a root; returns the cleanup. */
export function attachUiSounds(root: HTMLElement, play: (name: Cue, opts?: { gain?: number }) => void) {
  const gate = hoverGate();
  const over = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const el = (event.target as Element | null)?.closest?.(CONTROL);
    if (el && ours(el) && !(el as HTMLButtonElement).disabled && gate.enter(el, performance.now()))
      play("ui-hover");
  };
  const out = (event: PointerEvent) => {
    const el = (event.target as Element | null)?.closest?.(CONTROL);
    const into = (event.relatedTarget as Element | null)?.closest?.(CONTROL);
    if (el && el !== into) gate.leave();
  };
  const focus = (event: FocusEvent) => {
    const el = event.target as Element | null;
    if (!el?.matches?.(CONTROL) || !ours(el)) return;
    let keyboard = false;
    try {
      keyboard = el.matches(":focus-visible");
    } catch {
      keyboard = false;
    }
    if (keyboard && gate.enter(el, performance.now())) play("ui-hover", { gain: FOCUS_GAIN });
  };
  const click = (event: MouseEvent) => {
    const el = (event.target as Element | null)?.closest?.(CONTROL);
    if (!el || !ours(el)) return;
    const name = cueFor(describeControl(el));
    if (name) play(name);
  };
  root.addEventListener("pointerover", over);
  root.addEventListener("pointerout", out);
  root.addEventListener("focusin", focus);
  root.addEventListener("click", click);
  return () => {
    root.removeEventListener("pointerover", over);
    root.removeEventListener("pointerout", out);
    root.removeEventListener("focusin", focus);
    root.removeEventListener("click", click);
  };
}
