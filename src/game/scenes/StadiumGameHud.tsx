import { useMemo, type RefObject } from "react";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { FIELD_GOAL } from "../core/fieldGoal";
import { useGame } from "../core/store";

export function StadiumGameHud({
  aim,
  onAim,
  score,
  attempt,
  flying,
  finished,
  message,
  meter,
  onKick,
  onClose,
}: {
  aim: number;
  onAim: (aim: number) => void;
  score: number;
  attempt: number;
  flying: boolean;
  finished: boolean;
  message: string;
  meter: RefObject<HTMLMeterElement | null>;
  onKick: () => void;
  onClose: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const hidden = useGame((s) => s.paused || s.panel !== "none");
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  return hidden ? null : (
    <Html
      fullscreen
      portal={portal}
      zIndexRange={[40, 40]}
      calculatePosition={(_object, _camera, size) => [
        size.width / 2,
        size.height / 2,
      ]}
    >
      <section className="stadium-game-stage" aria-label="49ers field goals">
        <div className="stadium-game-score">
          <strong>49ERS</strong>
          <span>{score * 3} PTS</span>
          <small>
            {attempt}/{FIELD_GOAL.attempts}
          </small>
        </div>
        <button
          className="stadium-game-close"
          type="button"
          onClick={onClose}
          aria-label="Close field goals"
        >
          Close
        </button>
        <div
          className="stadium-game-dock"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <p role="status" aria-live="polite">
            {finished
              ? `${message}. ${score} of ${FIELD_GOAL.attempts} made.`
              : message}
          </p>
          <div className="stadium-game-controls">
            <label className="stadium-game-aim">
              Aim
              <input
                aria-label="Kick aim"
                type="range"
                min={-18}
                max={18}
                step={0.5}
                value={aim}
                disabled={flying || finished}
                onChange={(event) => onAim(Number(event.target.value))}
              />
            </label>
            <div className="stadium-game-power">
              <span>Power</span>
              <meter
                ref={meter}
                aria-label="Kick power"
                min={0}
                max={1}
                low={0.55}
                high={0.9}
                optimum={0.7}
                defaultValue={0.575}
              />
            </div>
            <button type="button" disabled={flying} onClick={onKick}>
              {flying
                ? "In flight"
                : finished
                  ? "Play again"
                  : attempt === 0
                    ? "Kick"
                    : "Next kick"}
            </button>
          </div>
        </div>
      </section>
    </Html>
  );
}
