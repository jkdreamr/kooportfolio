import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Ball, Box, Cylinder, Ring } from "../world/Models";
import { CraftedBox, WallSconce } from "./CraftedDetails";
import { gameIsActive } from "./InteriorProps";
import { useGame } from "../core/store";
import { keys, touch } from "../core/input";
import {
  GO_KOMI, GO_SIZE, chooseGoMove, newGoGame, passGo, playGo, resumeGo,
  scoreGo, toggleGoDead, type GoGame,
} from "../core/go";
import "./go-room.css";

const COLUMNS = "ABCDEFGHJ";
const colorName = (color: number) => color === 1 ? "Black" : "White";
const coordinate = (point: number) => `${COLUMNS[point % GO_SIZE]}${GO_SIZE - Math.floor(point / GO_SIZE)}`;
type Match = { game: GoGame; past: GoGame[] };
const freshMatch = (): Match => ({ game: newGoGame(), past: [] });

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

/** Furnishings + game only. Mount for scene "go" inside the shared 22×26 shell. */
export function GoInterior() {
  const [match, setMatch] = useState(freshMatch);
  const [started, setStarted] = useState(false);
  const [computer, setComputer] = useState(true);
  const [message, setMessage] = useState("");
  const [confirmNew, setConfirmNew] = useState(false);
  const [focus, setFocus] = useState(0);
  const timer = useRef(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const gl = useThree((s) => s.gl);
  const portal = useMemo(() => ({ current: gl.domElement.parentElement! }), [gl]);
  const hidden = useGame((s) => s.paused || s.panel !== "none" || s.build);
  const { game } = match;
  const thinking = computer && game.turn === 2 && game.phase === "playing";
  const score = useMemo(() => scoreGo(game), [game]);
  const commit = (next: GoGame) => {
    setMatch((old) => ({ game: next, past: [...old.past, old.game] }));
    setConfirmNew(false);
    timer.current = 0;
  };
  const open = () => {
    keys.clear(); touch.x = 0; touch.z = 0;
    setStarted(true);
  };
  const place = (point: number) => {
    if (!gameIsActive()) return;
    if (!started) { open(); return; }
    if (game.phase === "scoring") { setMatch((old) => ({ ...old, game: toggleGoDead(old.game, point) })); return; }
    if (thinking || game.phase !== "playing" || confirmNew) return;
    const move = playGo(game, point);
    if (!move.ok) { setMessage(move.reason); return; }
    commit(move.game);
    setMessage(`${colorName(game.turn)} ${coordinate(point)}${move.captured ? ` · captured ${move.captured}` : ""}`);
  };
  useFrame((_, dt) => {
    if (!started || !thinking || !gameIsActive() || confirmNew) { timer.current = 0; return; }
    timer.current += Math.min(dt, 0.1);
    if (timer.current < 0.55) return;
    timer.current = 0;
    const point = chooseGoMove(game);
    const move = point === null ? null : playGo(game, point);
    if (move?.ok) {
      commit(move.game);
      setMessage(`White ${coordinate(point!)}${move.captured ? ` · captured ${move.captured}` : ""}`);
    } else {
      commit(passGo(game));
      setMessage("White passed.");
    }
  });
  const boardKey = (event: KeyboardEvent<HTMLButtonElement>, point: number) => {
    const row = Math.floor(point / GO_SIZE), col = point % GO_SIZE;
    const next = ({ ArrowLeft: row * GO_SIZE + Math.max(0, col - 1),
      ArrowRight: row * GO_SIZE + Math.min(GO_SIZE - 1, col + 1),
      ArrowUp: Math.max(0, point - GO_SIZE), ArrowDown: Math.min(80, point + GO_SIZE),
      Home: row * GO_SIZE, End: row * GO_SIZE + GO_SIZE - 1 } as Record<string, number>)[event.key];
    if (next !== undefined) {
      event.preventDefault(); setFocus(next); buttons.current[next]?.focus();
    }
  };
  const tableClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const x = Math.round((event.point.x + 1.5) / 0.55 + 4);
    const y = Math.round((event.point.z + 3) / 0.55 + 4);
    if (x >= 0 && x < GO_SIZE && y >= 0 && y < GO_SIZE) place(y * GO_SIZE + x);
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
        <mesh position={[0, 1.72, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={tableClick}>
          <planeGeometry args={[4.95, 4.95]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      {!hidden && <Html fullscreen portal={portal} zIndexRange={[25, 0]}>
        <div className="go-room-ui">
          <section className={`go-card${started ? " go-card-open" : ""}`} aria-label="Go game"
            onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key !== "Escape") e.stopPropagation(); }}>
            {!started ? <button className="go-primary" onClick={open}>Play Go</button> : <>
              <header className="go-heading"><h2>Go <small>9 × 9</small></h2>
                <button className="go-close" onClick={() => setStarted(false)} aria-label="Close Go board">×</button></header>
              <div className="go-layout">
                <div className="go-board" role="grid" aria-label="9 by 9 Go board" aria-rowcount={9} aria-colcount={9} aria-busy={thinking}>
                  {Array.from({ length: GO_SIZE }, (_, row) => <div role="row" key={row}>
                    {Array.from({ length: GO_SIZE }, (_, col) => {
                      const point = row * GO_SIZE + col, stone = game.board[point];
                      const dead = game.dead.includes(point);
                      const territory = game.phase !== "playing" && !stone ? score.owners[point] : 0;
                      return <button key={point} role="gridcell" ref={(el) => { buttons.current[point] = el; }}
                        tabIndex={focus === point ? 0 : -1} onFocus={() => setFocus(point)}
                        aria-label={`${coordinate(point)}, ${stone ? colorName(stone) + (dead ? ", marked dead" : " stone") : "empty"}${game.last === point ? ", last move" : ""}`}
                        aria-disabled={game.phase === "finished" || (game.phase === "playing" && (!!stone || thinking))}
                        className={`go-point${col === 0 ? " go-left" : col === 8 ? " go-right" : ""}${row === 0 ? " go-top" : row === 8 ? " go-bottom" : ""}`}
                        onKeyDown={(e) => boardKey(e, point)} onClick={() => place(point)}>
                        {[20, 24, 40, 56, 60].includes(point) && <i className="go-star" />}
                        {!!stone && <span className={`go-stone go-stone-${stone}${dead ? " go-dead" : ""}${game.last === point ? " go-last" : ""}`} />}
                        {!!territory && <i className={`go-territory go-territory-${territory}`} />}
                      </button>;
                    })}
                  </div>)}
                </div>
                <div className="go-details">
                  <strong className="go-status" aria-live="polite">{status}</strong>
                  <p className="go-caption">{computer ? "You: Black · Computer: White" : "Two players · same device"}</p>
                  {game.phase === "playing" ? <>
                    <div className="go-captures"><span>Black <b>{game.captures[0]}</b></span><span>White <b>{game.captures[1]}</b></span></div>
                    <p className="go-caption">Captured stones</p>
                    <div className="go-actions">
                      <button disabled={thinking || confirmNew} onClick={() => { commit(passGo(game)); setMessage(`${colorName(game.turn)} passed.`); }}>Pass</button>
                      <button disabled={!match.past.length || confirmNew} onClick={() => {
                        const count = computer && game.turn === 1 ? 2 : 1;
                        const index = Math.max(0, match.past.length - count);
                        setMatch({ game: match.past[index], past: match.past.slice(0, index) });
                        timer.current = 0; setMessage("Move taken back.");
                      }}>Undo</button>
                    </div>
                  </> : <>
                    <div className="go-score"><span>Black <b>{score.black}</b></span><span>White <b>{score.white}</b></span></div>
                    {game.phase === "scoring" && <>
                      <p className="go-caption">Tap dead groups to remove them. Both players agree, or resume play.</p>
                      <div className="go-actions"><button onClick={() => { setMatch((old) => ({ ...old, game: resumeGo(old.game) })); setMessage(""); }}>Resume</button>
                        <button className="go-primary" onClick={() => setMatch((old) => ({ ...old, game: { ...old.game, phase: "finished" } }))}>Finish</button></div>
                    </>}
                  </>}
                  <p className="go-message" role="status">{message || "Tap an intersection to place a stone."}</p>
                  {confirmNew ? <div className="go-confirm"><p>Start over?</p><div className="go-actions">
                    <button onClick={() => setConfirmNew(false)}>Keep playing</button>
                    <button onClick={() => { setMatch(freshMatch()); setConfirmNew(false); setMessage(""); }}>Start over</button>
                  </div></div> : <button className="go-new" onClick={() => {
                    if (game.moves && game.phase !== "finished") setConfirmNew(true);
                    else { setMatch(freshMatch()); setMessage(""); }
                  }}>New game</button>}
                  {game.moves === 0 && <label className="go-mode">Opponent <select value={computer ? "computer" : "local"} onChange={(e) => setComputer(e.target.value === "computer")}>
                    <option value="computer">Computer</option><option value="local">Local player</option></select></label>}
                  <details className="go-rules"><summary>Rules</summary><p>Black starts. Connect stones and surround space. Groups with no adjacent empty points are captured. No suicide or repeated positions. Pass twice to count; mark dead groups by agreement, or resume to capture them.</p>
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
