import { useEffect, useRef, useState } from "react";
import { roomStories } from "../../content/room-stories";
import type { PlaceId } from "../core/world";
import { Icon } from "./Icon";

export function RoomStory({
  scene,
  hidden = false,
}: {
  scene: PlaceId;
  hidden?: boolean;
}) {
  const [state, setState] = useState<"prompt" | "read" | "closed">("prompt");
  const close = useRef<HTMLButtonElement>(null);
  const story = roomStories[scene];
  useEffect(() => {
    if (state === "read") close.current?.focus();
  }, [state]);
  if (!story || state === "closed") return null;
  return (
    <aside
      hidden={hidden}
      className={`room-story ${state === "read" ? "is-reading" : ""}`}
      aria-label="About Josh"
      onKeyDown={(e) => {
        if (e.key === " ") e.stopPropagation();
        if (e.key === "Escape") {
          e.stopPropagation();
          setState("closed");
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " ") e.stopPropagation();
      }}
    >
      <button
        ref={close}
        className="story-close"
        aria-label="Dismiss Josh’s story"
        onClick={() => setState("closed")}
      >
        <Icon name="close" size={16} />
      </button>
      {state === "prompt" ? (
        <>
          <p>About Josh</p>
          <button
            className="story-read"
            aria-label="Read about Josh"
            onClick={() => setState("read")}
          >
            <span className="story-read-default">Read</span>
            <span className="story-read-compact">About Josh</span>
            <Icon name="arrow" size={16} />
          </button>
        </>
      ) : (
        <>
          <h2>Josh</h2>
          <p>{story.text}</p>
          <a href={story.link} target="_blank" rel="noreferrer">
            {story.label} ↗
          </a>
        </>
      )}
    </aside>
  );
}
