import { useCallback, useEffect, useMemo, useReducer, useRef, type KeyboardEvent } from "react";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { ANAGRAMS, newAnagrams, playAnagrams } from "../core/anagrams";
import { endGameMode, startGameMode, useGameMode } from "../core/gameMode";
import { useGame } from "../core/store";
import { Box } from "../world/Models";
import "./study-anagrams.css";

export function StudyAnagrams() {
  const [round, dispatch] = useReducer(playAnagrams, undefined, newAnagrams);
  const active = useGameMode((s) => s.active?.id === "anagrams");
  const hidden = useGame((s) => s.paused || s.panel !== "none" || s.build);
  const gl = useThree((s) => s.gl);
  const portal = useMemo(() => ({ current: gl.domElement.parentElement! }), [gl]);
  const restoreLauncher = useRef(false);
  const dialog = useRef<HTMLElement | null>(null);
  const focusDialog = useCallback((node: HTMLElement | null) => {
    dialog.current = node;
    node?.focus({ preventScroll: true });
  }, []);
  const focusLauncher = useCallback((node: HTMLButtonElement | null) => {
    if (!node || !restoreLauncher.current) return;
    restoreLauncher.current = false;
    node.focus({ preventScroll: true });
  }, []);
  const close = useCallback(() => {
    if (useGameMode.getState().active?.id !== "anagrams") return;
    restoreLauncher.current = true;
    endGameMode();
  }, []);
  useEffect(() => {
    window.addEventListener("interior-game-close", close);
    return () => window.removeEventListener("interior-game-close", close);
  }, [close]);

  const puzzle = ANAGRAMS[round.page];
  const solved = round.result === "solved";
  const canCheck = !!puzzle && round.selected.length === puzzle.tiles.length;
  const handleKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (!active) {
      if (event.key === " ") event.stopPropagation();
      return;
    }
    event.stopPropagation();
    if (event.key === "Tab") {
      const controls = event.currentTarget.querySelectorAll<HTMLButtonElement>("button");
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    } else if (!event.repeat && !event.nativeEvent.isComposing && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (event.key === "Backspace") {
        event.preventDefault();
        dispatch({ type: "undo" });
      } else if (/^[a-z]$/i.test(event.key)) {
        dispatch({ type: "letter", letter: event.key });
      }
    }
  };
  return (
    <>
      <group position={[-1.35, 1.22, -3.8]}>
        <Box s={[1.1, 0.06, 0.48]} c="#50644d" sharp />
        {[0, 1, 2, 3, 4].map((i) => (
          <Box key={i} p={[(i - 2) * 0.18, 0.06, 0]} s={[0.14, 0.07, 0.18]}
            c="#ebcf97" r={[0, (i - 2) * 0.12, 0]} sharp />
        ))}
      </group>
      {!hidden && (
        <Html fullscreen portal={portal} zIndexRange={[80, 0]}
          calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}
          style={{ pointerEvents: "none" }}>
          <div className={active ? "anagrams-screen" : "anagrams-launch"}
            onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()} onKeyDown={handleKeys}>
            {active ? (
              <section className="anagrams-sheet" role="dialog" aria-modal="true" aria-labelledby="anagrams-title"
                data-interior-game-open="true" tabIndex={-1} ref={focusDialog}>
                <header>
                  <h2 id="anagrams-title">Desk anagrams</h2>
                  <button onClick={close}>Close</button>
                </header>
                {puzzle ? (
                  <>
                    <div className="anagrams-clue" aria-live="polite">
                      <small>{round.page + 1} / {ANAGRAMS.length}</small>
                      <p>{puzzle.clue}</p>
                    </div>
                    <div className="anagrams-slots" role="group" aria-label="Your word">
                      {[...puzzle.tiles].map((_, index) => (
                        <span key={index} aria-hidden="true">{puzzle.tiles[round.selected[index]] ?? ""}</span>
                      ))}
                      <span className="anagrams-sr" aria-live="polite">
                        {round.selected.map((index) => puzzle.tiles[index]).join(" ")}
                      </span>
                    </div>
                    <div className="anagrams-tiles" role="group" aria-label="Letter tiles">
                      {[...puzzle.tiles].map((letter, index) => (
                        <button key={index} aria-disabled={solved || round.selected.includes(index)}
                          onClick={() => dispatch({ type: "pick", index })}>{letter}</button>
                      ))}
                    </div>
                    <footer>
                      <button aria-disabled={solved || !round.selected.length}
                        onClick={() => dispatch({ type: "undo" })}>Undo</button>
                      <span role="status">{solved ? "Correct" : round.result === "retry" ? "Try again" : ""}</span>
                      <button className="anagrams-primary" aria-disabled={!canCheck}
                        onClick={() => {
                          if (solved) dialog.current?.focus();
                          dispatch({ type: solved ? "next" : "check" });
                        }}>{solved ? (round.page === ANAGRAMS.length - 1 ? "Finish" : "Next") : "Check"}</button>
                    </footer>
                  </>
                ) : (
                  <div className="anagrams-finish">
                    <p role="status">{ANAGRAMS.length} / {ANAGRAMS.length} solved</p>
                    <button className="anagrams-primary" onClick={() => {
                      dialog.current?.focus();
                      dispatch({ type: "restart" });
                    }}>Play again</button>
                  </div>
                )}
              </section>
            ) : (
              <button ref={focusLauncher} className="anagrams-primary" onClick={() => {
                if (startGameMode("anagrams")) dispatch({ type: "restart" });
              }}>Play Anagrams</button>
            )}
          </div>
        </Html>
      )}
    </>
  );
}
