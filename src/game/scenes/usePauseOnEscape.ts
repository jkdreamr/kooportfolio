import { useEffect, useRef } from "react";
import { claimEscape, type GameModeId } from "../core/gameMode";
import { useGame } from "../core/store";

/**
 * Escape pauses game `id` (the shared pause menu) while `canPause()` holds,
 * e.g. mid-rack or mid-hand; otherwise Escape ends the mode as before.
 */
export function usePauseOnEscape(id: GameModeId, canPause: () => boolean = () => true) {
  const latest = useRef(canPause);
  useEffect(() => {
    latest.current = canPause;
  });
  useEffect(
    () =>
      claimEscape(id, () => {
        if (!latest.current()) return false;
        useGame.setState({ paused: true });
      }),
    [id],
  );
}
