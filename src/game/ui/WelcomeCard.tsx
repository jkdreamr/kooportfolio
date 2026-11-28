import { useEffect, useRef, useState } from "react";
import { useGame } from "../core/store";
import { useArrival } from "../core/arrival";
import { qaEnabled } from "../../stage/qa";
import { Icon } from "./Icon";
import "./welcome-card.css";

/** Memory flag in the save: the welcome card has been seen and closed. */
export const WELCOME_SEEN = "seen:welcome";
/** Let the arrival settle (fly-in, HUD reveal, arrival title) first. */
const WELCOME_DELAY_MS = 900;

/** QA runs opt out (scripts/qa/lib.mjs sets this): the card is modal. */
function qaSkips() {
  try {
    return qaEnabled() && localStorage.getItem("qa-no-welcome") === "1";
  } catch {
    return false;
  }
}

/**
 * Opens the welcome card once per save: on the first visit, when the hub is
 * on screen and nothing else is (no panel, pause, journey or arrival card).
 * Closing it any way (button, Esc, ✕) stores the seen flag.
 */
export function useWelcome(live: boolean): boolean {
  const seen = useGame((s) => s.save.memories.includes(WELCOME_SEEN));
  const panel = useGame((s) => s.panel);
  const arriving = useArrival((s) => !!s.world);
  const ready = useGame(
    (s) => s.scene === "hub" && !s.paused && !s.traveling && !s.overlayLocked && s.panel === "none",
  );
  const [skip] = useState(qaSkips);
  useEffect(() => {
    if (seen || skip || !live || !ready || arriving) return;
    const timer = window.setTimeout(() => {
      const s = useGame.getState();
      if (s.panel === "none" && !s.paused && s.scene === "hub")
        useGame.setState({ panel: "welcome" });
    }, WELCOME_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [seen, skip, live, ready, arriving]);
  // Remember it on the way out, however it was closed.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (panel === "welcome") wasOpen.current = true;
    else if (wasOpen.current) {
      wasOpen.current = false;
      useGame.getState().remember(WELCOME_SEEN);
    }
  }, [panel]);
  /** True until the card is done with: first-visit hints wait for it. */
  return !seen && !skip;
}

const DOES: readonly { icon: string; text: React.ReactNode }[] = [
  {
    icon: "avatar",
    text: (
      <>
        <span className="keyboard-hint">Walk with WASD, or click the ground</span>
        <span className="touch-hint">Walk with the stick, or tap the ground</span>
      </>
    ),
  },
  {
    icon: "travel",
    text: (
      <>
        Three worlds, <b>Home</b>, <b>Stanford</b> and <b>Korea</b>: fly, take the
        train, or open <b>Travel</b>
      </>
    ),
  },
  {
    icon: "ball",
    text: (
      <>
        Games: Banner Rush at the Town Hall, basketball, rowing, skate, field goals,
        Beat Lab, badminton and more
      </>
    ),
  },
  { icon: "home", text: <>Houses to explore, with things to use and find</> },
  {
    icon: "star",
    text: (
      <>
        <b>Passport</b> stamps <kbd>P</kbd> and the Daily Three
      </>
    ),
  },
  { icon: "parcel", text: <>Pick things up and deliver them</> },
];

/** The card's body; Hud wraps it in its Modal (focus trap, Esc, ✕). */
export function WelcomeCard({
  close,
  showAround,
}: {
  close: () => void;
  showAround: () => void;
}) {
  return (
    <div className="welcome-card">
      <ul className="welcome-does">
        {DOES.map((line) => (
          <li key={line.icon}>
            <span className="welcome-icon" aria-hidden="true">
              <Icon name={line.icon} size={17} />
            </span>
            <span>{line.text}</span>
          </li>
        ))}
      </ul>
      <section className="welcome-josh" aria-labelledby="welcome-josh-title">
        <h3 id="welcome-josh-title">
          <Icon name="memories" size={16} />
          Getting to know Josh
        </h3>
        <p>
          Tap <b>Josh</b> in the bottom dock, or read the <b>Bulletin</b> board. The
          houses tell his story: the <b>Study</b> (work), the <b>Beat Lab</b> (music
          as kelix) and <b>Writing</b>. <b>Portfolio</b> takes you back to the plain
          site.
        </p>
      </section>
      <div className="welcome-actions">
        <button type="button" className="primary-button" onClick={close}>
          Let&rsquo;s go
          <Icon name="arrow" size={17} />
        </button>
        <button type="button" className="quiet-button" onClick={showAround}>
          Show me around
        </button>
      </div>
    </div>
  );
}
