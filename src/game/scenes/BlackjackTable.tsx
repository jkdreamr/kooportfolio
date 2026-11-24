import { useEffect, useReducer, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import {
  blackjackReducer,
  cardLabel,
  handValue,
  newBlackjack,
  shuffledDeck,
  type Card,
} from "../core/blackjack";
import { Box, Cylinder, Sign } from "../world/Models";
import { BrassStud, CraftedBox } from "./CraftedDetails";
import {
  GameControls,
  Stool,
  Table,
  gameIsActive,
  type InteriorGameProps,
} from "./InteriorProps";

function PlayingCard({
  card,
  hidden,
  x,
  z,
}: {
  card: Card;
  hidden?: boolean;
  x: number;
  z: number;
}) {
  return (
    <group position={[x, 1.4, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <CraftedBox s={[0.6, 0.86, 0.05]} c={hidden ? "#7a3e36" : "#ead8ac"} />
      <Sign
        text={hidden ? "ΚΣ" : cardLabel(card)}
        p={[0, 0, 0.03]}
        size={[0.53, 0.66]}
        color={hidden ? "#7a3e36" : "#ead8ac"}
        ink={
          hidden
            ? "#d5b368"
            : card.suit === "♥" || card.suit === "♦"
              ? "#a34132"
              : "#263f34"
        }
      />
    </group>
  );
}
export function BlackjackTable({
  active,
  onSelect,
  navigation,
  onReward,
}: InteriorGameProps & {
  active: boolean;
  onSelect: () => void;
  navigation: ReactNode;
}) {
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
  const hidden = game.phase === "player";
  const between = game.phase === "bet" || game.phase === "over";
  return (
    <>
      <group
        position={[-1.2, 0, -3.2]}
        scale={1.4}
        onClick={(event) => {
          event.stopPropagation();
          if (gameIsActive()) onSelect();
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
        {(game.player.length
          ? game.player
          : ([
              { rank: 1, suit: "♠" },
              { rank: 13, suit: "♥" },
            ] as Card[])
        ).map((card, i, hand) => (
          <PlayingCard
            key={i}
            card={card}
            x={(i - (hand.length - 1) / 2) * Math.min(0.53, 2.4 / hand.length)}
            z={0.5}
          />
        ))}
        {game.dealer.map((card, i, hand) => (
          <PlayingCard
            key={i}
            card={card}
            hidden={hidden && i === 1}
            x={(i - (hand.length - 1) / 2) * Math.min(0.53, 2.4 / hand.length)}
            z={-0.55}
          />
        ))}
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
        <Stool p={[-1.05, 0, 2]} />
        <Stool p={[1.05, 0, -1.9]} color="#356248" />
      </group>
      {active && (
        <GameControls
          name="Blackjack game"
          position={[7.5, 0.6, 5]}
          mobileSheet
        >
          {navigation}
          <div className="blackjack-bank">
            <span>
              Play chips <b>{game.bank}</b>
            </span>
            <span>
              Bet <b>{game.bet}</b>
            </span>
          </div>
          {game.player.length > 0 && (
            <div className="blackjack-hands">
              <div>
                <span>Dealer {hidden ? "?" : handValue(game.dealer)}</span>
                <b>
                  {game.dealer
                    .map((card, i) =>
                      hidden && i === 1 ? "?" : cardLabel(card),
                    )
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
              <>
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
                </div>
                <button
                  className="blackjack-deal"
                  disabled={game.bank < game.bet}
                  onClick={() =>
                    dispatch({ type: "deal", deck: shuffledDeck() })
                  }
                >
                  Deal
                </button>
              </>
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
            </div>
          )}
          <p role="status">{game.message}</p>
        </GameControls>
      )}
    </>
  );
}
