import { useEffect } from "react";
import { runtime, useGame } from "./store";
import { escapeGameMode } from "./gameMode";
import { gameInputEnabled, useStage } from "../../stage/contract";
export const keys = new Set<string>();
/** Controls whose own Space/Enter activation must not be cancelled. */
const ACTIVATABLE = "button, a, [role=button], summary";
export const touch = { x: 0, z: 0 };

/** `legacy` is set by the HUD when no stage engine drives modes (an old
 * build of /play): the game then takes input as soon as it is shown. */
export const stageGate = { legacy: false };
/** Keyboard and HUD input belong to the game only once it is playable and the
 * HUD has been revealed; during the portfolio, peek and fly-in they do not. */
export function stageInputLive() {
  return stageGate.legacy || gameInputEnabled(useStage.getState());
}

/** Held modifier, never a toggle: keyup and the shared blur reset stop sprint. */
export function movementSpeed(base = 4.6) {
  return base * (keys.has("shift") ? 1.85 : 1);
}
export function useInput(interact: () => void) {
  useEffect(() => {
    const closeGame = (e: KeyboardEvent) => {
      if (
        e.key !== "Escape" ||
        e.isComposing ||
        !stageInputLive() ||
        !escapeGameMode(e.repeat)
      )
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea,select")) return;
      if (!stageInputLive()) return;
      const k = e.key.toLowerCase();
      // Space activates a focused button on keyup; cancelling its keydown
      // swallowed keyboard-only "Play"/"Exit" presses. Arrows and Space only
      // lose their page-scroll default away from controls.
      if (
        ["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k) &&
        !(e.target instanceof Element && e.target.closest(ACTIVATABLE))
      )
        e.preventDefault();
      keys.add(k);
      if (e.repeat) return;
      if (k === "escape") {
        const s = useGame.getState();
        if (s.panel !== "none") useGame.setState({ panel: "none" });
        else useGame.setState({ paused: !s.paused });
      }
      if (k === "e") interact();
      if (k === "1") runtime.raceCadence = 24;
      if (k === "2") runtime.raceCadence = 30;
      if (k === "3") runtime.raceCadence = 36;
      if (
        k === "r" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        useGame.getState().scene === "rowing"
      )
        runtime.raceCatch = true;
      if (k === " " && useGame.getState().scene === "basketball")
        runtime.shooting = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
      if (e.key === " " && runtime.shooting) {
        runtime.shooting = false;
        runtime.shoot = true;
      }
    };
    const blur = () => {
      keys.clear();
      touch.x = 0;
      touch.z = 0;
      runtime.shooting = false;
      runtime.burst = false;
      runtime.raceCatch = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keydown", closeGame, true);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keydown", closeGame, true);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      blur();
    };
  }, [interact]);
}
export function movement(): [number, number] {
  let x =
    Number(keys.has("d") || keys.has("arrowright")) -
    Number(keys.has("a") || keys.has("arrowleft")) +
    touch.x;
  let z =
    Number(keys.has("s") || keys.has("arrowdown")) -
    Number(keys.has("w") || keys.has("arrowup")) +
    touch.z;
  const length = Math.hypot(x, z);
  if (length > 1) {
    x /= length;
    z /= length;
  }
  return [x, z];
}
