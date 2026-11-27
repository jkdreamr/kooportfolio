import { useEffect } from "react";
import { WORLDS } from "../core/worlds";
import { ARRIVAL_CARD_MS, clearArrival, useArrival } from "../core/arrival";
import { useGame } from "../core/store";
import "./arrival-card.css";

/** After a journey lands: the world's name as a quiet glass title card for
 * 1.5 s (it replaces the Departures prompt that used to open on landing).
 * Never interactive; screen readers hear "Arrived in <world>". */
export function ArrivalCard() {
  const world = useArrival((state) => state.world);
  const serial = useArrival((state) => state.serial);
  const hidden = useGame((game) => game.paused || game.scene !== "hub");
  useEffect(() => {
    if (!world) return;
    // The animation ends on its own; the timer only tidies the store (and
    // covers a tab hidden mid-animation, when animationend never fires).
    const timer = window.setTimeout(() => clearArrival(serial), ARRIVAL_CARD_MS + 100);
    return () => window.clearTimeout(timer);
  }, [world, serial]);
  if (!world || hidden) return null;
  return (
    <div className="arrival-card-layer" role="status" aria-live="polite">
      <div
        key={serial}
        className="arrival-card"
        onAnimationEnd={() => clearArrival(serial)}
      >
        <span className="arrival-card-kicker">Arrived in</span>
        <strong className="arrival-card-name">{WORLDS[world].name}</strong>
      </div>
    </div>
  );
}
