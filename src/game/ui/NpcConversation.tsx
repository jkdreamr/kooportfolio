import { useEffect, useRef } from "react";
import { villagers } from "../core/npcs";
import {
  advanceConversation,
  chooseNpcTopic,
  closeConversation,
  useNpcs,
} from "../core/npcState";
import { topicsFor } from "../core/npcTopics";
import { useGame, walkTo } from "../core/store";
import { destinations, destinationsInWorld } from "../core/world";
import { NpcIllustration } from "./NpcIllustration";
import "./npc-conversation.css";

export function NpcDialog() {
  const { talking, line, topic } = useNpcs();
  const world = useGame((game) => game.world);
  const visible = useGame(
    (game) => game.scene === "hub" && game.panel === "npc" && !game.paused,
  );
  const dialog = useRef<HTMLElement>(null);
  const npc = villagers.find((npc) => npc.id === talking);
  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement as HTMLElement | null;
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [visible]);
  useEffect(() => {
    if (!visible || !dialog.current) return;
    dialog.current.scrollTop = 0;
    dialog.current.querySelector("button")?.focus({ preventScroll: true });
  }, [visible, talking, line, topic]);
  if (!visible || !npc) return null;
  const moreLines = line < npc.lines.length - 1;
  const topics = moreLines ? [] : topicsFor(npc.id);
  const reply = topics.find((option) => option.id === topic);
  const place =
    destinationsInWorld(world).find(({ id }) => id === npc.place) ??
    destinations.find(({ id }) => id === npc.place)!;
  return (
    <div
      className="npc-conversation-layer"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeConversation();
      }}
    >
      <section
        ref={dialog}
        className={
          reply?.picture ? "npc-dialog npc-dialog-illustrated" : "npc-dialog"
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="npc-name"
        aria-describedby="npc-line"
        onKeyDown={(event) => {
          if (["ArrowUp", "ArrowDown", " "].includes(event.key))
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
        <div className="npc-reply">
          <p id="npc-line" aria-live="polite">
            {reply?.reply ?? npc.lines[line]}
          </p>
          {reply?.picture && <NpcIllustration picture={reply.picture} />}
        </div>
        {topics.length > 0 && !reply && (
          <div className="npc-topics" role="group" aria-label="Ask about">
            {topics.map((option) => (
              <button key={option.id} onClick={() => chooseNpcTopic(option.id)}>
                {option.label}
              </button>
            ))}
          </div>
        )}
        <div className="npc-dialog-actions">
          {(moreLines || !topics.length || reply) && (
            <button className="npc-continue" onClick={advanceConversation}>
              {reply ? "Back" : moreLines ? "Next" : "See you"}
              <kbd aria-hidden="true">E</kbd>
            </button>
          )}
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
