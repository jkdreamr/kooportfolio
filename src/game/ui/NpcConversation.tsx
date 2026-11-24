import { useEffect, useRef } from "react";
import { villagers } from "../core/npcs";
import {
  advanceConversation,
  closeConversation,
  useNpcs,
} from "../core/npcState";
import { useGame, walkTo } from "../core/store";
import { destinations } from "../core/world";
import "./npc-conversation.css";

export function NpcDialog() {
  const { talking, line } = useNpcs();
  const visible = useGame(
    (game) => game.scene === "hub" && game.panel === "npc" && !game.paused,
  );
  const next = useRef<HTMLButtonElement>(null);
  const npc = villagers.find((npc) => npc.id === talking);
  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement as HTMLElement | null;
    next.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [visible]);
  if (!visible || !npc) return null;
  const place = destinations.find(
    (destination) => destination.id === npc.place,
  )!;
  return (
    <div
      className="npc-conversation-layer"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeConversation();
      }}
    >
      <section
        className="npc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="npc-name"
        aria-describedby="npc-line"
        onKeyDown={(event) => {
          // Keep native scrolling available without sending movement to the world.
          if (event.key === "ArrowUp" || event.key === "ArrowDown")
            event.stopPropagation();
          if (event.key === "Escape") {
            event.stopPropagation();
            closeConversation();
          }
          if (event.key === "Tab") {
            const buttons = [...event.currentTarget.querySelectorAll("button")];
            const first = buttons[0],
              last = buttons.at(-1)!;
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="npc-speaker">
          <i style={{ backgroundColor: npc.color }} />
          <h2 id="npc-name">{npc.name}</h2>
        </div>
        <p id="npc-line" aria-live="polite">
          {npc.lines[line]}
        </p>
        <div className="npc-dialog-actions">
          <button ref={next} onClick={advanceConversation}>
            {line < npc.lines.length - 1 ? "Next" : "See you"}
            <kbd>E</kbd>
          </button>
          <button
            onClick={() => {
              closeConversation();
              walkTo(place.x, place.z);
            }}
          >
            Walk to {place.name} <span aria-hidden="true">↗</span>
          </button>
          <button className="npc-goodbye" onClick={closeConversation}>
            Bye
          </button>
        </div>
      </section>
    </div>
  );
}
