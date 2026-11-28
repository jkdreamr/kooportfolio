import { useEffect, useRef, useState } from "react";
import { villagers, type Villager } from "../core/npcs";
import {
  advanceConversation,
  chooseNpcTopic,
  closeConversation,
  currentChoice,
  setAdvanceGuard,
  useNpcs,
} from "../core/npcState";
import type { Mood, Say } from "../core/npcConversation";
// Loads (and registers) the villagers' lines with the dialog chunk.
import "../core/npcConversation";
import { usePortrait } from "../core/npcPortrait";
import { useGame } from "../core/store";
import { NpcIllustration } from "./NpcIllustration";
import { prefersReducedMotion } from "./motion";
import "./npc-conversation.css";

/** Characters revealed per second by the typewriter. */
const REVEAL_RATE = 48;

/** The line on screen: the chosen reply, the script's line, or (at a choice
 * point) the line that asked. */
function lineOnScreen(): { say: Say | undefined; asking: boolean } {
  const { script, line, sub } = useNpcs.getState();
  const choice = currentChoice();
  if (choice) return { say: choice.reply[sub], asking: false };
  const step = script?.[line];
  if (!step) return { say: undefined, asking: false };
  if ("say" in step) return { say: step.say, asking: false };
  for (let i = line - 1; i >= 0; i--) {
    const prev = script![i];
    if ("say" in prev) return { say: prev.say, asking: true };
  }
  return { say: undefined, asking: true };
}

export function NpcDialog() {
  const { talking, script, line, topic, sub } = useNpcs();
  const visible = useGame(
    (game) => game.scene === "hub" && game.panel === "npc" && !game.paused,
  );
  const npc = villagers.find((npc) => npc.id === talking);
  const step = script?.[line];
  const choice = topic ? currentChoice() : undefined;
  const { say, asking } = lineOnScreen();
  const text = say?.text ?? "";
  const options = step && "ask" in step && !topic ? step.ask : null;
  const last = !!script && line === script.length - 1 && !topic;
  const key = `${talking}:${line}:${topic}:${sub}`;
  const [shown, setShown] = useState({ key: "", count: 0 });
  const count = shown.key === key ? shown.count : asking ? text.length : 0;
  const revealing = count < text.length;
  const box = useRef<HTMLDivElement>(null);
  const reveal = useRef({ revealing, finish: () => {} });
  reveal.current.revealing = revealing;
  reveal.current.finish = () => setShown({ key, count: text.length });

  // Typewriter (reduced motion: the whole line at once).
  useEffect(() => {
    if (!visible || asking) return;
    if (prefersReducedMotion()) {
      setShown({ key, count: text.length });
      return;
    }
    const start = performance.now();
    const timer = window.setInterval(() => {
      const next = Math.min(
        text.length,
        Math.ceil(((performance.now() - start) / 1000) * REVEAL_RATE),
      );
      setShown({ key, count: next });
      if (next >= text.length) window.clearInterval(timer);
    }, 32);
    return () => window.clearInterval(timer);
  }, [key, text, visible, asking]);

  // E (global), tap, Space and Enter first finish the line, then advance.
  useEffect(() => {
    if (!visible) return;
    setAdvanceGuard(() => {
      if (!reveal.current.revealing) return false;
      reveal.current.finish();
      return true;
    });
    return () => setAdvanceGuard(null);
  }, [visible]);

  // Keys work wherever focus is: E/Space/Enter advance, 1–3 choose, Esc ends.
  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat)
        return;
      const k = event.key.toLowerCase();
      const onButton =
        event.target instanceof Element &&
        !!event.target.closest("button, a") &&
        !event.target.closest(".npc-say");
      if (k === "escape") {
        closeConversation();
        return;
      }
      if (k === "e" || ((k === " " || k === "enter") && !onButton)) {
        event.preventDefault();
        event.stopPropagation();
        advanceConversation();
        return;
      }
      const index = Number(k) - 1;
      const { script, line, topic } = useNpcs.getState();
      const at = script?.[line];
      if (
        index >= 0 &&
        index < 3 &&
        at &&
        "ask" in at &&
        !topic &&
        !reveal.current.revealing
      ) {
        const option = at.ask[index];
        if (!option) return;
        event.preventDefault();
        event.stopPropagation();
        chooseNpcTopic(option.id);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [visible]);

  // Focus: the line (advance) or the first choice; give it back on close.
  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement as HTMLElement | null;
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [visible]);
  const showChoices = !!options && !revealing;
  useEffect(() => {
    if (!visible || !box.current) return;
    const target = showChoices
      ? box.current.querySelector<HTMLElement>(".npc-choices button")
      : box.current.querySelector<HTMLElement>(".npc-say");
    target?.focus({ preventScroll: true });
  }, [visible, key, showChoices]);

  if (!visible || !npc || !script) return null;
  const mood: Mood = say?.mood ?? "neutral";
  return (
    <div className="npc-conversation-layer">
      <div className="npc-dim" aria-hidden="true" />
      <section
        ref={box}
        className="npc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="npc-name"
        style={{ "--npc-accent": npc.color } as React.CSSProperties}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const buttons = [...event.currentTarget.querySelectorAll("button")];
          const first = buttons[0],
            lastButton = buttons.at(-1)!;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            lastButton.focus();
          } else if (!event.shiftKey && document.activeElement === lastButton) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        {showChoices && (
          <div className="npc-choices" role="group" aria-label="Reply">
            {options.map((option, i) => (
              <button
                key={option.id}
                className={
                  option.deed ? "is-deed" : option.end ? "is-end" : undefined
                }
                onClick={() => chooseNpcTopic(option.id)}
              >
                <kbd aria-hidden="true">{i + 1}</kbd>
                <span>{option.label}</span>
                {option.deed && <span aria-hidden="true">↗</span>}
              </button>
            ))}
          </div>
        )}
        <div className="npc-box">
          <NpcPortrait npc={npc} mood={mood} />
          <h2 id="npc-name" className="npc-nameplate">
            {npc.name}
          </h2>
          <div className="npc-body">
            <button
              type="button"
              className="npc-say"
              onClick={() => {
                if (options && !revealing) return;
                advanceConversation();
              }}
              aria-label={options && !revealing ? text : undefined}
              aria-describedby="npc-line-live"
            >
              <span className="npc-say-text" aria-hidden="true">
                <span>{text.slice(0, count)}</span>
                <span className="npc-say-rest">{text.slice(count)}</span>
              </span>
              {!revealing && !options && (
                <span className="npc-next" aria-hidden="true">
                  {last ? "■" : "▼"}
                </span>
              )}
              <span className="npc-sr">
                {options ? "" : last ? "Press to finish" : "Press to continue"}
              </span>
            </button>
            {choice?.picture && <NpcIllustration picture={choice.picture} />}
          </div>
          <p id="npc-line-live" className="npc-sr" aria-live="polite">
            {text}
          </p>
          <button
            type="button"
            className="npc-goodbye"
            onClick={closeConversation}
          >
            Bye<kbd aria-hidden="true">Esc</kbd>
          </button>
        </div>
      </section>
    </div>
  );
}

/** The speaker: a snapshot of their own rig when the world could take one,
 * otherwise a drawn bust from their palette. Mood adds a small reaction. */
function NpcPortrait({ npc, mood }: { npc: Villager; mood: Mood }) {
  const src = usePortrait((p) => (p.id === npc.id ? p.src : null));
  return (
    <div className={`npc-portrait is-${mood}`} aria-hidden="true">
      {src ? (
        <img src={src} alt="" draggable={false} />
      ) : (
        <DrawnBust npc={npc} mood={mood} />
      )}
      {mood === "surprised" && <span className="npc-portrait-mark">!</span>}
      {mood === "happy" && <span className="npc-portrait-mark is-note">♪</span>}
    </div>
  );
}

function DrawnBust({ npc, mood }: { npc: Villager; mood: Mood }) {
  const mouth =
    mood === "happy" ? (
      <path
        d="M43 62 Q50 69 57 62"
        fill="none"
        stroke="#3a2420"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    ) : mood === "surprised" ? (
      <ellipse cx="50" cy="64" rx="3.4" ry="4.2" fill="#3a2420" />
    ) : (
      <path
        d="M44 63 L56 63"
        stroke="#3a2420"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    );
  const eyeRy = mood === "surprised" ? 4 : 3.2;
  return (
    <svg viewBox="0 0 100 100" role="presentation">
      <path d="M14 100 Q16 78 50 76 Q84 78 86 100 Z" fill={npc.color} />
      <rect x="43" y="66" width="14" height="14" rx="5" fill={npc.skin} />
      <circle cx="50" cy="50" r="22" fill={npc.skin} />
      <path
        d="M28 46 Q30 24 50 24 Q70 24 72 46 Q62 36 50 37 Q38 36 28 46 Z"
        fill="#3b2a22"
      />
      {npc.hat && (
        <path
          d="M24 38 Q26 18 50 18 Q74 18 76 38 Z M20 38 H80 V42 H20 Z"
          fill={npc.color}
          stroke="#0003"
        />
      )}
      <ellipse cx="42" cy="52" rx="2.6" ry={eyeRy} fill="#24170f" />
      <ellipse cx="58" cy="52" rx="2.6" ry={eyeRy} fill="#24170f" />
      {mood === "happy" && (
        <>
          <circle cx="36" cy="60" r="3.4" fill="#e8737355" />
          <circle cx="64" cy="60" r="3.4" fill="#e8737355" />
        </>
      )}
      {mouth}
    </svg>
  );
}
