import { useRef, useState } from "react";
import { touch } from "../core/input";

/** Knob travel in px from the centre of the 100px pad. */
const STICK_TRAVEL = 30;
/** Fraction of travel ignored around the centre so a resting thumb is still. */
const STICK_DEAD_ZONE = 0.12;
export function Joystick() {
  const pad = useRef<HTMLDivElement>(null),
    knob = useRef<HTMLSpanElement>(null),
    [active, setActive] = useState(false);
  // Written straight to the DOM: a React render per pointermove made the
  // knob trail the thumb on slower phones.
  const place = (x: number, z: number, magnitude: number) => {
    knob.current?.style.setProperty(
      "transform",
      `translate(${x * STICK_TRAVEL}px,${z * STICK_TRAVEL}px)`,
    );
    pad.current?.style.setProperty("--stick-angle", `${Math.atan2(x, -z)}rad`);
    pad.current?.style.setProperty("--stick-push", magnitude.toFixed(3));
  };
  const reset = () => {
    touch.x = 0;
    touch.z = 0;
    place(0, 0, 0);
    setActive(false);
  };
  const steer = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = pad.current!.getBoundingClientRect(),
      x = (e.clientX - r.left - r.width / 2) / (STICK_TRAVEL + 5),
      z = (e.clientY - r.top - r.height / 2) / (STICK_TRAVEL + 5),
      length = Math.hypot(x, z),
      m = Math.max(1, length),
      ux = x / m,
      uz = z / m,
      reach = Math.min(1, length),
      // Re-scale past the dead zone so output still spans 0..1 smoothly.
      push = reach < STICK_DEAD_ZONE ? 0 : (reach - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE),
      scale = reach > 0 ? push / reach : 0;
    touch.x = ux * scale;
    touch.z = uz * scale;
    place(ux, uz, push);
  };
  return (
    <div
      className={`joystick${active ? " is-active" : ""}`}
      ref={pad}
      aria-label="Touch movement joystick"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setActive(true);
        steer(e);
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        steer(e);
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
      onLostPointerCapture={reset}
    >
      <b aria-hidden="true" />
      <span ref={knob} />
    </div>
  );
}
