/**
 * Feedback kit, DOM part: score pops, rings, confetti, screen shake, tinted
 * flash and haptics. Everything is plain DOM animated with the Web Animations
 * API (transforms and opacity only): no WebGL materials, so no new shader
 * programs, and no per-frame React state. Positions are projected once, at
 * the moment of the event. Nodes come from one pool of at most 40.
 */
import { useCallback } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3, type Camera } from "three";
import {
  CONFETTI_MS,
  confettiPieces,
  EASE,
  FLASH_MS,
  FLASH_OPACITY,
  HAPTICS,
  ndcToScreen,
  pieceKeyframes,
  POP_MS,
  POP_RISE,
  RING_FROM,
  RING_MS,
  RING_TO,
  shakeKeyframes,
  SHAKE_MS,
  SlotPool,
  TONES,
  type Haptic,
  type Tone,
} from "./juice";
import "./juice.css";
import { exposeQa } from "../../../stage/qa";

const reduced = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

let layer: HTMLDivElement | null = null;
function host(): HTMLDivElement | null {
  if (typeof document === "undefined" || typeof document.createElement !== "function") return null;
  if (layer?.isConnected) return layer;
  layer = document.createElement("div");
  layer.className = "juice-layer";
  layer.setAttribute("aria-hidden", "true");
  (document.querySelector(".game-shell") ?? document.body).append(layer);
  return layer;
}

const pool = new SlotPool<HTMLDivElement>(
  () => {
    const el = document.createElement("div");
    el.hidden = true;
    host()?.append(el);
    return el;
  },
  (el) => {
    for (const a of el.getAnimations?.() ?? []) a.cancel();
    el.hidden = true;
    el.className = "";
    el.textContent = "";
    el.removeAttribute("style");
  },
);

function spawn(className: string, x: number, y: number) {
  const root = host();
  if (!root) return null;
  const el = pool.acquire();
  if (el.parentElement !== root) root.append(el);
  el.className = className;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.hidden = false;
  return el;
}

function run(el: HTMLElement, frames: Keyframe[], ms: number, easing = EASE) {
  if (typeof el.animate !== "function") {
    setTimeout(() => pool.release(el as HTMLDivElement), ms);
    return;
  }
  const a = el.animate(frames, { duration: ms, easing, fill: "forwards" });
  a.onfinish = () => pool.release(el as HTMLDivElement);
  a.oncancel = null;
}

/** A floating score chip at a screen point: rises 28 px and fades. */
function pop(text: string, x: number, y: number, tone: Tone = "good") {
  const el = spawn(`juice-pop juice-pop--${tone}`, x, y);
  if (!el) return;
  el.textContent = text;
  el.style.color = TONES[tone];
  const still = reduced();
  const rise = still ? 0 : -POP_RISE;
  // Linear timeline with per-segment easing: in fast, readable for most of
  // its life, then gone. (One ease over the whole timeline would start the
  // fade almost at once.)
  const frames: Keyframe[] = [
    { opacity: 0, transform: "translateY(0px)", easing: EASE },
    { opacity: 1, offset: 0.12, transform: `translateY(${rise * 0.5}px)`, easing: EASE },
    { opacity: 1, offset: 0.62, transform: `translateY(${rise * 0.85}px)`, easing: "ease-in" },
    { opacity: 0, transform: `translateY(${rise}px)` },
  ];
  run(el, still ? frames.map(({ opacity, offset, easing }) => ({ opacity, offset, easing })) : frames, POP_MS, "linear");
}

/** An expanding ring 12 → 64 px. */
function ring(x: number, y: number, tone: Tone = "good") {
  const el = spawn("juice-ring", x, y);
  if (!el) return;
  el.style.borderColor = TONES[tone];
  run(
    el,
    reduced()
      ? [{ opacity: 0.9 }, { opacity: 0 }]
      : [
          { opacity: 0.95, transform: `scale(${RING_FROM / RING_TO})` },
          { opacity: 0, transform: "scale(1)" },
        ],
    RING_MS,
  );
}

/** Confetti from the top third of the stage (skipped with reduced motion). */
function confetti(n = 28) {
  if (reduced()) return;
  const root = host();
  if (!root) return;
  const w = root.clientWidth || window.innerWidth,
    h = root.clientHeight || window.innerHeight;
  for (const piece of confettiPieces(n, w)) {
    const el = spawn("juice-confetti", piece.x, h * 0.18);
    if (!el) return;
    el.style.background = piece.colour;
    run(el, pieceKeyframes(piece), CONFETTI_MS, "linear");
  }
}

let shaking: Animation | null = null;
/** Shakes the game stage wrapper (strength 0.3 a hit, 1 a big moment). */
function shake(strength = 0.3) {
  if (reduced()) return;
  const stage = document.querySelector<HTMLElement>(".stage-canvas");
  if (!stage || typeof stage.animate !== "function") return;
  shaking?.cancel();
  shaking = stage.animate(shakeKeyframes(strength), { duration: SHAKE_MS, easing: "linear" });
  shaking.onfinish = () => (shaking = null);
}

/** A tinted full-stage wash at 10% for 90 ms (never white, never brighter). */
function flash(tone: Tone = "great") {
  if (reduced()) return;
  const el = spawn("juice-flash", 0, 0);
  if (!el) return;
  el.style.background = TONES[tone];
  run(el, [{ opacity: FLASH_OPACITY }, { opacity: 0 }], FLASH_MS, "linear");
}

/** A short vibration on touch devices that support it. */
function haptic(pattern: Haptic = "tap") {
  if (!coarse()) return;
  try {
    navigator.vibrate?.(HAPTICS[pattern]);
  } catch {
    /* Not allowed here: fine. */
  }
}

/** Effects are garnish: a failure in one never reaches the game's logic. */
function safe<A extends unknown[]>(fn: (...args: A) => void) {
  return (...args: A) => {
    try {
      fn(...args);
    } catch {
      /* No DOM, no animation support: skip the effect. */
    }
  };
}
export const juice = {
  pop: safe(pop),
  ring: safe(ring),
  confetti: safe(confetti),
  shake: safe(shake),
  flash: safe(flash),
  haptic: safe(haptic),
  pool,
};
exposeQa({ juice });

const scratch = new Vector3();
/** World point → viewport px with the given camera and canvas. */
export function projectPoint(point: readonly [number, number, number] | Vector3, camera: Camera, canvas: HTMLElement): [number, number] {
  if (point instanceof Vector3) scratch.copy(point);
  else scratch.set(point[0], point[1], point[2]);
  scratch.project(camera);
  return ndcToScreen(scratch, canvas.getBoundingClientRect());
}

/**
 * Scene helper: `at(point)` projects a world point once with the active
 * camera; the burst helpers combine the kit for common moments.
 */
export function useJuice() {
  const camera = useThree((s) => s.camera),
    gl = useThree((s) => s.gl);
  const at = useCallback(
    (point: readonly [number, number, number] | Vector3) => projectPoint(point, camera, gl.domElement),
    [camera, gl],
  );
  const score = useCallback(
    (point: readonly [number, number, number] | Vector3, text: string, tone: Tone = "good") => {
      try {
        const [x, y] = at(point);
        juice.pop(text, x, y, tone);
        juice.ring(x, y, tone);
        juice.haptic("score");
      } catch {
        /* Projection unavailable: skip the effect. */
      }
    },
    [at],
  );
  return { at, score, ...juice };
}
