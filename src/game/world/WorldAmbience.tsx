import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { AmbientAudio } from "../core/ambientAudio";
import { runtime, useGame } from "../core/store";
import { daylightClock } from "../core/timeOfDay";
import { wildlifeClock } from "../core/wildlife";

/** One mount in World, not one audio graph per animal or per scene. */
export function WorldAmbience() {
  const audio = useRef<AmbientAudio | null>(null),
    elapsed = useRef(0),
    // Camera forward on the ground plane; the listener faces the screen.
    facing = useRef<[number, number]>([-70, -95]),
    scratch = useRef(new Vector3());
  useEffect(() => {
    const engine = new AmbientAudio(() => {
      const state = useGame.getState();
      return {
        muted: state.muted,
        paused: state.paused,
        active: runtime.active,
        hidden: document.hidden,
        scene: state.scene,
        world: state.world,
        hour: daylightClock.hour,
        x: runtime.x,
        z: runtime.z,
        seconds: wildlifeClock.seconds,
        facing: facing.current,
      };
    });
    audio.current = engine;
    const gesture = () => engine.unlock();
    const sync = () => engine.sync();
    const unsubscribe = useGame.subscribe(sync);
    // Capture runs before HUD unmute handlers, while browser activation is live.
    // No blur->stop(): a visible window losing focus must not cut the sound.
    window.addEventListener("pointerdown", gesture, true);
    window.addEventListener("keydown", gesture, true);
    document.addEventListener("visibilitychange", sync);
    return () => {
      audio.current = null;
      unsubscribe();
      window.removeEventListener("pointerdown", gesture, true);
      window.removeEventListener("keydown", gesture, true);
      document.removeEventListener("visibilitychange", sync);
      engine.dispose();
    };
  }, []);
  useFrame(({ camera }, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.1) return;
    elapsed.current = 0;
    const forward = camera.getWorldDirection(scratch.current);
    if (Math.hypot(forward.x, forward.z) > 0.05)
      facing.current = [forward.x, forward.z];
    audio.current?.sync();
  });
  return null;
}
