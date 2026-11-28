import { useCallback } from "react";
import { gameSpotFor, spotLabel } from "../core/gameSpots";
import { launchersFor } from "../core/launchers";
import { useGame, walkTo } from "../core/store";
import "../scenes/game-spot.css";

/**
 * The floating "<Game> · Play" label over a room's game ring. It lives in
 * the HUD (a DOM node); the room's 3D marker (scenes/GameSpot.tsx) moves it
 * over the ring and hides it while playing or standing on a walk-up spot.
 * The first visit adds a bobbing "Walk here to play" beacon. Clicking walks
 * to the spot (walk-up games) or starts the game (launcher games).
 */
export function GameSpotLabel() {
  const scene = useGame((s) => s.scene);
  const spot = gameSpotFor(scene);
  const ref = useCallback((el: HTMLButtonElement | null) => {
    if (el) spotLabel.el = el;
    else if (spotLabel.el && !spotLabel.el.isConnected) spotLabel.el = null;
  }, []);
  if (!spot) return null;
  const activate = () => {
    if (spot.walk) walkTo(spot.x, spot.z + 0.6);
    else launchersFor(scene)[0]?.start();
  };
  return (
    <button
      key={scene}
      ref={ref}
      type="button"
      className="game-spot-label"
      data-hidden="true"
      data-beacon="false"
      onClick={activate}
      aria-label={spot.walk ? `${spot.title}: walk to the glowing circle to play` : `Play ${spot.title}`}
    >
      <span className="game-spot-beacon">{spot.walk ? "Walk here to play" : "Tap to play"}</span>
      <span className="game-spot-pill">
        <b>{spot.title}</b>
        <span className="game-spot-play">▶ Play</span>
      </span>
      <span className="game-spot-arrow" aria-hidden="true" />
    </button>
  );
}
