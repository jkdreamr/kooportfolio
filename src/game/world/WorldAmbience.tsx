import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AmbientAudio } from "../core/ambientAudio";
import { runtime, useGame } from "../core/store";
import { daylightClock } from "../core/timeOfDay";
import { wildlifeClock } from "../core/wildlife";

/** One mount in World, not one audio graph per animal or per scene. */
export function WorldAmbience() {
  const audio = useRef<AmbientAudio | null>(null),
    elapsed = useRef(0);
  useEffect(() => {
    const engine = new AmbientAudio(() => {
      const state = useGame.getState();
      return {
        muted: state.muted,
        paused: state.paused,
        active: runtime.active,
        hidden: document.hidden,
        scene: state.scene,
        hour: daylightClock.hour,
        x: runtime.x,
        z: runtime.z,
        seconds: wildlifeClock.seconds,
      };
    });
    audio.current = engine;
    const gesture = () => engine.unlock();
    const sync = () => engine.sync();
    const blur = () => engine.stop();
    const unsubscribe = useGame.subscribe(sync);
    // Capture runs before HUD unmute handlers, while browser activation is live.
    window.addEventListener("pointerdown", gesture, true);
    window.addEventListener("keydown", gesture, true);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", sync);
    return () => {
      audio.current = null;
      unsubscribe();
      window.removeEventListener("pointerdown", gesture, true);
      window.removeEventListener("keydown", gesture, true);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", sync);
      engine.dispose();
    };
  }, []);
  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.15) return;
    elapsed.current = 0;
    audio.current?.sync();
  });
  return null;
}
