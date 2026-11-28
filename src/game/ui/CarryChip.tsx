/**
 * The carry chip (PLAN_GAMES §5.2), contract skeleton (J0). Not mounted yet:
 * WS-M supplies the data through its `useCarry()` hook and the HUD renders
 *
 *   {carry && <CarryChip {...carry} />}
 *
 * once M5 lands. The props are the fixed contract; the look is J's (J1+).
 *
 *   [icon]  Library book ×2                         [Use  E] [Drop  Q]
 *           Return to the book drop by the quad  ·  38 m  ↗
 *
 * `distance` and `bearing` may be getters: the chip then polls them five
 * times a second and writes the text and the arrow's rotation straight to
 * the DOM, so walking never re-renders React.
 */
import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import "./carry-chip.css";

export type CarryUse = {
  /** The best contextual action here and now ("Read", "Feed the ducks"). */
  label: string;
  /** Greyed, with `reason` ("Nothing to use it on here"). */
  disabled?: boolean;
  reason?: string;
};

export type CarryChipProps = {
  /** Item kind, also its glyph ("book", "basket", "parcel", "ramen", "fish",
   * "megaphone", "ball", "acorn", "persimmon", "apple", "key"). */
  icon: string;
  /** "Library book". */
  name: string;
  /** How many are carried (shown as "×n" above 1). */
  count: number;
  /** Line 2: what it is for ("Return to the book drop by the quad"), or
   * quest progress ("Baskets to the market 2/3"). */
  purpose: string;
  /** Metres to the nearest destination; null when there is none. */
  distance: number | null | (() => number | null);
  /** Screen-space bearing to it in radians, 0 = straight up the screen,
   * clockwise positive (from the camera's yaw). */
  bearing: number | (() => number);
  /** Omitted when the item has no use at all. */
  use?: CarryUse;
  onUse: () => void;
  onDrop: () => void;
  /** Tapping the chip: set the walk target to the destination. */
  onShow: () => void;
};

const POLL_MS = 200;
const read = <T,>(v: T | (() => T)): T => (typeof v === "function" ? (v as () => T)() : v);
const metres = (d: number | null) => (d === null || !Number.isFinite(d) ? "" : `${Math.max(0, Math.round(d))} m`);

export function CarryChip({ icon, name, count, purpose, distance, bearing, use, onUse, onDrop, onShow }: CarryChipProps) {
  const dist = useRef<HTMLSpanElement>(null),
    arrow = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const paint = () => {
      const d = read(distance);
      if (dist.current) dist.current.textContent = metres(d);
      if (arrow.current) {
        arrow.current.hidden = d === null;
        arrow.current.style.transform = `rotate(${read(bearing).toFixed(3)}rad)`;
      }
    };
    paint();
    if (typeof distance !== "function" && typeof bearing !== "function") return;
    const id = setInterval(paint, POLL_MS);
    return () => clearInterval(id);
  }, [distance, bearing]);
  return (
    <div className="carry-chip" role="status" data-item={icon}>
      <button type="button" className="carry-chip-show" onClick={onShow} aria-label={`In your hands: ${name}. ${purpose}. Show me where`}>
        <span className="carry-chip-icon" aria-hidden="true">
          <Icon name={icon} size={22} />
        </span>
        <span className="carry-chip-text">
          <b>
            <span className="carry-chip-hands">Hands:</span> {name}
            {count > 1 && <small> ×{count}</small>}
          </b>
          <span>
            {purpose}
            <span className="carry-chip-distance" ref={dist} />
            <span className="carry-chip-arrow" ref={arrow} aria-hidden="true">
              ↑
            </span>
          </span>
        </span>
      </button>
      {use && (
        <button type="button" className="carry-chip-use" disabled={use.disabled} title={use.disabled ? use.reason : undefined} onClick={onUse}>
          {use.label} <kbd>E</kbd>
        </button>
      )}
      <button type="button" className="carry-chip-drop" onClick={onDrop}>
        Drop <kbd>Q</kbd>
      </button>
    </div>
  );
}
