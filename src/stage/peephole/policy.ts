/**
 * Who is visiting and how gently to treat them. Pure functions over a small
 * environment snapshot so they are trivially testable; `readEnvironment()` is
 * the only part that touches the browser.
 */

/** Same key the game saves under (src/shared/save.ts). Duplicated so the
 * portfolio entry chunk does not import game code. */
export const SAVE_KEY = "joshua-exe-save-v1";
/** Set once the visitor has opened the page into the world in this browser. */
export const ENTERED_KEY = "joshua-koo-entered-v1";
/** Set when the stage boots the game behind the portfolio. The game writes
 * its save as soon as it boots, so from then on a save alone no longer means
 * the visitor has played; without this flag a save is a legacy player's. */
export const BOOTED_KEY = "joshua-koo-stage-booted-v1";

export type VisitEnvironment = {
  reducedMotion: boolean;
  saveData: boolean;
  /** navigator.connection.effectiveType, if known. */
  effectiveType?: string;
  /** Has a game save or has entered before. */
  returning: boolean;
  webgl: boolean;
};

export type VisitPolicy = {
  /** Fetch the engine chunk at idle without being asked. */
  preloadAtIdle: boolean;
  /** Physical drag/tear; false → a short dissolve straight to the game. */
  physical: boolean;
  /** The counter shows the world immediately when warm (no slow discovery fade). */
  instantCounter: boolean;
  /** Pull-length multiplier. */
  pullScale: number;
  /** Seconds of camera flight after the tear. */
  flightSeconds: number;
  /** The nav's Play link label. */
  playLabel: "Play" | "Continue";
  /** Seconds the counter takes to come alive once warm. */
  counterFade: number;
};

export function visitPolicy(env: VisitEnvironment): VisitPolicy {
  const slow = env.effectiveType === "2g" || env.effectiveType === "slow-2g";
  return {
    preloadAtIdle: env.webgl && !env.saveData && !slow,
    physical: !env.reducedMotion,
    instantCounter: env.returning,
    pullScale: env.returning ? 0.6 : 1,
    flightSeconds: env.reducedMotion ? 0 : env.returning ? 2.2 : 4.6,
    playLabel: env.returning ? "Continue" : "Play",
    counterFade: env.reducedMotion ? 0.4 : env.returning ? 0.5 : 1.2,
  };
}

type ConnectionLike = { saveData?: boolean; effectiveType?: string };

/** API presence only, the same check the game makes. A throwaway probe
 * context cost a second WebGL context (and a lost one) on every load; a real
 * creation failure still reaches the game's fallback card. */
function hasWebGL() {
  try {
    return typeof WebGL2RenderingContext !== "undefined";
  } catch {
    return false;
  }
}

export function readEnvironment(): VisitEnvironment {
  const nav = navigator as Navigator & { connection?: ConnectionLike };
  let returning = false;
  try {
    returning = isReturning(
      localStorage.getItem(SAVE_KEY) !== null,
      localStorage.getItem(ENTERED_KEY) !== null,
      localStorage.getItem(BOOTED_KEY) !== null,
    );
  } catch {
    returning = false;
  }
  return {
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: !!nav.connection?.saveData,
    effectiveType: nav.connection?.effectiveType,
    returning,
    webgl: hasWebGL(),
  };
}

/** Entered before, or holds a save from before the stage booted games silently. */
export function isReturning(hasSave: boolean, entered: boolean, booted: boolean) {
  return entered || (hasSave && !booted);
}

export function markBooted() {
  try {
    if (localStorage.getItem(SAVE_KEY) === null) localStorage.setItem(BOOTED_KEY, "1");
  } catch {
    /* storage denied */
  }
}

export function markEntered() {
  try {
    localStorage.setItem(ENTERED_KEY, "1");
  } catch {
    /* storage denied: the visitor simply stays a first-timer */
  }
}

/** Routes the portfolio owns (anything else under /play is the game). */
export function isPlayPath(pathname: string) {
  return /^\/play(\/|$)/.test(pathname);
}
