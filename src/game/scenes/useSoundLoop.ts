import { useEffect, useRef } from "react";
import { useGame } from "../core/store";
import { loop } from "../core/audio/live";
import type { LoopHandle, LoopName } from "../core/audio/palette";

/**
 * Keeps a looping sound running while `name` is set (and sound is on),
 * restarting after an unmute or the first gesture, stopping on unmount.
 * Returns the live handle (for `set(drive)`), or null while silent.
 */
export function useSoundLoop(name: LoopName | null, gain = 1) {
  const handle = useRef<LoopHandle | null>(null);
  useEffect(() => {
    if (!name) return;
    const ensure = () => {
      if (!handle.current && !useGame.getState().muted) handle.current = loop(name, gain);
    };
    const halt = () => {
      handle.current?.stop();
      handle.current = null;
    };
    ensure();
    const unsubscribe = useGame.subscribe((next, prev) => {
      if (next.muted === prev.muted) return;
      if (next.muted) halt();
      else ensure();
    });
    // The first gesture creates the audio context; try again after it.
    const retry = () => setTimeout(ensure, 0);
    window.addEventListener("pointerdown", retry);
    window.addEventListener("keydown", retry);
    return () => {
      unsubscribe();
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
      halt();
    };
  }, [name, gain]);
  return handle;
}
