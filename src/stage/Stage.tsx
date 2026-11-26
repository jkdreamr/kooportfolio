/**
 * The persistent stage: one fixed layer behind the portfolio holding the
 * game engine's canvas for the whole session. On "/" the engine is fetched
 * at idle (unless the visitor saves data), warms itself hidden behind the
 * opaque page, and only then is the "o" allowed to open onto it. On /play it
 * loads at once and enters the game by itself.
 */
import { useEffect, useState, type ComponentType } from "react";
import { useStage } from "./contract";
import { peephole, usePeephole } from "./peephole/controller";
import { markBooted } from "./peephole/policy";

type EngineModule = {
  GameStage: ComponentType<{ autoEnter?: boolean }>;
  addRenderPass: Parameters<typeof import("./peephole/paperBridge").installPaper>[0];
};

let loading: Promise<EngineModule> | null = null;
function loadEngine(withPaper: boolean): Promise<EngineModule> {
  loading ??= (async () => {
    const [engine, paper] = await Promise.all([
      import("../game/engine"),
      withPaper ? import("./peephole/paperBridge") : Promise.resolve(null),
    ]);
    const mod = engine as unknown as EngineModule;
    paper?.installPaper(mod.addRenderPass, peephole);
    return mod;
  })();
  return loading;
}

function whenIdle(cb: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(cb, { timeout: 2500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(cb, 1200);
  return () => clearTimeout(id);
}

export function Stage({ play }: { play: boolean }) {
  const [engine, setEngine] = useState<EngineModule | null>(null);
  const mode = useStage((s) => s.mode);
  const ready = useStage((s) => s.ready);
  const skippable = usePeephole((s) => s.skippable);
  const announce = usePeephole((s) => s.announce);

  useEffect(() => {
    peephole.init();
    let alive = true;
    const load = () => {
      // Before the game's first save lands: from now on a save alone does
      // not make this visitor a returning player.
      if (!play) markBooted();
      void loadEngine(!play).then((m) => {
        if (alive) setEngine(m);
      });
    };
    if (play) {
      load();
      return () => {
        alive = false;
      };
    }
    const policy = peephole.policy;
    if (!policy?.preloadAtIdle && peephole.env?.webgl !== false) {
      // Save-Data / 2g: wait for intent (hover, focus or touch on the "o").
      const stop = peephole.onInterest(load);
      return () => {
        alive = false;
        stop();
      };
    }
    if (!policy?.preloadAtIdle) return;
    // After first paint and the page's own load, in idle time.
    let cancel = () => {};
    const start = () => {
      cancel = whenIdle(load);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      alive = false;
      cancel();
      window.removeEventListener("load", start);
    };
  }, [play]);

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
      {skippable && (
        <button type="button" className="stage-skip" onClick={() => peephole.skip()}>
          Skip
        </button>
      )}
      <div className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>
    </>
  );
}
