import { useEffect, useRef, type PointerEvent, type RefObject } from "react";
import type { BadmintonInput } from "../core/badminton";
import { badmintonGesture } from "../core/badminton-gesture";

export function MovePad({
  movement,
}: {
  movement: RefObject<{ x: number; z: number }>;
}) {
  const active = useRef<number | null>(null);
  const knob = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const clear = () => {
      active.current = null;
      movement.current.x = movement.current.z = 0;
      if (knob.current) knob.current.style.transform = "translate(0, 0)";
    };
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("blur", clear);
      clear();
    };
  }, [movement]);
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    if (active.current !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    let x = (e.clientX - rect.left - rect.width / 2) / (rect.width * 0.3);
    let z = (e.clientY - rect.top - rect.height / 2) / (rect.height * 0.3);
    const length = Math.max(1, Math.hypot(x, z));
    x = Math.abs(x) < 0.12 ? 0 : x / length;
    z = Math.abs(z) < 0.12 ? 0 : z / length;
    movement.current.x = x;
    movement.current.z = z;
    if (knob.current)
      knob.current.style.transform = `translate(${x * 23}px, ${z * 23}px)`;
  };
  const release = (e: PointerEvent<HTMLButtonElement>) => {
    if (active.current !== e.pointerId) return;
    active.current = null;
    movement.current.x = movement.current.z = 0;
    if (knob.current) knob.current.style.transform = "translate(0, 0)";
  };
  return (
    <button
      className="badminton-move"
      aria-label="Move pad. Drag to move, or use WASD and arrow keys"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (active.current !== null) return;
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      data-badminton-shortcuts
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path d="m44 18 6-6 6 6M44 82l6 6 6-6M18 44l-6 6 6 6M82 44l6 6-6 6" />
        <circle cx="50" cy="50" r="28" />
      </svg>
      <span ref={knob} className="badminton-stick" />
    </button>
  );
}

export function HitPad({
  input,
  disabled,
  serve,
  onShot,
}: {
  input: RefObject<BadmintonInput>;
  disabled: boolean;
  serve: boolean;
  onShot: (selection: Pick<BadmintonInput, "aim" | "shot">) => void;
}) {
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    pointerType: string;
    presetsVisible: boolean;
    selection: Pick<BadmintonInput, "aim" | "shot">;
  } | null>(null);
  const select = (e: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    if (!start || start.id !== e.pointerId) return null;
    return badmintonGesture(e.clientX - start.x, e.clientY - start.y, start.selection, start.pointerType, start.presetsVisible);
  };
  const cancel = () => {
    const start = drag.current;
    drag.current = null;
    if (start) onShot(start.selection);
  };
  useEffect(() => {
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      cancel();
    };
  }, []);
  return (
    <button
      className="badminton-hit"
      aria-label={
        serve
          ? "Serve. Tap or swipe"
          : "Hit. Tap to use the selected shot, or drop in touch gesture mode. Swipe up for clear, down for smash, left or right to aim"
      }
      disabled={disabled}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (drag.current) return;
        drag.current = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          pointerType: e.pointerType,
          presetsVisible: !!e.currentTarget.parentElement?.querySelector(".badminton-shots")?.getClientRects().length,
          selection: { aim: input.current.aim, shot: input.current.shot },
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const selection = select(e);
        if (selection) onShot(selection);
      }}
      onPointerUp={(e) => {
        const selection = select(e);
        if (!selection) return;
        Object.assign(input.current, selection, { swing: true });
        onShot(selection);
        drag.current = null;
      }}
      onPointerCancel={(e) => {
        if (drag.current?.id === e.pointerId) cancel();
      }}
      onLostPointerCapture={(e) => {
        if (drag.current?.id === e.pointerId) cancel();
      }}
      onClick={(e) => {
        // Native keyboard / assistive activation; pointer shots commit on release.
        if (e.detail === 0) input.current.swing = true;
      }}
      data-badminton-shortcuts
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <ellipse cx="28" cy="18" rx="10" ry="13" transform="rotate(35 28 18)" />
        <path d="m21 28-12 15m5-9 4 3m3-23 13 8m-15-2 12 8m-7-17 11 7m-1-9-13 19m7-22L16 23" />
      </svg>
      <span>{serve ? "Serve" : "Hit"}</span>
    </button>
  );
}
