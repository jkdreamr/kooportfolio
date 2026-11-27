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

/**
 * A player's life: check the host answers at all (a blocked or offline host
 * would otherwise paint the browser's own error page inside the frame),
 * then load the frame behind a placeholder. Blocked, refused by a content
 * policy, or failing: the plain link-out instead.
 */
export type PlayerState = "checking" | "loading" | "ready" | "slow" | "failed";
export const showsFrame = (state: PlayerState) =>
  state === "loading" || state === "ready" || state === "slow";

function Player({ embed }: { embed: OwnerEmbed }) {
  const [state, setState] = useState<PlayerState>("checking");
  useEffect(() => {
    const controller = new AbortController();
    const host = new URL(embed.src).origin;
    // An opaque answer is enough: it proves the host is reachable from here.
    fetch(embed.src, {
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(() => setState((s) => (s === "checking" ? "loading" : s)))
      .catch(() => {
        if (!controller.signal.aborted) setState("failed");
      });
    const policy = (event: SecurityPolicyViolationEvent) => {
      if (event.blockedURI.startsWith(host)) setState("failed");
    };
    document.addEventListener("securitypolicyviolation", policy);
    const timer = window.setTimeout(
      () => setState((s) => (s === "loading" || s === "checking" ? "slow" : s)),
      EMBED_SLOW_MS,
    );
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener("securitypolicyviolation", policy);
    };
  }, [embed.src]);
  const video = embed.id === "youtube";
  return (
    <div
      className="listen-player"
      data-state={state}
      data-video={video || undefined}
    >
      <div
        className="listen-frame"
        style={video ? undefined : { height: embed.height }}
      >
        {state !== "ready" && (
          <div
            className="listen-placeholder"
            aria-hidden={state === "loading" || state === "checking"}
          >
            {state === "loading" || state === "checking" ? (
              <span className="listen-spinner">Loading {embed.label}…</span>
            ) : (
              <span>
                {state === "failed"
                  ? `The ${embed.label} player can’t load here.`
                  : `${embed.label} is taking a while.`}{" "}
                <a href={embed.href} target="_blank" rel="noreferrer">
                  Listen on {embed.label} ↗
                </a>
              </span>
            )}
          </div>
        )}
        {showsFrame(state) && (
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
            onLoad={() => setState((s) => (showsFrame(s) ? "ready" : s))}
          />
        )}
      </div>
      <a
        className="listen-out"
        href={embed.href}
        target="_blank"
        rel="noreferrer"
      >
        Open on {embed.label} ↗
        <span className="sr-only"> (opens in a new tab)</span>
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
                event.key === "ArrowRight"
                  ? 1
                  : event.key === "ArrowLeft"
                    ? -1
                    : 0;
              if (!step) return;
              event.preventDefault();
              const next =
                (index + step + OWNER_EMBEDS.length) % OWNER_EMBEDS.length;
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
