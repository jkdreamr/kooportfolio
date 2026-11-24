import { useEffect, useReducer, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import {
  blackjackReducer,
  canDouble,
  cardLabel,
  handValue,
  newBlackjack,
  shuffledDeck,
  type Card,
} from "../core/blackjack";
import { Box, Cylinder } from "../world/Models";
import { BrassStud, CraftedBox } from "./CraftedDetails";
import { startGameMode, useGameMode } from "../core/gameMode";
import { GAME_STAGE_Y, InteriorGameStage } from "./InteriorGameStage";
import {
  GameControls,
  Stool,
  Table,
  gameIsActive,
  type InteriorGameProps,
} from "./InteriorProps";

const cardFaces = new Map<string, THREE.CanvasTexture>();
function cardFace(key: string) {
  let texture = cardFaces.get(key);
  if (texture) return texture;
  const el = document.createElement("canvas");
  el.width = 256;
  el.height = 356;
  const ctx = el.getContext("2d")!;
  ctx.fillStyle = key === "back" ? "#2f4a56" : "#f7f5ef";
  ctx.fillRect(0, 0, 256, 356);
  ctx.strokeStyle = key === "back" ? "#e8edf0" : "#c9ccc8";
  ctx.lineWidth = key === "back" ? 10 : 4;
  ctx.strokeRect(14, 14, 228, 328);
  if (key !== "back") {
    const suit = key.slice(-1),
      rank = key.slice(0, -1);
    ctx.fillStyle = suit === "♥" || suit === "♦" ? "#b23a2e" : "#1f2a30";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '700 92px "Trebuchet MS", Arial, sans-serif';
    ctx.fillText(rank, 80, 78);
    ctx.font = '150px "Trebuchet MS", Arial, sans-serif';
    ctx.fillText(suit, 150, 228);
  }
  texture = new THREE.CanvasTexture(el);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  cardFaces.set(key, texture);
  return texture;
}
const SHOE: [number, number, number] = [1.3, 1.42, 0.4];
function PlayingCard({
  card,
  hidden,
  x,
  z,
  order,
}: {
  card: Card;
  hidden?: boolean;
  x: number;
  z: number;
  order: number;
}) {
  const group = useRef<THREE.Group>(null),
    flip = useRef<THREE.Group>(null),
    age = useRef(-order * 0.16);
  useFrame((_, dt) => {
    if (!group.current || !flip.current) return;
    age.current += dt;
    const t = THREE.MathUtils.smoothstep(age.current, 0, 0.32);
    group.current.position.set(
      THREE.MathUtils.lerp(SHOE[0], x, t),
      THREE.MathUtils.lerp(SHOE[1], 1.36 + order * 0.002, t) +
        Math.sin(t * Math.PI) * 0.12,
      THREE.MathUtils.lerp(SHOE[2], z, t),
    );
    const face = hidden || t < 1 ? Math.PI : 0;
    flip.current.rotation.y = THREE.MathUtils.damp(
      flip.current.rotation.y,
      face,
      14,
      dt,
    );
  });
  return (
    <group ref={group} position={SHOE} rotation={[-Math.PI / 2, 0, 0]}>
      <group ref={flip} rotation={[0, Math.PI, 0]}>
        <mesh position={[0, 0, 0.004]} castShadow>
          <planeGeometry args={[0.6, 0.84]} />
          <meshStandardMaterial
            map={cardFace(cardLabel(card))}
            roughness={0.6}
          />
        </mesh>
        <mesh position={[0, 0, -0.004]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.6, 0.84]} />
          <meshStandardMaterial map={cardFace("back")} roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}
const cardX = (i: number, count: number) =>
  (i - (count - 1) / 2) * Math.min(0.66, 2.5 / count);
export function BlackjackTable({ onReward }: InteriorGameProps) {
  const active = useGameMode((s) => s.active?.id === "blackjack");
  const otherMode = useGameMode(
    (s) => !!s.active && s.active.id !== "blackjack",
  );
  const [game, dispatch] = useReducer(
    blackjackReducer,
    undefined,
    newBlackjack,
  );
  const timer = useRef(0),
    paidRound = useRef(0);
  useFrame((_, dt) => {
    if (!gameIsActive() || !active || game.phase !== "dealer") {
      timer.current = 0;
      return;
    }
    timer.current += dt;
    if (timer.current >= 0.65) {
      timer.current = 0;
      dispatch({ type: "dealer" });
    }
  });
  useEffect(() => {
    if (
      game.phase === "over" &&
      (game.result === "win" || game.result === "blackjack") &&
      paidRound.current < game.round
    ) {
      paidRound.current = game.round;
      // Keep the shared house-game callback compatible with the original table.
      onReward?.("dice", 15);
    }
  }, [game.phase, game.result, game.round, onReward]);
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey)
        return;
      if (!gameIsActive()) return;
      const key = event.key.toLowerCase();
      const action =
        key === "h"
          ? ({ type: "hit" } as const)
          : key === "s"
            ? ({ type: "stand" } as const)
            : key === "d"
              ? ({ type: "double" } as const)
              : key === "enter" &&
                  !(
                    event.target instanceof HTMLButtonElement &&
                    event.target.closest(".interior-game-content")
                  ) &&
                  (game.phase === "bet" || game.phase === "over")
                ? ({ type: "deal", deck: shuffledDeck() } as const)
                : null;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      dispatch(action);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, game.phase]);
  const hidden = game.phase === "player";
  const between = game.phase === "bet" || game.phase === "over";
  return (
    <>
      {active && <InteriorGameStage kind="blackjack" />}
      <group
        visible={!otherMode}
        position={active ? [0, GAME_STAGE_Y, 0] : [-1.2, 0, -3.2]}
        scale={1.4}
        onClick={(event) => {
          event.stopPropagation();
          if (!active && gameIsActive()) startGameMode("blackjack");
        }}
      >
        <CraftedBox p={[0, 0.12, 0]} s={[4.8, 0.1, 3.8]} c="#214d3a" />
        {[-2.26, 2.26].map((x) => (
          <Box key={x} p={[x, 0.18, 0]} s={[0.06, 0.025, 3.55]} c="#c3a05a" />
        ))}
        <Table size={[3.3, 2.3]} />
        <CraftedBox p={[0, 1.1, 0]} s={[3.6, 0.36, 2.55]} c="#553321" />
        <CraftedBox p={[0, 1.3, 0]} s={[3.08, 0.07, 2.06]} c="#225b43" />
        {[-1.5, 1.5].flatMap((x) =>
          [-1.1, 1.1].map((z) => (
            <BrassStud key={`${x}/${z}`} p={[x, 1.3, z]} radius={0.075} />
          )),
        )}
        {game.player.map((card, i, hand) => (
          <PlayingCard
            key={`${game.round}/p${i}`}
            card={card}
            order={i < 2 ? i * 2 : i - 2}
            x={cardX(i, hand.length)}
            z={0.45}
          />
        ))}
        {game.dealer.map((card, i, hand) => (
          <PlayingCard
            key={`${game.round}/d${i}`}
            card={card}
            hidden={hidden && i === 1}
            order={i < 2 ? i * 2 + 1 : 0}
            x={cardX(i, hand.length)}
            z={-0.5}
          />
        ))}
        {game.stake > 0 &&
          !between &&
          Array.from({ length: Math.min(10, game.stake / 10) }, (_, i) => (
            <Cylinder
              key={`stake/${i}`}
              p={[0, 1.37 + i * 0.05, 1.05]}
              s={[0.16, 0.045, 0.16]}
              c={i % 2 ? "#e8ecef" : "#3f6475"}
            />
          ))}
        <CraftedBox
          p={[SHOE[0], 1.4, SHOE[2]]}
          s={[0.56, 0.14, 0.76]}
          c="#2f4a56"
        />
        {[-1, 1].flatMap((side) =>
          [0, 1, 2, 3].map((i) => (
            <Cylinder
              key={`${side}/${i}`}
              p={[side * 1.28, 1.4 + i * 0.065, -0.6]}
              s={[0.14, 0.055, 0.14]}
              c={side === 1 ? "#bb5743" : "#d8b85f"}
            />
          )),
        )}
        {!active && (
          <>
            <Stool p={[-1.05, 0, 2]} />
            <Stool p={[1.05, 0, -1.9]} color="#356248" />
          </>
        )}
      </group>
      <GameControls
        name="Blackjack game"
        position={[7.5, 0.6, 5]}
        mobileSheet
        dock="left"
        gameOpen
        collapsible="Blackjack"
        mode="blackjack"
      >
        <div className="house-game-header">
          <h2>Blackjack</h2>
          <div className="blackjack-bank">
            <span>
              Play chips <b>{game.bank}</b>
            </span>
            <span>
              Bet <b>{game.bet}</b>
            </span>
          </div>
        </div>
        {game.player.length > 0 && (
          <div className="blackjack-hands">
            <div>
              <span>Dealer {hidden ? "?" : handValue(game.dealer)}</span>
              <b>
                {game.dealer
                  .map((card, i) => (hidden && i === 1 ? "?" : cardLabel(card)))
                  .join("  ")}
              </b>
            </div>
            <div>
              <span>You {handValue(game.player)}</span>
              <b>{game.player.map(cardLabel).join("  ")}</b>
            </div>
          </div>
        )}
        {between ? (
          game.bank < 10 ? (
            <button onClick={() => dispatch({ type: "refill" })}>
              Refill play chips
            </button>
          ) : (
            <div className="interior-actions blackjack-bets">
              {[10, 20, 50].map((amount) => (
                <button
                  key={amount}
                  aria-label={`Bet ${amount} chips`}
                  aria-pressed={game.bet === amount}
                  disabled={game.bank < amount}
                  onClick={() => dispatch({ type: "wager", amount })}
                >
                  {amount}
                </button>
              ))}
              <button
                className="blackjack-deal"
                disabled={game.bank < game.bet}
                onClick={() => dispatch({ type: "deal", deck: shuffledDeck() })}
              >
                Deal
              </button>
            </div>
          )
        ) : (
          <div className="interior-actions">
            <button
              disabled={game.phase !== "player"}
              onClick={() => dispatch({ type: "hit" })}
            >
              Hit
            </button>
            <button
              disabled={game.phase !== "player"}
              onClick={() => dispatch({ type: "stand" })}
            >
              Stand
            </button>
            <button
              disabled={!canDouble(game)}
              onClick={() => dispatch({ type: "double" })}
            >
              Double
            </button>
          </div>
        )}
        <p
          role="status"
          className={
            game.result
              ? `blackjack-result blackjack-result--${game.result}`
              : undefined
          }
        >
          {game.message}
        </p>
      </GameControls>
    </>
  );
}
