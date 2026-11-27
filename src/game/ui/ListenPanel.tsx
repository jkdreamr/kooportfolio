import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { OWNER_EMBEDS, type OwnerEmbed } from "../../content/links";
import "./listen.css";

type EmbedId = OwnerEmbed["id"];
/** Seconds before a player that has not loaded offers the plain link. */
export const EMBED_SLOW_MS = 10_000;

export const useListen = create<{ open: boolean; tab: EmbedId }>(() => ({
  open: false,
  tab: "soundcloud",
}));
export const openListen = (tab: EmbedId = "soundcloud") =>
  useListen.setState({ open: true, tab });
export const closeListen = () => useListen.setState({ open: false });

/**
 * Asks the game's own audio to step aside while a player is open. The audio
 * engine (sound workstream) listens for this window event and holds a duck
 * until `on: false`; nothing here touches the visitor's mute preference.
 */
export function holdGameAudio(on: boolean) {
  window.dispatchEvent(
    new CustomEvent("stage-audio-hold", { detail: { source: "listen", on } }),
  );
}

function Player({ embed }: { embed: OwnerEmbed }) {
  const [state, setState] = useState<"loading" | "ready" | "slow">("loading");
  useEffect(() => {
    const timer = window.setTimeout(
      () => setState((s) => (s === "loading" ? "slow" : s)),
      EMBED_SLOW_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);
  const video = embed.id === "youtube";
  return (
    <div className="listen-player" data-state={state} data-video={video || undefined}>
      <div
        className="listen-frame"
        style={video ? undefined : { height: embed.height }}
      >
        {state !== "ready" && (
          <div className="listen-placeholder" aria-hidden={state === "loading"}>
            {state === "loading" ? (
              <span className="listen-spinner">Loading {embed.label}…</span>
            ) : (
              <span>
                {embed.label} is taking a while (it may be blocked here).{" "}
                <a href={embed.href} target="_blank" rel="noreferrer">
                  Open it on {embed.label} ↗
                </a>
              </span>
            )}
          </div>
        )}
        <iframe
          key={embed.id}
          src={embed.src}
          title={embed.title}
          loading="lazy"
          allow={
            video
              ? "encrypted-media; picture-in-picture; fullscreen"
              : "encrypted-media; clipboard-write"
          }
          allowFullScreen={video}
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setState("ready")}
        />
      </div>
      <a className="listen-out" href={embed.href} target="_blank" rel="noreferrer">
        Open on {embed.label} ↗<span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  );
}

/**
 * The Listen panel's body: tabs for SoundCloud (his whole catalogue),
 * Spotify and YouTube. Only the open tab's player exists, it is created
 * when the panel opens and removed when it closes, and nothing autoplays.
 */
export function ListenTabs({ onClose }: { onClose: () => void }) {
  const tab = useListen((s) => s.tab);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    holdGameAudio(true);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("keydown", escape, true);
      holdGameAudio(false);
    };
  }, [onClose]);
  const active = OWNER_EMBEDS.find((e) => e.id === tab) ?? OWNER_EMBEDS[0];
  return (
    <div className="listen-panel">
      <p className="listen-intro">
        Josh’s music, live from where he posts it. Nothing plays until you press
        play.
      </p>
      <div className="listen-tabs" role="tablist" aria-label="Where to listen">
        {OWNER_EMBEDS.map((embed, index) => (
          <button
            key={embed.id}
            ref={(el) => {
              tabs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`listen-tab-${embed.id}`}
            aria-selected={embed.id === tab}
            aria-controls="listen-tabpanel"
            tabIndex={embed.id === tab ? 0 : -1}
            onClick={() => useListen.setState({ tab: embed.id })}
            onKeyDown={(event) => {
              const step =
                event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              if (!step) return;
              event.preventDefault();
              const next = (index + step + OWNER_EMBEDS.length) % OWNER_EMBEDS.length;
              useListen.setState({ tab: OWNER_EMBEDS[next].id });
              tabs.current[next]?.focus();
            }}
          >
            {embed.label}
          </button>
        ))}
      </div>
      <div
        id="listen-tabpanel"
        role="tabpanel"
        aria-labelledby={`listen-tab-${active.id}`}
      >
        <Player key={active.id} embed={active} />
      </div>
    </div>
  );
}
