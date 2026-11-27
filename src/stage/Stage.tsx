/**
 * The persistent stage: one fixed layer behind the portfolio holding the
 * game engine's canvas for the whole session. On portfolio routes the engine
 * is fetched on intent (hover, focus or touch on the "o", or the Play link),
 * warms itself hidden behind the opaque page, and only then is the "o"
 * allowed to open onto it. On /play it loads at once and enters the game by
 * itself, behind the loading mark (style.css) that this component drives.
 */
import { useEffect, useState, type ComponentType } from "react";
import { useStage } from "./contract";
import { peephole, usePeephole } from "./peephole/controller";
import { markBooted } from "./peephole/policy";
import { bootProgress, nextLoadStep, type LoadStep } from "./boot";

type EngineModule = {
  GameStage: ComponentType<{ autoEnter?: boolean }>;
  addRenderPass: Parameters<typeof import("./peephole/paperBridge").installPaper>[0];
  invalidateStage?: () => void;
};

export const RELOAD_KEY = "stage-reloaded";
const RETRY_DELAY_MS = 800;

let loading: Promise<EngineModule> | null = null;
async function importEngine(withPaper: boolean): Promise<EngineModule> {
  const [engine, paper] = await Promise.all([
    import("../game/engine"),
    withPaper ? import("./peephole/paperBridge") : Promise.resolve(null),
  ]);
  const mod = engine as unknown as EngineModule;
  paper?.installPaper(mod.addRenderPass, peephole, mod.invalidateStage);
  return mod;
}

function readReloaded() {
  try {
    return sessionStorage.getItem(RELOAD_KEY) !== null;
  } catch {
    return true; // storage denied: never risk a reload loop
  }
}

/**
 * The engine import, hardened: a failed chunk (a deploy replaced it, a flaky
 * network, an HTML error page where JavaScript was expected) is retried once
 * after 800 ms; a second failure on /play reloads the page once per session
 * (new HTML, new chunk names), and after that the caller shows the card.
 */
export function loadEngine(withPaper: boolean, allowReload: boolean): Promise<EngineModule | null> {
  loading ??= (async () => {
    let step: LoadStep = "first";
    for (;;) {
      try {
        const mod = await importEngine(withPaper);
        try {
          sessionStorage.removeItem(RELOAD_KEY);
        } catch {
          /* storage denied */
        }
        return mod;
      } catch (error) {
        step = nextLoadStep(step, { allowReload, reloaded: readReloaded() });
        if (step === "retry") {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
        if (step === "reload") {
          try {
            sessionStorage.setItem(RELOAD_KEY, "1");
          } catch {
            /* checked by readReloaded */
          }
          location.reload();
          return new Promise<never>(() => {});
        }
        console.warn("The 3D world could not be loaded.", error);
        throw error;
      }
    }
  })();
  const pending = loading;
  // A failed load is never memoised: "Try again" (or new intent) starts over.
  return pending.catch(() => {
    if (loading === pending) loading = null;
    return null;
  });
}

/** Shown when the engine chunk cannot be fetched even after the retries. */
function EngineUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="world-fallback stage-unavailable" role="alert">
      <h1>3D unavailable</h1>
      <p>
        The world could not be loaded. Your local progress is not reset.
      </p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
      <a href="/">Back to the portfolio</a>
    </div>
  );
}

export function Stage({ play }: { play: boolean }) {
  const [engine, setEngine] = useState<EngineModule | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mode = useStage((s) => s.mode);
  const ready = useStage((s) => s.ready);
  const skippable = usePeephole((s) => s.skippable);
  const announce = usePeephole((s) => s.announce);

  // Mirrored on <html> so page-level CSS (scroll locking) can follow the
  // stage: only the game locks the document; the portfolio scrolls.
  useEffect(() => {
    document.documentElement.dataset.stageMode = mode;
  }, [mode]);

  useEffect(() => {
    peephole.init();
    let alive = true;
    const load = () => {
      // Before the game's first save lands: from now on a save alone does
      // not make this visitor a returning player.
      if (!play) markBooted();
      void loadEngine(!play, play).then((m) => {
        if (!alive) return;
        if (m) {
          peephole.engineLoaded();
          setEngine(m);
        }
        else if (play) setFailed(true);
        else {
          // Portfolio page: back to a toy letter; the next intent tries again.
          peephole.engineFailed();
          setAttempt((n) => n + 1);
        }
      });
    };
    if (play) {
      load();
      return () => {
        alive = false;
      };
    }
    if (peephole.env?.webgl === false) return;
    // Portfolio routes: the engine loads on intent only.
    const stop = peephole.onInterest(load);
    return () => {
      alive = false;
      stop();
    };
  }, [play, attempt]);

  // A lazy chunk inside the engine failed to preload (usually a deploy
  // replaced it). Outside the game, reload once for fresh chunk names;
  // inside it, the failing feature reports its own error.
  useEffect(() => {
    const onPreloadError = () => {
      if (!play || useStage.getState().mode === "game" || readReloaded()) return;
      try {
        sessionStorage.setItem(RELOAD_KEY, "1");
      } catch {
        return;
      }
      location.reload();
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    return () => window.removeEventListener("vite:preloadError", onPreloadError);
  }, [play]);

  // Direct /play: drive the loading mark from real progress, then fade it
  // on the first presented frame (or drop it if it never had to show).
  useEffect(() => {
    if (!play) return;
    const root = document.documentElement;
    const preload = (window as unknown as { __enginePreload?: [string, number][] }).__enginePreload ?? [];
    const done = new Set<string>();
    let shown = 0;
    const write = () => {
      const next = bootProgress(preload, done, useStage.getState().warmProgress);
      // Monotonic: a late resource entry never moves the hairline back.
      shown = Math.max(shown, next);
      root.style.setProperty("--boot-p", `${(shown * 100).toFixed(1)}%`);
    };
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const path = new URL(entry.name, location.href).pathname;
          if (preload.some(([url]) => url === path)) done.add(path);
        }
        write();
      });
      observer.observe({ type: "resource", buffered: true });
    } catch {
      /* no resource timing: the warm-up still moves the hairline */
    }
    write();
    const stop = useStage.subscribe(write);
    return () => {
      observer?.disconnect();
      stop();
    };
  }, [play]);
  useEffect(() => {
    if (!play || (!ready && !failed)) return;
    const root = document.documentElement.classList;
    // 400 ms after navigation the mark starts to appear (style.css).
    root.add(failed || performance.now() < 400 ? "boot-skip" : "boot-done");
  }, [play, ready, failed]);

  return (
    <>
      <div
        className="stage-root"
        data-mode={mode}
        data-ready={ready ? "true" : "false"}
        aria-hidden={mode === "game" ? undefined : true}
      >
        {engine && <engine.GameStage autoEnter={play} />}
      </div>
      {failed && (
        <EngineUnavailable
          onRetry={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        />
      )}
      {skippable && (
        <button type="button" className="stage-skip" onClick={() => peephole.skip()}>
          Skip
        </button>
      )}
      <div className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>
      {play && !ready && !failed && (
        <div className="sr-only" role="status">
          Loading the world
        </div>
      )}
    </>
  );
}
