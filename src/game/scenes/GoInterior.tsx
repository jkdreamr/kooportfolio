import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Ball, Box, Cylinder, Ring } from "../world/Models";
import { CraftedBox, WallSconce } from "./CraftedDetails";
import { useGame } from "../core/store";
import { keys, touch } from "../core/input";
import { endGameMode, startGameMode, useGameMode } from "../core/gameMode";
import {
  GO_KOMI, GO_SIZE, newGoGame, passGo, playGo, resumeGo,
  scoreGo, toggleGoDead, type GoGame,
} from "../core/go";
import { chooseGoMove, DEFAULT_GO_LEVEL, GO_LEVELS, type GoLevel } from "../core/goBot";
import { sound } from "../core/sound";
import "./go-room.css";

const COLUMNS = "ABCDEFGHJ";
const colorName = (color: number) => color === 1 ? "Black" : "White";
const coordinate = (point: number) => `${COLUMNS[point % GO_SIZE]}${GO_SIZE - Math.floor(point / GO_SIZE)}`;
type Match = { game: GoGame; past: GoGame[] };
type FocusTarget = "board" | "confirm" | "resume" | "new" | "launch";
const freshMatch = (): Match => ({ game: newGoGame(), past: [] });
const GO_LEVEL_KEY = "go-opponent-level";

function savedGoLevel(): GoLevel {
  try {
    const saved = localStorage.getItem(GO_LEVEL_KEY);
    return GO_LEVELS.find((level) => level === saved) ?? DEFAULT_GO_LEVEL;
  } catch {
    return DEFAULT_GO_LEVEL;
  }
}

function StoneBowl({ x, z, white = false }: { x: number; z: number; white?: boolean }) {
  return (
    <group position={[x, 0, z]}>
      <Ball p={[0, 0.65, 0]} s={[0.74, 0.53, 0.74]} c="#744527" />
      <Cylinder p={[0, 0.84, 0]} s={[0.7, 0.12, 0.7]} c="#452e23" />
      <Ring p={[0, 0.91, 0]} radius={0.67} tube={0.075} c="#b4793a" />
      {Array.from({ length: 9 }, (_, i) => (
        <Ball key={i} p={[(i % 3 - 1) * 0.29, 0.94 + (i % 2) * 0.04, (Math.floor(i / 3) - 1) * 0.29]}
          s={[0.2, 0.085, 0.2]} c={white ? "#e9e5d6" : "#252c2a"} />
      ))}
      <Cylinder p={[0.82, 0.22, 0.5]} s={[0.6, 0.14, 0.6]} c="#986037" />
      <Cylinder p={[0.82, 0.33, 0.5]} s={[0.15, 0.12, 0.15]} c="#be8d49" />
    </group>
  );
}

function GoFurnishings() {
  return (
    <>
      <CraftedBox p={[-1.5, 0.12, -3]} s={[11.5, 0.14, 11]} c="#304e42" />
      {[-6.9, 3.9].map((x) => <Box key={x} p={[x, 0.21, -3]} s={[0.09, 0.035, 10.6]} c="#b5a065" />)}
      {[-8, 2].map((z) => <Box key={z} p={[-1.5, 0.21, z]} s={[10.9, 0.035, 0.09]} c="#b5a065" />)}
      {[-7, 1].map((z) => (
        <group key={z} position={[-1.5, 0, z]}>
          <CraftedBox p={[0, 0.36, 0]} s={[2.4, 0.38, 1.9]} c="#202f2d" />
          <CraftedBox p={[0, 0.58, 0]} s={[2.25, 0.35, 1.75]} c="#9a4936" />
          <Box p={[0, 0.76, 0]} s={[0.08, 0.025, 1.5]} c="#c68b56" />
        </group>
      ))}
      <StoneBowl x={-5.2} z={-1.7} />
      <StoneBowl x={2.2} z={-4.5} white />
      {/* Thick framed lattice, not a flat paper wall. */}
      {[-7.2, -3.8].map((x) => (
        <group key={x} position={[x, 0, -11.7]}>
          <CraftedBox p={[0, 2.3, 0]} s={[3.1, 4.3, 0.42]} c="#4c3828" />
          <Box p={[0, 2.4, 0.24]} s={[2.65, 3.75, 0.15]} c="#8b9d7e" />
          {[-0.9, 0, 0.9].map((dx) => <Box key={dx} p={[dx, 2.4, 0.37]} s={[0.1, 3.8, 0.16]} c="#654a2e" />)}
          {[1, 1.9, 2.8, 3.7].map((y) => <Box key={y} p={[0, y, 0.37]} s={[2.75, 0.11, 0.16]} c="#654a2e" />)}
        </group>
      ))}
      <group position={[4.7, 0, -10.7]}>
        <CraftedBox p={[0, 1.4, 0]} s={[6.5, 0.38, 1.65]} c="#80512d" />
        {[-2.7, 2.7].map((x) => <CraftedBox key={x} p={[x, 0.75, 0]} s={[0.4, 1.45, 1.35]} c="#4f3826" />)}
        <CraftedBox p={[-1.75, 1.68, 0]} s={[2.3, 0.15, 1.2]} c="#35463b" />
        <Ball p={[-1.8, 2.03, 0]} s={[0.45, 0.35, 0.4]} c="#76815a" />
        <Cylinder p={[-1.8, 2.36, 0]} s={[0.27, 0.09, 0.27]} c="#384838" />
        <Ball p={[-1.8, 2.44, 0]} s={[0.08, 0.07, 0.08]} c="#bb9b5a" />
        <Box p={[-1.32, 2.09, 0]} s={[0.6, 0.18, 0.2]} c="#76815a" r={[0, 0, 0.3]} />
        {[-2.5, -0.9].map((x) => <Cylinder key={x} p={[x, 1.89, 0.35]} s={[0.15, 0.3, 0.15]} c="#bd9c60" />)}
        <CraftedBox p={[1.75, 1.78, 0]} s={[1.5, 0.35, 1]} c="#525d42" />
        <Cylinder p={[1.7, 2.5, 0]} s={[0.13, 1.25, 0.13]} c="#5d4129" r={[0, 0, -0.18]} />
        <Box p={[1.95, 2.8, 0]} s={[1.05, 0.15, 0.18]} c="#5d4129" r={[0, 0, -0.3]} />
        {[[1.2, 3.2, 0], [2, 3.3, 0], [2.4, 2.95, 0.08]].map((p, i) => (
          <Ball key={i} p={p as [number, number, number]} s={[0.65, 0.35, 0.6]} c={i % 2 ? "#537447" : "#3e623d"} />
        ))}
      </group>
      <WallSconce p={[-9.5, 3.2, -12.1]} />
      <WallSconce p={[9.5, 3.2, -12.1]} />
      {[1, 2].map((color) => (
        <group key={color} position={[color === 1 ? 0 : 1.6, 3.9, -12.25]}>
          <Ball s={[0.65, 0.65, 0.16]} c={color === 1 ? "#24312c" : "#e8ddbd"} />
          <Ring radius={0.76} tube={0.065} c="#b48a45" r={[Math.PI / 2, 0, 0]} />
        </group>
      ))}
    </>
  );
}

/** Walking-room furnishings with an explicitly launched, opaque Go game view. */
export function GoInterior() {
  const [match, setMatch] = useState(freshMatch);
  const started = useGameMode((s) => s.active?.id === "go");
  const [computer, setComputer] = useState(true);
  const [level, setLevel] = useState(savedGoLevel);
  const [message, setMessage] = useState("");
  const [confirmNew, setConfirmNew] = useState(false);
  const [focus, setFocus] = useState(40);
  const [aim, setAim] = useState<number | null>(null);
  const aimKind = useRef<"keyboard" | "pointer">("keyboard");
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const focusTarget = useRef<FocusTarget | null>(null);
  // Html commits in a separate DOM root. Focus when the native node is ready,
  // rather than racing that root with an effect or animation frame.
  const focusWhenReady = (node: HTMLButtonElement | null, target: FocusTarget) => {
    if (node && focusTarget.current === target) {
      focusTarget.current = null;
      node.focus();
    }
  };
  const gl = useThree((s) => s.gl);
  const portal = useMemo(() => ({ current: gl.domElement.parentElement! }), [gl]);
  const hidden = useGame((s) => s.paused || s.panel !== "none");
  const { game } = match;
  const thinking = computer && game.turn === 2 && game.phase === "playing";
  const score = useMemo(() => scoreGo(game), [game]);
  const preview = useMemo(() => aim !== null && game.phase === "playing" && !thinking && !confirmNew
    ? playGo(game, aim) : null, [aim, game, thinking, confirmNew]);
  const close = useCallback(() => {
    focusTarget.current = "launch";
    setAim(null);
    setConfirmNew(false);
    endGameMode();
  }, []);
  useEffect(() => {
    // Shared Escape/room navigation can close the mode without clicking our UI.
    window.addEventListener("interior-game-close", close);
    return () => window.removeEventListener("interior-game-close", close);
  }, [close]);
  const commit = (next: GoGame) => {
    setMatch((old) => ({ game: next, past: [...old.past, old.game] }));
    setConfirmNew(false);
  };
  const open = () => {
    focusTarget.current = "board";
    if (!startGameMode("go")) { focusTarget.current = null; return; }
    keys.clear(); touch.x = 0; touch.z = 0;
    setConfirmNew(false);
  };
  const reset = () => {
    focusTarget.current = "board";
    setFocus(40);
    setMatch(freshMatch());
    setConfirmNew(false);
    setMessage("");
  };
  const place = (point: number) => {
    if (!started || hidden || confirmNew) return;
    if (game.phase === "scoring") { setMatch((old) => ({ ...old, game: toggleGoDead(old.game, point) })); return; }
    if (thinking || game.phase !== "playing") return;
    const move = playGo(game, point);
    if (!move.ok) { setMessage(move.reason); return; }
    sound(move.captured ? "score" : "tap");
    if (move.game.phase === "scoring") sound("chime");
    commit(move.game);
    setMessage(`${colorName(game.turn)} ${coordinate(point)}${move.captured ? ` · captured ${move.captured}` : ""}`);
  };
  useEffect(() => {
    if (!started || hidden || !thinking || confirmNew) return;
    const readyAt = performance.now() + 350;
    let timer = 0, worker: Worker | undefined;
    const receive = (point: number | null) => {
      timer = window.setTimeout(() => {
        const move = point === null ? null : playGo(game, point);
        const next = move?.ok ? move.game : passGo(game);
        if (move?.ok) sound(move.captured ? "score" : "tap");
        if (next.phase === "scoring") { sound("chime"); focusTarget.current = "resume"; }
        setMatch((old) => old.game === game ? { game: next, past: [...old.past, game] } : old);
        setMessage(next.phase === "scoring" ? "" : move?.ok && point !== null
          ? `White ${coordinate(point)}${move.captured ? ` · captured ${move.captured}` : ""}`
          : "White passed.");
      }, Math.max(0, readyAt - performance.now()));
    };
    const fallback = () => {
      worker?.terminate();
      timer = window.setTimeout(() => receive(chooseGoMove(game, level)), 0);
    };
    try {
      worker = new Worker(new URL("../core/goBot.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }: MessageEvent<number | null>) => receive(data);
      worker.onerror = fallback;
      worker.postMessage({ game, level });
    } catch {
      fallback();
    }
    return () => { worker?.terminate(); window.clearTimeout(timer); };
  }, [started, hidden, thinking, confirmNew, game, level]);
  const boardKey = (event: KeyboardEvent<HTMLButtonElement>, point: number) => {
    aimKind.current = "keyboard";
    setAim(point);
    if (event.key === "Enter" || event.key === " ") {
      event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    const row = Math.floor(point / GO_SIZE), col = point % GO_SIZE;
    const next = ({ ArrowLeft: row * GO_SIZE + Math.max(0, col - 1),
      ArrowRight: row * GO_SIZE + Math.min(GO_SIZE - 1, col + 1),
      ArrowUp: Math.max(0, row - 1) * GO_SIZE + col,
      ArrowDown: Math.min(GO_SIZE - 1, row + 1) * GO_SIZE + col,
      Home: event.ctrlKey ? 0 : row * GO_SIZE,
      End: event.ctrlKey ? GO_SIZE * GO_SIZE - 1 : row * GO_SIZE + GO_SIZE - 1 } as Record<string, number>)[event.key];
    if (next !== undefined) {
      event.preventDefault(); setAim(next); setFocus(next); buttons.current[next]?.focus();
      // Focus alone does not scroll an already-focused point back into view.
      buttons.current[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };
  const panelKey = (event: KeyboardEvent<HTMLElement>) => {
    if (!started) {
      // Native button Space must not be cancelled by walking input; movement
      // keys still reach the walker while Play Go has focus after closing.
      if (event.key === " ") event.stopPropagation();
      return;
    }
    // Keep game keys away from walking input, including Escape from a select.
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      confirmNew ? '.go-confirm button' : 'button:not(:disabled):not([tabindex="-1"]), select, summary',
    )).filter((el) => el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const status = game.phase === "finished"
    ? `${colorName(score.winner)} wins by ${score.margin}`
    : game.phase === "scoring" ? "Count the board" : thinking ? "White is thinking…" : `${colorName(game.turn)} to play`;
  return (
    <>
      <GoFurnishings />
      <group position={[-1.5, 0, -3]}>
        {[-1.8, 1.8].flatMap((x) => [-1.8, 1.8].map((z) => (
          <CraftedBox key={`${x}/${z}`} p={[x, 0.56, z]} s={[0.6, 0.8, 0.6]} c="#684426" />
        )))}
        <CraftedBox p={[0, 1.02, 0]} s={[5.5, 0.65, 5.5]} c="#a37135" />
        <CraftedBox p={[0, 1.36, 0]} s={[5.2, 0.16, 5.2]} c="#d9aa60" />
        {Array.from({ length: GO_SIZE }, (_, i) => (
          <group key={i}>
            <Box p={[(i - 4) * 0.55, 1.45, 0]} s={[0.024, 0.012, 4.42]} c="#5c4126" sharp />
            <Box p={[0, 1.45, (i - 4) * 0.55]} s={[4.42, 0.012, 0.024]} c="#5c4126" sharp />
          </group>
        ))}
        {[20, 24, 40, 56, 60].map((point) => (
          <Cylinder key={point} p={[(point % 9 - 4) * 0.55, 1.46, (Math.floor(point / 9) - 4) * 0.55]} s={[0.055, 0.012, 0.055]} c="#4e3825" />
        ))}
        {game.board.map((stone, point) => stone ? (
          <group key={point} position={[(point % 9 - 4) * 0.55, 1.54, (Math.floor(point / 9) - 4) * 0.55]}>
            <Ball s={[0.25, 0.12, 0.25]} c={stone === 1 ? "#202927" : "#f0e9d7"} />
            {game.last === point && <Cylinder p={[0, 0.125, 0]} s={[0.055, 0.012, 0.055]} c="#d18443" />}
          </group>
        ) : null)}
      </group>
      {!hidden && <Html fullscreen portal={portal} zIndexRange={[80, 0]}
        calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}
        style={{ pointerEvents: "none" }}>
        <div className={`go-room-ui${started ? " go-room-ui--playing" : ""}`}>
          <section className={`go-card${started ? " go-card-playing" : ""}`} aria-label="Go game"
            role={started ? "dialog" : undefined} aria-modal={started ? true : undefined}
            onPointerDownCapture={(event) => {
              // Inert prevents background actions, but clicking it can still
              // blur the modal's button. Keep that native focus change inside.
              if (confirmNew && !(event.target instanceof Element && event.target.closest(".go-confirm button"))) {
                event.preventDefault(); event.stopPropagation();
              }
            }}
            onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={panelKey}>
            {!started ? <button ref={(node) => focusWhenReady(node, "launch")} className="go-primary" onClick={open}>Play Go</button> : <>
              <header className="go-heading" inert={confirmNew}><h2>Go <small>9 × 9</small></h2>
                <strong className="go-status" aria-live="polite">{status}</strong>
                <button className="go-close" onClick={close} aria-label="Close Go board">Close</button></header>
              <div className="go-layout">
                <div className="go-board" inert={confirmNew} role="grid" aria-label="9 by 9 Go board" aria-rowcount={9} aria-colcount={9} aria-busy={thinking}
                  aria-describedby="go-help" onPointerLeave={() => { if (aimKind.current === "pointer") setAim(null); }}>
                  {Array.from({ length: GO_SIZE }, (_, row) => <div role="row" key={row}>
                    {Array.from({ length: GO_SIZE }, (_, col) => {
                      const point = row * GO_SIZE + col, stone = game.board[point];
                      const dead = game.dead.includes(point);
                      const territory = game.phase !== "playing" && !stone ? score.owners[point] : 0;
                      return <button key={point} role="gridcell" ref={(el) => { buttons.current[point] = el; if (focus === point) focusWhenReady(el, "board"); }}
                        tabIndex={focus === point ? 0 : -1} onFocus={() => { setFocus(point); setAim(point); }}
                        onBlur={() => setAim(null)}
                        onPointerMove={(event) => { if (event.pointerType === "mouse") { aimKind.current = "pointer"; setAim(point); } }}
                        aria-label={`${coordinate(point)}, ${stone ? colorName(stone) + (dead ? ", marked dead" : " stone") : "empty"}${game.last === point ? ", last move" : ""}`}
                        aria-disabled={confirmNew || game.phase === "finished" || (game.phase === "playing" && (!!stone || thinking))}
                        className={`go-point${col === 0 ? " go-left" : col === 8 ? " go-right" : ""}${row === 0 ? " go-top" : row === 8 ? " go-bottom" : ""}`}
                        onKeyDown={(e) => boardKey(e, point)} onClick={() => place(point)}>
                        {row === 0 && <span className="go-axis go-axis-column" aria-hidden="true">{COLUMNS[col]}</span>}
                        {col === 0 && <span className="go-axis go-axis-row" aria-hidden="true">{GO_SIZE - row}</span>}
                        {[20, 24, 40, 56, 60].includes(point) && <i className="go-star" />}
                        {!!stone && <span className={`go-stone go-stone-${stone}${dead ? " go-dead" : ""}${game.last === point ? " go-last" : ""}`} />}
                        {aim === point && preview?.ok && <span className={`go-stone go-stone-${game.turn} go-preview`} aria-hidden="true" />}
                        {!confirmNew && <span className="go-cursor" aria-hidden="true" />}
                        {!!territory && <i className={`go-territory go-territory-${territory}`} />}
                      </button>;
                    })}
                  </div>)}
                </div>
                <div className="go-details">
                  <div inert={confirmNew}>
                  <p className="go-caption">{computer ? `You: Black · Computer: White (${level})` : "Two players · same device"}</p>
                  {game.phase === "playing" ? <>
                    <div className="go-captures"><span>Black <b>{game.captures[0]}</b></span><span>White <b>{game.captures[1]}</b></span></div>
                    <p className="go-caption">Captured stones</p>
                    <div className="go-actions">
                      <button disabled={thinking || confirmNew} onClick={() => {
                        const next = passGo(game);
                        sound("tap");
                        if (next.phase === "scoring") sound("chime");
                        focusTarget.current = next.phase === "scoring" ? "resume" : "board";
                        commit(next); setMessage(next.phase === "scoring" ? "" : `${colorName(game.turn)} passed.`);
                      }}>Pass</button>
                      <button disabled={!match.past.length || confirmNew} onClick={() => {
                        focusTarget.current = "board";
                        const count = computer && game.turn === 1 ? 2 : 1;
                        const index = Math.max(0, match.past.length - count);
                        setMatch({ game: match.past[index], past: match.past.slice(0, index) });
                        setMessage("Move taken back.");
                      }}>Undo</button>
                    </div>
                  </> : <>
                    <div className="go-score">
                      <div><span>Black <b>{score.black}</b></span>
                        <small>{score.stones[0]} {score.stones[0] === 1 ? "stone" : "stones"} + {score.territory[0]} territory</small></div>
                      <div><span>White <b>{score.white}</b></span>
                        <small>{score.stones[1]} {score.stones[1] === 1 ? "stone" : "stones"} + {score.territory[1]} territory + {GO_KOMI} komi</small></div>
                    </div>
                    <p className="go-caption go-legend"><i className="go-territory-1" /><i className="go-territory-2" />Squares show territory.</p>
                    {game.phase === "scoring" && <>
                      <p className="go-caption">Tap dead groups to remove them. Both players agree, or resume play.</p>
                      <div className="go-actions"><button ref={(node) => focusWhenReady(node, "resume")} disabled={confirmNew} onClick={() => {
                        focusTarget.current = "board"; setMatch((old) => ({ ...old, game: resumeGo(old.game) })); setMessage("");
                      }}>Resume</button>
                        <button className="go-primary" disabled={confirmNew} onClick={() => {
                          focusTarget.current = "new"; setMatch((old) => ({ ...old, game: { ...old.game, phase: "finished" } })); setMessage("");
                        }}>Finish</button></div>
                    </>}
                  </>}
                  <p id="go-help" className="go-message" role="status">{game.phase === "finished" ? "Final score · stones + territory + komi" : game.phase === "scoring" ? "Tap a group to mark or restore it." : message || "Tap a point, or use arrows + Enter / Space."}</p>
                  </div>
                  {confirmNew ? <div className="go-confirm" role="alertdialog" aria-modal="true" aria-label="Start a new Go game?"><p>Start over?</p><div className="go-actions">
                    <button ref={(node) => focusWhenReady(node, "confirm")} onClick={() => { focusTarget.current = "board"; setConfirmNew(false); }}>Keep playing</button>
                    <button onClick={reset}>Start over</button>
                  </div></div> : <button ref={(node) => focusWhenReady(node, "new")} className="go-new" onClick={() => {
                    if (game.moves && game.phase !== "finished") { focusTarget.current = "confirm"; setConfirmNew(true); }
                    else reset();
                  }}>New game</button>}
                  {game.moves === 0 && <label className="go-mode" inert={confirmNew}>Opponent <select value={computer ? level : "local"} onChange={(e) => {
                    const next = GO_LEVELS.find((option) => option === e.target.value);
                    setComputer(Boolean(next));
                    if (next) {
                      setLevel(next);
                      try { localStorage.setItem(GO_LEVEL_KEY, next); } catch { /* Keep the in-session selection. */ }
                    }
                  }}>
                    <optgroup label="Computer">{GO_LEVELS.map((option) =>
                      <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>)}</optgroup>
                    <option value="local">Local player</option></select></label>}
                  <details className="go-rules" inert={confirmNew}><summary>Rules</summary><p>Black starts. Connect stones and surround space. Groups with no adjacent empty points are captured. No suicide or repeated positions. Pass twice to count; mark dead groups by agreement, or resume to capture them.</p>
                    <p>Area scoring: stones + surrounded space. White gets {GO_KOMI} komi. Captures aren’t added again. Arrow keys move; Enter places. Local game, no online opponent.</p></details>
                </div>
              </div>
            </>}
          </section>
        </div>
      </Html>}
    </>
  );
}
