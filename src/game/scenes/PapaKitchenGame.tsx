import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type PointerEvent,
} from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { endGameMode, startGameMode, useGameMode } from "../core/gameMode";
import { useGame } from "../core/store";
import { sound } from "../core/sound";
import { GAME_STAGE_Y } from "./InteriorGameStage";
import { gameIsActive, type InteriorGameProps } from "./InteriorProps";
import { PapaKitchenScene } from "./PapaKitchenScene";
import {
  cookTarget,
  dayGoal,
  ingredientName,
  newPapaGame,
  papaReducer,
  selectedOrder,
  shiftPassed,
  TOPPINGS,
  type PapaAction,
  type PapaGame,
  type Ticket,
  type Topping,
} from "./kitchenPapa";
import "./papa-kitchen.css";

function Ingredients({ ticket }: { ticket: Ticket }) {
  return (
    <ol className="papa-recipe">
      {ticket.toppings.map((ingredient, i) => (
        <li key={`${ingredient}:${i}`}>
          <i className={`papa-food papa-food--${ingredient}`} />
          {ingredientName(ingredient)}
        </li>
      ))}
    </ol>
  );
}
function KitchenControls({
  game,
  dispatch,
  close,
  armed,
  arm,
  aim,
  aimMarker,
  center,
  dropZone,
  focusElement,
}: {
  game: PapaGame;
  dispatch: Dispatch<PapaAction>;
  close: () => void;
  armed: Topping | null;
  arm: (topping: Topping | null) => void;
  aim: RefObject<number>;
  aimMarker: RefObject<HTMLSpanElement | null>;
  center: RefObject<{ x: number; y: number }>;
  dropZone: RefObject<HTMLDivElement | null>;
  focusElement: (node: HTMLButtonElement | null) => void;
}) {
  const current = selectedOrder(game),
    dragging = useRef<{ ingredient: Topping; x: number; y: number } | null>(
      null,
    );
  const [ghost, setGhost] = useState<{
    ingredient: Topping;
    x: number;
    y: number;
  } | null>(null);
  const act: Dispatch<PapaAction> = (action) => {
    dispatch(action);
    if (action.type === "flip" || action.type === "lift") sound("bounce");
    if (action.type === "layer") sound("step");
    if (action.type === "serve") sound("score");
  };
  const drop = (event: PointerEvent<HTMLButtonElement>) => {
    const held = dragging.current;
    if (!held) return;
    const distance = Math.hypot(event.clientX - held.x, event.clientY - held.y);
    if (distance < 9) arm(held.ingredient);
    else if (
      Math.abs(event.clientX - center.current.x) < 135 &&
      Math.abs(event.clientY - center.current.y) < 110
    ) {
      act({
        type: "layer",
        ingredient: held.ingredient,
        offset: (event.clientX - center.current.x) / 160,
      });
      arm(null);
    }
    dragging.current = null;
    setGhost(null);
  };
  const place = () => {
    if (armed) {
      act({ type: "layer", ingredient: armed, offset: aim.current });
      arm(null);
    }
  };
  const average = game.served ? Math.round(game.score / game.served) : 0;
  const passed = shiftPassed(game);
  return (
    <section
      className="papa-game"
      aria-label="Kitchen service"
      data-interior-game-open="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="papa-top">
        <div>
          <b>Day {game.day}</b>
          <span>
            {game.served}/{dayGoal(game.day)} served
          </span>
        </div>
        <div>
          <time>
            {Math.floor(game.remaining / 60)}:
            {Math.floor(game.remaining % 60)
              .toString()
              .padStart(2, "0")}
          </time>
          <span>{game.tips} tips</span>
          {game.combo > 1 && <b>×{game.combo}</b>}
        </div>
        <button
          className="papa-close"
          ref={focusElement}
          aria-label="Close Kitchen"
          onClick={close}
        >
          ×
        </button>
      </header>
      {game.phase === "service" && (
        <>
          {!!game.orders.length && (
            <nav className="papa-open-tickets" aria-label="Open orders">
              {game.orders.map((order) => (
                <button
                  key={order.ticket.id}
                  aria-pressed={order.ticket.id === game.selected}
                  onClick={() => {
                    arm(null);
                    dispatch({ type: "select", id: order.ticket.id });
                  }}
                >
                  {order.ticket.name}
                  <small>
                    {order.stage === "build"
                      ? "Build"
                      : order.onGrill
                        ? "On grill"
                        : "Raw"}
                  </small>
                  {order.onGrill &&
                    order.sideTime > cookTarget(order.ticket) + 0.8 && (
                      <i className="papa-hot" aria-label="Overcooking" />
                    )}
                </button>
              ))}
            </nav>
          )}
          {current && (
            <aside
              className="papa-ticket"
              aria-label={`${current.ticket.name}'s ticket`}
            >
              <header>
                <b>{current.ticket.name}</b>
                <span>{current.ticket.doneness}</span>
              </header>
              <Ingredients ticket={current.ticket} />
            </aside>
          )}
          {game.station === "build" && current?.stage === "build" && (
            <div
              ref={dropZone}
              className={`papa-drop-zone${armed || ghost ? " papa-drop-zone--active" : ""}`}
              aria-hidden="true"
            />
          )}
          <div className="papa-dock">
            <nav className="papa-stations" aria-label="Kitchen stations">
              {(["orders", "grill", "build"] as const).map((station, i) => (
                <button
                  key={station}
                  aria-pressed={game.station === station}
                  onClick={() => {
                    arm(null);
                    dispatch({ type: "station", station });
                  }}
                >
                  <small>0{i + 1}</small>
                  {station[0].toUpperCase() + station.slice(1)}
                  <span>
                    {station === "orders"
                      ? game.queue.length
                      : game.orders.filter((order) =>
                          station === "grill"
                            ? order.onGrill
                            : order.stage === "build",
                        ).length}
                  </span>
                </button>
              ))}
            </nav>
            <div className={`papa-actions papa-actions--${game.station}`}>
              {game.station === "orders" && (
                <div className="papa-queue">
                  {game.queue.map((ticket) => (
                    <article className="papa-order" key={ticket.id}>
                      <header>
                        <b>{ticket.name}</b>
                        <small>{ticket.doneness}</small>
                      </header>
                      <Ingredients ticket={ticket} />
                      <progress
                        aria-label={`${ticket.name}'s patience`}
                        max={62}
                        value={62 - ticket.waited}
                      />
                      <button
                        disabled={game.orders.length >= 3}
                        aria-label={`Take ${ticket.name}'s order`}
                        onClick={() =>
                          dispatch({ type: "take", id: ticket.id })
                        }
                      >
                        Take order
                      </button>
                    </article>
                  ))}
                  {!game.queue.length && (
                    <p>
                      {game.orders.length
                        ? "Orders on the rail."
                        : "Next customer arriving…"}
                    </p>
                  )}
                </div>
              )}
              {game.station === "grill" && (
                <>
                  {!current && <p>Take an order first.</p>}
                  {current?.stage === "build" && (
                    <button
                      onClick={() =>
                        dispatch({ type: "station", station: "build" })
                      }
                    >
                      Go to build
                    </button>
                  )}
                  {current?.stage === "grill" && (
                    <>
                      <div className="papa-cook-status">
                        <b>
                          {current.ticket.name} · {current.ticket.doneness}
                        </b>
                        <span>
                          {current.onGrill
                            ? `Side ${current.flipped ? 2 : 1}`
                            : "Fresh patty"}
                        </span>
                      </div>
                      {current.onGrill && (
                        <div
                          className="papa-heat"
                          aria-label="Grill timing"
                          role="meter"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.min(
                            100,
                            Math.round(
                              (current.sideTime /
                                (cookTarget(current.ticket) * 1.9)) *
                                100,
                            ),
                          )}
                        >
                          <span className="papa-heat-window" />
                          <i
                            style={{
                              left: `${Math.min(99, (current.sideTime / (cookTarget(current.ticket) * 1.9)) * 100)}%`,
                            }}
                          />
                        </div>
                      )}
                      <div className="papa-action-row">
                        {!current.onGrill ? (
                          <button
                            disabled={
                              game.orders.filter((order) => order.onGrill)
                                .length >= 2
                            }
                            onClick={() => act({ type: "drop" })}
                          >
                            Put on grill
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              act({ type: current.flipped ? "lift" : "flip" })
                            }
                          >
                            {current.flipped ? "Lift to build" : "Flip patty"}
                          </button>
                        )}
                        <button
                          className="papa-secondary"
                          onClick={() => act({ type: "bin" })}
                        >
                          Bin
                        </button>
                      </div>
                      <small className="papa-hint">
                        Flip and lift in the gold zone. Two patties fit.
                      </small>
                    </>
                  )}
                </>
              )}
              {game.station === "build" && (
                <>
                  {current?.stage !== "build" ? (
                    <p>Cook a patty first.</p>
                  ) : (
                    <>
                      <div
                        className="papa-toppings"
                        aria-label="Burger ingredients"
                      >
                        {[...TOPPINGS, "top" as const].map((ingredient) => (
                          <button
                            key={ingredient}
                            disabled={
                              current.layers.at(-1)?.ingredient === "top"
                            }
                            aria-label={`Add ${ingredientName(ingredient)}`}
                            aria-pressed={armed === ingredient}
                            onClick={(event) => {
                              if (event.detail === 0) arm(ingredient);
                            }}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              event.currentTarget.setPointerCapture(
                                event.pointerId,
                              );
                              dragging.current = {
                                ingredient,
                                x: event.clientX,
                                y: event.clientY,
                              };
                            }}
                            onPointerMove={(event) => {
                              if (
                                dragging.current &&
                                Math.hypot(
                                  event.clientX - dragging.current.x,
                                  event.clientY - dragging.current.y,
                                ) > 9
                              )
                                setGhost({
                                  ingredient,
                                  x: event.clientX,
                                  y: event.clientY,
                                });
                            }}
                            onPointerUp={drop}
                            onPointerCancel={() => {
                              dragging.current = null;
                              setGhost(null);
                            }}
                          >
                            <i
                              className={`papa-food papa-food--${ingredient}`}
                            />
                            {ingredientName(ingredient)}
                          </button>
                        ))}
                      </div>
                      {armed && (
                        <div className="papa-placement">
                          <div className="papa-aim">
                            <i />
                            <span ref={aimMarker} />
                          </div>
                          <button onClick={place}>
                            Place {ingredientName(armed)}
                          </button>
                        </div>
                      )}
                      <div className="papa-action-row">
                        <button
                          className="papa-secondary"
                          disabled={!current.layers.length}
                          onClick={() => {
                            arm(null);
                            act({ type: "undo" });
                          }}
                        >
                          Undo
                        </button>
                        <button
                          disabled={current.layers.at(-1)?.ingredient !== "top"}
                          onClick={() => {
                            arm(null);
                            act({ type: "serve" });
                          }}
                        >
                          Serve {current.ticket.name}
                        </button>
                        <button
                          className="papa-secondary"
                          onClick={() => {
                            arm(null);
                            act({ type: "bin" });
                          }}
                        >
                          Bin
                        </button>
                      </div>
                      <small className="papa-hint">
                        Drag onto the burger, or tap and time the placement.
                      </small>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
      {game.phase === "grade" && game.grade && (
        <div className="papa-result" role="status">
          <h2>
            {game.grade.name} · {game.grade.total}%
          </h2>
          <div className="papa-grades">
            {(["wait", "grill", "build"] as const).map((key) => (
              <div key={key}>
                <span>{key[0].toUpperCase() + key.slice(1)}</span>
                <b>{game.grade![key]}%</b>
              </div>
            ))}
          </div>
          <p>
            +{game.grade.tip} tips{game.combo > 1 ? ` · ×${game.combo}` : ""}
          </p>
          <button onClick={() => dispatch({ type: "next" })}>Next order</button>
        </div>
      )}
      {game.phase === "results" && (
        <div className="papa-result" role="status">
          <h2>{passed ? "Shift complete" : "Shift closed"}</h2>
          <div className="papa-grades">
            <div>
              <span>Served</span>
              <b>
                {game.served}/{dayGoal(game.day)}
              </b>
            </div>
            <div>
              <span>Average</span>
              <b>{average}%</b>
            </div>
            <div>
              <span>Tips</span>
              <b>{game.tips}</b>
            </div>
          </div>
          <p>
            {game.missed
              ? `${game.missed} ${game.missed === 1 ? "customer left" : "customers left"}`
              : passed
                ? `Day ${game.day + 1} unlocked`
                : "80% average to advance"}
          </p>
          <button
            onClick={() => {
              arm(null);
              dispatch({ type: "start", nextDay: passed });
            }}
          >
            {passed ? "Next day" : "Try again"}
          </button>
          <button className="papa-secondary" onClick={close}>
            Back to room
          </button>
        </div>
      )}
      {ghost && (
        <div
          className="papa-drag"
          style={{ left: ghost.x, top: ghost.y }}
          aria-hidden="true"
        >
          <i className={`papa-food papa-food--${ghost.ingredient}`} />
        </div>
      )}
    </section>
  );
}

export function PapaKitchenGame({ onReward }: InteriorGameProps) {
  const active = useGameMode((s) => s.active?.id === "kitchen");
  const hidden = useGame(
    (s) => s.paused || s.panel !== "none" || s.build || s.near === "exit",
  );
  const [game, dispatch] = useReducer(papaReducer, undefined, () =>
    newPapaGame(),
  );
  const [armed, arm] = useState<Topping | null>(null);
  const timer = useRef(0),
    aim = useRef(0),
    aimMarker = useRef<HTMLSpanElement>(null),
    center = useRef({ x: 0, y: 0 }),
    dropZone = useRef<HTMLDivElement>(null),
    pendingFocus = useRef(false),
    paid = useRef({ run: -1, tips: 0 });
  const gl = useThree((s) => s.gl),
    size = useThree((s) => s.size);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  const close = () => {
    pendingFocus.current = true;
    arm(null);
    dispatch({ type: "stop" });
    endGameMode();
  };
  useEffect(() => {
    if (!active) return;
    const stop = () => {
      pendingFocus.current = true;
      arm(null);
      dispatch({ type: "stop" });
      endGameMode();
    };
    window.addEventListener("interior-game-close", stop);
    return () => window.removeEventListener("interior-game-close", stop);
  }, [active]);
  useEffect(() => {
    if (active && game.phase === "idle") {
      pendingFocus.current = true;
      dispatch({ type: "start" });
    }
  }, [active, game.phase]);
  useEffect(() => {
    if (paid.current.run !== game.run)
      paid.current = { run: game.run, tips: 0 };
    if (game.tips > paid.current.tips) {
      const amount = game.tips - paid.current.tips;
      paid.current.tips = game.tips;
      onReward?.("cooking", amount);
    }
  }, [game.run, game.tips, onReward]);
  const focusElement = (node: HTMLButtonElement | null) => {
    if (node && pendingFocus.current) {
      node.focus({ preventScroll: true });
      pendingFocus.current = false;
    }
  };
  useFrame((state, dt) => {
    if (
      !active ||
      !gameIsActive() ||
      game.phase === "idle" ||
      game.phase === "results"
    ) {
      timer.current = 0;
      return;
    }
    timer.current += Math.min(dt, 0.25);
    if (timer.current >= 0.1) {
      dispatch({ type: "tick", dt: timer.current });
      timer.current = 0;
    }
    aim.current = Math.sin(state.clock.elapsedTime * 2.45) * 0.68;
    if (aimMarker.current)
      aimMarker.current.style.left = `${(aim.current / 1.4 + 0.5) * 100}%`;
  });
  return (
    <>
      {active && (
        <PapaKitchenScene
          game={game}
          dispatch={dispatch}
          armed={armed}
          aim={aim}
          center={center}
          dropZone={dropZone}
        />
      )}
      {!hidden && (
        <Html
          portal={portal}
          fullscreen={active}
          center={!active}
          position={active ? [0, GAME_STAGE_Y + 2, 0] : [0, 0.4, 6]}
          zIndexRange={[40, 20]}
          wrapperClass="papa-html"
          calculatePosition={() =>
            active
              ? [size.width / 2, size.height / 2]
              : [size.width - 104, size.height - 76]
          }
        >
          {active ? (
            <KitchenControls
              game={game}
              dispatch={dispatch}
              close={close}
              armed={armed}
              arm={arm}
              aim={aim}
              aimMarker={aimMarker}
              center={center}
              dropZone={dropZone}
              focusElement={focusElement}
            />
          ) : (
            <button
              className="papa-play"
              ref={focusElement}
              onClick={() => {
                pendingFocus.current = true;
                if (startGameMode("kitchen")) {
                  dispatch({ type: "start" });
                } else pendingFocus.current = false;
              }}
            >
              Play Kitchen
            </button>
          )}
        </Html>
      )}
    </>
  );
}
