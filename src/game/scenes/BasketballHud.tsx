/**
 * The court HUD, moved out of `ui/Hud.tsx` (PLAN_GAMES J0) unchanged.
 * Owned by the basketball game.
 */
import { runtime } from "../core/store";
import { Icon } from "../ui/Icon";
import { Joystick } from "../ui/Joystick";
import { RoomStory } from "../ui/RoomStory";
import { CourtControls, useBasketHud } from "./Basketball";

function BasketHud() {
  const hud = useBasketHud();
  return (
    <>
      <div className="challenge-heading">
        <h1>Court</h1>
        <p className="touch-hint">Drag to move · hold & release to shoot</p>
      </div>
      <p className="court-keyboard-hint keyboard-hint">
        WASD move · Hold Space to charge, release to shoot · Q / E aim
      </p>
      <div className="basket-score">
        <div>
          <small>Time</small>
          <strong>
            {Math.ceil(hud.time)}
            <em>s</em>
          </strong>
        </div>
      </div>
      <div className="shot-feedback" aria-live="polite">
        {hud.feedback}
      </div>
      <div className="shot-panel">
        <div className="stamina-label">
          <span>{hud.holding ? "Shot power" : "Rebound"}</span>
          <span>{hud.holding ? "Hold & release" : "Next ball soon"}</span>
        </div>
        <div className="power-track">
          <i style={{ width: `${hud.charge * 100}%` }} />
          <b />
        </div>
        <p className="shot-instruction">Release in gold. Closer is easier.</p>
        <label className="aim-label">
          Aim{" "}
          <input
            aria-label="Adjust shot aim"
            type="range"
            min={-0.5}
            max={0.5}
            step={0.01}
            value={runtime.aim}
            onChange={(e) => {
              const a = Number(e.target.value);
              runtime.aim = a;
            }}
          />
          <button
            onClick={() => {
              runtime.aim = 0;
            }}
          >
            Recenter
          </button>
        </label>
        <button
          className="shoot-button"
          disabled={!hud.holding}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            runtime.shooting = true;
          }}
          onPointerUp={() => {
            runtime.shooting = false;
            runtime.shoot = true;
          }}
          onPointerCancel={() => {
            runtime.shooting = false;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.repeat) runtime.shooting = true;
          }}
          onKeyUp={(e) => {
            if (e.key === "Enter") {
              runtime.shooting = false;
              runtime.shoot = true;
            }
          }}
        >
          Hold & release <Icon name="ball" size={18} />
        </button>
      </div>
      <Joystick />
    </>
  );
}

/** Everything the HUD shows on the court. */
export function BasketballHud({ hidden }: { hidden: boolean }) {
  return (
    <>
      <BasketHud />
      <CourtControls />
      <RoomStory scene="basketball" hidden={hidden} />
    </>
  );
}
