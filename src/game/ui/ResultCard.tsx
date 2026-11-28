import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { MedalRow } from "./MedalRow";
import { QueuedStamps } from "./Passport";
import { isMedalGame } from "../core/medals";

/** Score count-up: 600 ms on the shared ease, skipped with reduced motion. */
export const COUNT_MS = 600;
/** cubic-bezier(.2,.8,.2,1), solved for y at time t (0..1). */
export function easeOut(t: number) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // Newton on x(u) = 3(1-u)^2 u·0.2 + 3(1-u)u^2·0.2 + u^3 = t.
  let u = t;
  for (let i = 0; i < 6; i++) {
    const x = 0.6 * (1 - u) * (1 - u) * u + 0.6 * (1 - u) * u * u + u * u * u - t;
    const dx = 0.6 * (1 - u) * (1 - 3 * u) + 0.6 * u * (2 - 3 * u) + 3 * u * u;
    if (Math.abs(dx) < 1e-6) break;
    u = Math.min(1, Math.max(0, u - x / dx));
  }
  return 2.4 * (1 - u) * (1 - u) * u + 3 * (1 - u) * u * u + u * u * u;
}
/** The number shown `elapsed` ms into the count-up to `score`. */
export const countAt = (score: number, elapsed: number) =>
  Math.round(score * easeOut(elapsed / COUNT_MS));

function useCountUp(score: number | undefined) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(reduced || score === undefined ? score : 0);
  useEffect(() => {
    if (score === undefined || reduced) return;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      setShown(countAt(score, elapsed));
      if (elapsed < COUNT_MS) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [score, reduced]);
  return score === undefined ? undefined : reduced ? score : shown;
}

/**
 * One result layout for every game: title, the score counting up, a
 * "New best" chip, the game's medals and what the next one needs (when
 * `game` is given), stamps earned during the run, "Play again" (focused, so
 * Enter replays) and a quiet way back (Escape does the same).
 */
export function ResultCard({
  score,
  unit,
  detail,
  best,
  game,
  variant,
  daily,
  onReplay,
  onBack,
  backLabel,
}: {
  score?: number;
  unit?: string;
  detail?: string;
  best?: boolean;
  /** Medal game id (core/medals.ts); without one there is no medal row. */
  game?: string;
  variant?: string;
  /** A Daily Three task this run finished ("Daily task done"). */
  daily?: string;
  onReplay: () => void;
  onBack: () => void;
  backLabel: string;
}) {
  const replay = useRef<HTMLButtonElement>(null);
  const shown = useCountUp(score);
  useEffect(() => {
    const frame = requestAnimationFrame(() => replay.current?.focus());
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onBack();
    };
    window.addEventListener("keydown", escape, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", escape, true);
    };
  }, [onBack]);
  return (
    <div className="result-card">
      {score !== undefined && (
        <p className="result-score" aria-label={`${score}${unit ? ` ${unit}` : ""}`}>
          <span aria-hidden="true">{shown}</span>
          {unit && (
            <small aria-hidden="true">
              {" "}
              {unit}
            </small>
          )}
          {best && <b className="result-best">New best</b>}
        </p>
      )}
      {detail && <p className="result-detail">{detail}</p>}
      {isMedalGame(game) && <MedalRow game={game} variant={variant} />}
      {daily && <p className="result-daily">Daily task done: {daily}</p>}
      <QueuedStamps />
      <button ref={replay} className="primary-button" onClick={onReplay}>
        Play again <Icon name="arrow" size={17} />
      </button>
      <button className="quiet-button" onClick={onBack}>
        {backLabel}
      </button>
    </div>
  );
}
