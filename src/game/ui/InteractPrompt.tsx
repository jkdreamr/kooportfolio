import { useEffect, useRef, useState } from "react";
import { activateFocused, discoveryRoomId, useInteractables, verbOf, type Interactable } from "../core/interactables";
import { useRoomProgress } from "../core/discoveries";
import { closeCard, useRoomLife } from "../scenes/life/lifeStore";
import { useGame } from "../core/store";
import { Icon } from "./Icon";
import "./interact.css";

/**
 * The prompt for the thing in reach ("Record player · E Play record") and
 * the short card a readable thing shows. Shares the door prompt's look and
 * place; that prompt wins whenever it has something to say (`near`).
 * The button is the touch target: 44 px tall on coarse pointers.
 */
export function InteractPrompt({ near }: { near: string }) {
  const focus = useInteractables((s) => s.focus);
  // Re-read the verb after each use (toggles change theirs).
  useInteractables((s) => s.uses);
  const card = useRoomLife((s) => s.card);
  // Keep the last item's words while the prompt fades out.
  const [shown, setShown] = useState<Interactable | null>(null);
  useEffect(() => {
    if (focus) setShown(focus);
  }, [focus]);
  // A card belongs to the thing it came from: walk away and it closes.
  useEffect(() => {
    if (card && (!focus || focus.room !== card.room || focus.id !== card.id)) closeCard();
  }, [card, focus]);
  const visible = !!focus && !near;
  const item = focus ?? shown;
  const open = !!card && visible && card.room === focus?.room && card.id === focus?.id;
  return (
    <div className={`context-action interact-prompt${visible ? " visible" : ""}`} data-action={visible ? `life:${item?.id}` : undefined} aria-hidden={!visible} style={{ zIndex: 20 }}>
      {open && card && (
        <aside className="life-card" role="status" aria-live="polite">
          <h2>{card.title}</h2>
          <p>{card.text}</p>
          <button type="button" className="life-card-close" aria-label="Close" onClick={() => closeCard()}>
            <Icon name="close" size={16} />
          </button>
        </aside>
      )}
      <div>
        <strong>{item?.label}</strong>
      </div>
      <button type="button" tabIndex={visible ? 0 : -1} onClick={() => activateFocused("button")}>
        <kbd>E</kbd>
        {item ? verbOf(item) : ""} <Icon name="arrow" size={17} />
      </button>
    </div>
  );
}

/** "✦ 3/8": what has been found in this room. Pulses on a new find. */
export function RoomFinds({ scene }: { scene: string }) {
  const world = useGame((s) => s.world);
  const roomId = discoveryRoomId(world, scene);
  const { found, total } = useRoomProgress(roomId);
  const last = useRef(found);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (found > last.current) setPulse((n) => n + 1);
    last.current = found;
  }, [found]);
  if (!total) return null;
  const done = found === total;
  return (
    <span
      key={pulse}
      className={`room-finds${done ? " is-complete" : ""}`}
      data-pulse={pulse > 0 || undefined}
      role="img"
      aria-label={`${found} of ${total} things discovered in this room`}
      title={done ? "Everything here discovered" : `${found} of ${total} discovered: look for the sparkles`}
    >
      <i aria-hidden="true">✦</i>
      <b aria-hidden="true">
        {found}/{total}
      </b>
      <span className="room-finds-word" aria-hidden="true">
        {" "}
        discovered
      </span>
    </span>
  );
}
