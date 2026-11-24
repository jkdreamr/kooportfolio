import { useEffect, useRef, useState } from "react";
import { runtime, useGame, walkTo, type Scene } from "../core/store";
import { keys, touch } from "../core/input";
import { dailySeed, raceTime } from "../core/rowing";
import { useRaceHud } from "../scenes/Rowing";
import { CourtControls, useBasketHud } from "../scenes/Basketball";
import { Icon } from "./Icon";
import { destinationsInWorld, doors, isInterior } from "../core/world";
import { WORLDS } from "../core/worlds";
import { profile } from "../../content/profile";
import { WorldLabels } from "../world/Labels";
import { roomFor } from "../core/room";
import { useGameMode } from "../core/gameMode";
import { SKATE_EXIT } from "../core/skate";
import { RoomStory } from "./RoomStory";
import type { PlaceId } from "../core/world";
import { npcName } from "../core/npcState";
import { Leaderboard } from "./Leaderboard";
import { TravelMap } from "./TravelMap";

export function Joystick() {
  const pad = useRef<HTMLDivElement>(null),
    [pos, setPos] = useState([0, 0]);
  const reset = () => {
    touch.x = 0;
    touch.z = 0;
    setPos([0, 0]);
  };
  return (
    <div
      className="joystick"
      ref={pad}
      aria-label="Touch movement joystick"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const r = pad.current!.getBoundingClientRect(),
          x = (e.clientX - r.left - r.width / 2) / 35,
          z = (e.clientY - r.top - r.height / 2) / 35,
          m = Math.max(1, Math.hypot(x, z));
        touch.x = x / m;
        touch.z = z / m;
        setPos([touch.x * 30, touch.z * 30]);
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
      onLostPointerCapture={reset}
    >
      <span style={{ transform: `translate(${pos[0]}px,${pos[1]}px)` }} />
    </div>
  );
}
export function RaceHud() {
  const { race, place } = useRaceHud();
  const pointers = useRef(new Map<number, "left" | "right" | "burst">());
  const [held, setHeld] = useState<string[]>([]);
  const updateTouch = () => {
    const values = [...pointers.current.values()];
    runtime.steer =
      Number(values.includes("right")) - Number(values.includes("left"));
    runtime.burst = values.includes("burst");
    setHeld(values);
  };
  const touchButton = (control: "left" | "right" | "burst") => ({
    "data-held": held.includes(control),
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, control);
      updateTouch();
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      pointers.current.delete(event.pointerId);
      updateTouch();
    },
    onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => {
      pointers.current.delete(event.pointerId);
      updateTouch();
    },
    onLostPointerCapture: (event: React.PointerEvent<HTMLButtonElement>) => {
      pointers.current.delete(event.pointerId);
      updateTouch();
    },
  });
  useEffect(
    () => () => {
      runtime.steer = 0;
      runtime.burst = false;
    },
    [],
  );
  return (
    <>
      <div className="challenge-heading">
        <h1>Regatta</h1>
        <p className="keyboard-hint">
          A / D steer · 1 / 2 / 3 cadence · hold Space for a burst
        </p>
        <p className="touch-hint">Steer with arrows · hold burst</p>
      </div>
      <div className="race-progress">
        <div
          style={{ width: `${(race.distance / runtime.raceLength) * 100}%` }}
        />
        <span>Start</span>
        <span>
          {Math.floor(race.distance)} / {runtime.raceLength} m
        </span>
        <span>Finish</span>
      </div>
      {race.time < 0 && (
        <div className="countdown">
          <span>{Math.ceil(-race.time)}</span>
          <small>Ready</small>
        </div>
      )}
      <div className="race-instruments">
        <div>
          <small>Time</small>
          <strong>{raceTime(race.time)}</strong>
        </div>
        <div>
          <small>Place</small>
          <strong>
            {place}
            <em> / 4</em>
          </strong>
        </div>
        <div>
          <small>Speed</small>
          <strong>
            {race.speed.toFixed(1)}
            <em> m/s</em>
          </strong>
        </div>
      </div>
      <div className="race-control-panel">
        <div className="stamina-label">
          <span>Crew energy</span>
          <b>{Math.round(race.stamina)}%</b>
        </div>
        <div className="energy-track">
          <i style={{ width: `${race.stamina}%` }} />
        </div>
        <div className="cadence-switch">
          {[
            [24, "Settle"],
            [30, "Rhythm"],
            [36, "Push"],
          ].map(([n, label]) => (
            <button
              className={runtime.raceCadence === n ? "selected" : ""}
              key={n}
              onClick={() => {
                runtime.raceCadence = Number(n);
              }}
            >
              <small>{n} SPM</small>
              {label}
            </button>
          ))}
        </div>
        <p>
          {race.bank
            ? "Shallows — steer inside the buoys."
            : race.stamina < 20
              ? "Low energy — settle the pace."
              : "Stay in the pale current."}
        </p>
      </div>
      {race.splits.length > 0 && (
        <div className="last-split">
          {race.splits.length * 100} m split{" "}
          <b>{raceTime(race.splits[race.splits.length - 1])}</b>
        </div>
      )}
      <div className="race-touch">
        <button aria-label="Steer left" {...touchButton("left")}>
          ←
        </button>
        <button className="burst" {...touchButton("burst")}>
          Burst
        </button>
        <button aria-label="Steer right" {...touchButton("right")}>
          →
        </button>
      </div>
    </>
  );
}
export function BasketHud() {
  const hud = useBasketHud();
  return (
    <>
      <div className="challenge-heading">
        <h1>Court</h1>
        <p className="touch-hint">Drag to move · hold & release to shoot</p>
      </div>
      <p className="court-keyboard-hint keyboard-hint">
        WASD move · Hold Space to charge, release to shoot · Q / E aim
      </p>
      <div className="basket-score">
        <div>
          <small>Score</small>
          <strong>{hud.score.toString().padStart(2, "0")}</strong>
        </div>
        <span />
        <div>
          <small>Time</small>
          <strong>
            {Math.ceil(hud.time)}
            <em>s</em>
          </strong>
        </div>
      </div>
      <div className="shot-feedback" aria-live="polite">
        {hud.feedback}
      </div>
      <div className="shot-panel">
        <div className="stamina-label">
          <span>{hud.holding ? "Shot power" : "Rebound"}</span>
          <span>{hud.holding ? "Hold & release" : "Next ball soon"}</span>
        </div>
        <div className="power-track">
          <i style={{ width: `${hud.charge * 100}%` }} />
          <b />
        </div>
        <p className="shot-instruction">Release in gold. Closer is easier.</p>
        <label className="aim-label">
          Aim{" "}
          <input
            aria-label="Adjust shot aim"
            type="range"
            min={-0.5}
            max={0.5}
            step={0.01}
            value={runtime.aim}
            onChange={(e) => {
              const a = Number(e.target.value);
              runtime.aim = a;
            }}
          />
          <button
            onClick={() => {
              runtime.aim = 0;
            }}
          >
            Recenter
          </button>
        </label>
        <button
          className="shoot-button"
          disabled={!hud.holding}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            runtime.shooting = true;
          }}
          onPointerUp={() => {
            runtime.shooting = false;
            runtime.shoot = true;
          }}
          onPointerCancel={() => {
            runtime.shooting = false;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.repeat) runtime.shooting = true;
          }}
          onKeyUp={(e) => {
            if (e.key === "Enter") {
              runtime.shooting = false;
              runtime.shoot = true;
            }
          }}
        >
          Hold & release <Icon name="ball" size={18} />
        </button>
      </div>
      <Joystick />
    </>
  );
}
function Modal({
  title,
  eyebrow,
  children,
  close,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = ref.current?.querySelectorAll<HTMLElement>(
        "button,a,input,select",
      );
      if (!els?.length) return;
      const first = els[0],
        last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      old?.focus();
    };
  }, []);
  return (
    <div className="modal-scrim">
      <div
        className="game-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <button
          className="close-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <Icon name="close" />
        </button>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
export function Hud({ interact }: { interact: () => void }) {
  const pendingExit = useRef<Scene | null>(null);
  const gameMode = useGameMode((s) => s.active?.id);
  useEffect(() => {
    const shell = document.querySelector(".game-shell");
    if (!shell) return;
    const sync = () => {
      const overlayLocked = !!shell.querySelector(
        '[data-interior-game-open="true"], .go-card-open, .writing-modal, .theater-dialog',
      );
      if (overlayLocked === useGame.getState().overlayLocked) return;
      keys.clear();
      touch.x = touch.z = 0;
      runtime.path = [];
      runtime.target = null;
      runtime.moving = false;
      useGame.setState({ overlayLocked });
    };
    const observer = new MutationObserver(sync);
    observer.observe(shell, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "data-interior-game-open"],
    });
    sync();
    return () => {
      observer.disconnect();
      useGame.setState({ overlayLocked: false });
    };
  }, []);
  const g = useGame(),
    [confirmBuild, setConfirmBuild] = useState<"garden" | "boathouse" | null>(
      null,
    );
  useEffect(() => {
    if (pendingExit.current && pendingExit.current !== g.scene)
      pendingExit.current = null;
    if (!g.overlayLocked && pendingExit.current === g.scene) {
      const frame = requestAnimationFrame(() => {
        const exit =
          g.scene === "skate" ? SKATE_EXIT : [0, roomFor(g.scene).doorZ];
        walkTo(exit[0], exit[1]);
        pendingExit.current = null;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [g.overlayLocked, g.scene]);
  const hub = g.scene === "hub",
    interior = isInterior(g.scene),
    game = g.scene === "rowing" || g.scene === "basketball";
  const closePanel = () => useGame.setState({ panel: "none" });
  useEffect(() => {
    if (
      !g.notice ||
      g.notice.includes("Another tab") ||
      g.notice.includes("storage") ||
      g.notice.includes("saved file")
    )
      return;
    const t = setTimeout(() => useGame.setState({ notice: "" }), 6000);
    return () => clearTimeout(t);
  }, [g.notice]);
  return (
    <div
      className={`game-ui scene-${g.scene} world-${g.world}`}
      data-game-mode={gameMode}
    >
      <header className="game-header">
        <a className="game-brand" href="/">
          <div>
            <b>
              JOSHUA<span>.EXE</span>
            </b>
          </div>
        </a>
        <div className="resources">
          <div className="resource coins" aria-label={`${g.save.coins} coins`}>
            <Icon name="coin" />
            <b>{g.save.coins}</b>
          </div>
          <div
            className="resource level"
            aria-label={`Level ${1 + Math.floor(g.save.xp / 100)}`}
          >
            <Icon name="star" />
            <b>Lv. {1 + Math.floor(g.save.xp / 100)}</b>
          </div>
          <button
            className="icon-button"
            aria-label={g.muted ? "Unmute sound" : "Mute sound"}
            onClick={() => useGame.setState({ muted: !g.muted })}
          >
            <Icon name={g.muted ? "muted" : "sound"} />
          </button>
          <button
            className="icon-button"
            aria-label="Pause game"
            onClick={() => useGame.setState({ paused: true })}
          >
            <Icon name="pause" />
          </button>
        </div>
      </header>
      {hub && !g.build && <WorldLabels />}
      {hub && <span className="world-name">{WORLDS[g.world].name}</span>}
      {interior && (
        <div className="interior-heading">
          <button
            className="back-link"
            onClick={() => {
              keys.clear();
              touch.x = touch.z = 0;
              pendingExit.current = g.scene;
              window.dispatchEvent(new Event("interior-game-close"));
              if (!useGame.getState().overlayLocked) {
                const exit =
                  g.scene === "skate"
                    ? SKATE_EXIT
                    : [0, roomFor(g.scene).doorZ];
                walkTo(exit[0], exit[1]);
                pendingExit.current = null;
              }
            }}
          >
            ← Exit
          </button>
          <h1>
            {g.scene === "secret"
              ? "Hoover vault"
              : doors.find((door) => door.id === g.scene)?.name}
          </h1>
        </div>
      )}
      {interior && (
        <RoomStory
          key={g.scene}
          scene={g.scene as PlaceId}
          hidden={g.paused || g.panel !== "none"}
        />
      )}
      {g.scene === "rowing" && <RaceHud />}
      {g.scene === "basketball" && (
        <>
          <BasketHud />
          <CourtControls />
        </>
      )}
      {(hub || interior) &&
        !g.build &&
        g.panel !== "npc" &&
        !g.overlayLocked && (
          <>
            <div
              className={`context-action ${g.scene === "stadium" ? "context-action--stadium" : ""} ${g.near ? "visible" : ""}`}
              style={{ zIndex: 20 }}
            >
              <div>
                <strong>
                  {g.near === "hoover-key"
                    ? "Small key"
                    : g.near === "hoover-door"
                      ? "Hoover Tower"
                      : g.near === "stash"
                        ? "Coin stash"
                        : g.near === "photo"
                          ? "Photo booth"
                          : g.near === "stargazing"
                            ? "Telescope"
                            : g.near === "exit"
                              ? "Exit"
                              : g.near === "race"
                                ? "Coxswain Regatta"
                                : g.near === "read"
                                  ? "Meet Joshua"
                                  : g.near === "desk"
                                    ? "Desk"
                                    : g.near === "lift"
                                      ? "Bench press"
                                      : g.near === "npc"
                                        ? npcName()
                                        : doors.find((d) => d.id === g.near)
                                            ?.name}
                </strong>
              </div>
              <button onClick={interact}>
                <kbd>E</kbd>
                {g.near === "hoover-key"
                  ? "Take"
                  : g.near === "hoover-door"
                    ? "Unlock"
                    : g.near === "stash"
                      ? "Collect"
                      : g.near === "photo"
                        ? "Photo"
                        : g.near === "stargazing"
                          ? "Look"
                          : g.near === "exit"
                            ? "Exit"
                            : g.near === "race"
                              ? "Race"
                              : g.near === "read"
                                ? "Read"
                                : g.near === "desk"
                                  ? "Open"
                                  : g.near === "lift"
                                    ? "Play"
                                    : g.near === "npc"
                                      ? "Talk"
                                      : "Enter"}{" "}
                <Icon name="arrow" size={17} />
              </button>
            </div>
            {g.panel === "none" && !g.overlayLocked && !g.traveling && (
              <Joystick />
            )}
          </>
        )}
      {interior && g.scene === "boathouse" && g.near === "race" && (
        <div className="race-select">
          <button
            onClick={() => {
              runtime.raceLength = 360;
              runtime.raceSeed = 1;
              runtime.raceMode = "sprint";
              g.go("rowing");
            }}
          >
            <b>Sprint</b>
            <span>360 m · about 40 sec →</span>
          </button>
          <button
            onClick={() => {
              runtime.raceLength = 750;
              runtime.raceSeed = 2;
              runtime.raceMode = "regatta";
              g.go("rowing");
            }}
          >
            <b>Regatta</b>
            <span>750 m · about 80 sec →</span>
          </button>
          <button
            onClick={() => {
              runtime.raceLength = 750;
              runtime.raceSeed = dailySeed();
              runtime.raceMode = "daily";
              g.go("rowing");
            }}
          >
            <b>Daily river</b>
            <span>Same UTC daily seed · unranked →</span>
          </button>
        </div>
      )}
      {g.build && (
        <>
          <div className="build-heading">
            <h1>Build</h1>
          </div>
          <div className="build-panel">
            {(["boathouse", "garden"] as const).map((key) => {
              const level = g.save.upgrades[key],
                cost = level === 1 ? 60 : 120;
              return (
                <div key={key} className="build-option">
                  <div className={`build-preview ${key}`}>
                    <Icon
                      name={key === "boathouse" ? "home" : "star"}
                      size={40}
                    />
                    <span>LV. {level}</span>
                  </div>
                  <div>
                    <h3>
                      {key === "boathouse"
                        ? "The Boathouse"
                        : "The Little Garden"}
                    </h3>
                    <p>
                      {level === 3
                        ? "Max level"
                        : key === "boathouse"
                          ? level === 1
                            ? "A waterside balcony for the crew."
                            : "A lookout tower and new silhouette."
                          : level === 1
                            ? "Flower beds & a leafy pergola."
                            : "More flowers, trees & a place to rest."}
                    </p>
                    <button
                      className="upgrade-button"
                      disabled={level === 3 || g.save.coins < cost}
                      onClick={() => setConfirmBuild(key)}
                    >
                      {level === 3 ? (
                        "Fully upgraded"
                      ) : (
                        <>
                          <Icon name="coin" size={16} /> {cost}{" "}
                          <span>
                            {g.save.coins < cost
                              ? "Not enough coins"
                              : "Upgrade"}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
            <p className="local-note">
              Upgrades change the village, not your scores.
            </p>
            <button
              className="primary-button"
              onClick={() => useGame.setState({ build: false })}
            >
              Done <Icon name="check" size={17} />
            </button>
          </div>
        </>
      )}
      {hub && (
        <nav className="world-toolbar" aria-label="World tools">
          {[
            [
              "travel",
              "Travel",
              () => useGame.setState({ build: false, panel: "travel" }),
            ],
            [
              "home",
              "Places",
              () => useGame.setState({ build: false, panel: "places" }),
            ],
            [
              "build",
              "Build",
              () => useGame.setState({ build: !g.build, panel: "none" }),
            ],
            [
              "avatar",
              "You",
              () => useGame.setState({ panel: "avatar", build: false }),
            ],
            [
              "memories",
              "Memories",
              () => useGame.setState({ panel: "memories", build: false }),
            ],
            [
              "settings",
              "Settings",
              () => useGame.setState({ panel: "settings", build: false }),
            ],
          ].map(([icon, label, action]) => (
            <button
              key={String(label)}
              className={
                g.build
                  ? icon === "build"
                    ? "active"
                    : ""
                  : g.panel === icon ||
                      (icon === "home" && g.panel === "places")
                    ? "active"
                    : ""
              }
              onClick={action as () => void}
            >
              <Icon name={String(icon)} size={21} />
              <span>{String(label)}</span>
            </button>
          ))}
          <a href="/work">
            <Icon name="back" size={20} />
            <span>Portfolio</span>
          </a>
        </nav>
      )}
      <div className="game-footer">
        <span>
          <i /> Saved locally
        </span>
        <button onClick={() => useGame.setState({ panel: "help" })}>
          <Icon name="help" size={15} />
          <span className="keyboard-hint">
            {game ? "Controls" : "WASD / E"}
          </span>
          <span className="touch-hint">Controls</span>
        </button>
      </div>
      {g.notice && (
        <div className="game-toast" role="status">
          {g.notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => useGame.setState({ notice: "" })}
          >
            ×
          </button>
        </div>
      )}
      {confirmBuild && (
        <Modal eyebrow="" title="Upgrade?" close={() => setConfirmBuild(null)}>
          <p>
            {confirmBuild === "boathouse"
              ? "Expand the boathouse"
              : "Improve the garden"}{" "}
            for {g.save.upgrades[confirmBuild] === 1 ? 60 : 120} coins?
          </p>
          <button
            className="primary-button"
            onClick={() => {
              g.upgrade(confirmBuild);
              setConfirmBuild(null);
            }}
          >
            Confirm upgrade <Icon name="check" size={17} />
          </button>
          <button
            className="quiet-button"
            onClick={() => setConfirmBuild(null)}
          >
            Cancel
          </button>
        </Modal>
      )}
      {g.panel === "avatar" && (
        <Modal eyebrow="" title="Your character" close={closePanel}>
          <div className="color-swatches">
            {[
              "#6f8670",
              "#b6745b",
              "#698e9a",
              "#c7a45f",
              "#8b7a99",
              "#414b53",
            ].map((c) => (
              <button
                key={c}
                style={{ background: c }}
                aria-label={`Wear ${c}`}
                aria-pressed={g.save.color === c}
                onClick={() => g.customize(c, g.save.hat)}
              >
                {g.save.color === c && <Icon name="check" />}
              </button>
            ))}
          </div>
          <button
            className="setting-row"
            onClick={() => g.customize(g.save.color, !g.save.hat)}
          >
            <span>Cap</span>
            <b>{g.save.hat ? "On" : "Off"}</b>
          </button>
          <button className="primary-button" onClick={closePanel}>
            Done
          </button>
        </Modal>
      )}
      {g.panel === "memories" && (
        <Modal eyebrow="" title="Joshua" close={closePanel}>
          <div className="memory-card">
            <Icon name="oar" size={28} />
            <div>
              <b>Coxswain</b>
            </div>
          </div>
          <div className="memory-card">
            <Icon name="memories" size={28} />
            <div>
              <b>Stanford CS + math</b>
            </div>
          </div>
          <button
            className="setting-row"
            onClick={() => useGame.setState({ panel: "leaderboard" })}
          >
            Records <Icon name="arrow" />
          </button>
        </Modal>
      )}
      {g.panel === "leaderboard" && (
        <Leaderboard
          initialBoard={
            g.scene === "basketball"
              ? "basketball-attack"
              : runtime.raceLength === 750
                ? "rowing-regatta"
                : "rowing-sprint"
          }
          onClose={closePanel}
        />
      )}
      {g.panel === "settings" && (
        <Modal eyebrow="" title="Settings" close={closePanel}>
          <button
            className="setting-row"
            onClick={() => useGame.setState({ muted: !g.muted })}
          >
            <span>Sound</span>
            <b>{g.muted ? "Off" : "On"}</b>
          </button>
          <button
            className="setting-row"
            onClick={() =>
              useGame.setState({
                quality: g.quality === "high" ? "low" : "high",
              })
            }
          >
            <span>Visual quality</span>
            <b>{g.quality === "high" ? "Full detail" : "Low power"}</b>
          </button>
          <p className="local-note">
            Saved in this browser only. Back up your save to keep a copy.
          </p>
          <button
            className="setting-row"
            onClick={() => {
              const data = new Blob([JSON.stringify(g.save, null, 2)], {
                  type: "application/json",
                }),
                url = URL.createObjectURL(data),
                a = document.createElement("a");
              a.href = url;
              a.download = "joshua-exe-save.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <span>Back up your local save</span>
            <span>↓</span>
          </button>
          <a className="setting-row" href="/">
            Replay the portfolio intro <span>↗</span>
          </a>
        </Modal>
      )}
      {g.panel === "help" && (
        <Modal eyebrow="" title="Controls" close={closePanel}>
          <div className="help-grid">
            <b>Wander</b>
            <p>
              <span className="keyboard-hint">
                WASD / arrows or click the ground. Hold Shift to sprint.
              </span>
              <span className="touch-hint">
                Drag the round joystick or tap the ground.
              </span>{" "}
              Choose a building label to walk there.
            </p>
            <b>Doors</b>
            <p>
              Walk to the door and{" "}
              <span className="keyboard-hint">press E or </span>tap Enter.
              Inside, walk back to the exit mat.
            </p>
            <b>Row</b>
            <p>
              <span className="keyboard-hint">
                A/D to steer. 1/2/3 for cadence. Space for a burst.{" "}
              </span>
              <span className="touch-hint">
                Hold arrows to steer and BURST to sprint. Tap a pace.{" "}
              </span>
              Stay inside the buoys; sprinting drains energy.
            </p>
            <b>Shoot</b>
            <p>
              <span className="keyboard-hint">
                WASD to move. Hold Space or Shoot. Q/E to aim.{" "}
              </span>
              <span className="touch-hint">
                Drag the joystick. Hold Shoot; slide to aim.{" "}
              </span>
              Release in the gold. Chase rebounds or wait for a new ball.
            </p>
            <b>Grow</b>
            <p>
              Finish games to earn local coins. Build adds visible architecture,
              never paid advantages.
            </p>
          </div>
        </Modal>
      )}
      {g.panel === "travel" && (
        <Modal title="Travel" close={closePanel}>
          <TravelMap
            world={g.world}
            onChoose={(destination) => {
              keys.clear();
              touch.x = touch.z = 0;
              runtime.path = [];
              runtime.target = null;
              useGame.setState({ panel: "none", travelRequest: destination });
            }}
          />
        </Modal>
      )}
      {g.panel === "places" && (
        <Modal title="Places" close={closePanel}>
          <nav className="places-list" aria-label="Walk to a place">
            {destinationsInWorld(g.world).map((door) => (
              <button
                key={door.id}
                onClick={() => {
                  closePanel();
                  if (g.scene !== "hub") g.go("hub");
                  walkTo(door.x, door.z);
                }}
              >
                <span>{door.name}</span>
                <Icon name="arrow" size={18} />
              </button>
            ))}
          </nav>
        </Modal>
      )}
      {g.panel === "desk" && (
        <Modal title="Desk" close={closePanel}>
          <div className="study-links">
            <a
              href="https://github.com/jkdreamr"
              target="_blank"
              rel="noreferrer"
            >
              GitHub <span>↗</span>
            </a>
            <a href="/work" target="_blank" rel="noreferrer">
              Work <span>↗</span>
            </a>
          </div>
        </Modal>
      )}
      {g.panel === "profile" && (
        <Modal eyebrow="" title="Joshua Koo" close={closePanel}>
          <p>{profile.bio}</p>
          <div className="study-links">
            {profile.socials.map(([name, url]) => (
              <a key={name} href={url} target="_blank" rel="noreferrer">
                {name}
                <span>↗</span>
              </a>
            ))}
            <a href={`mailto:${profile.email}`}>
              {profile.email}
              <span>↗</span>
            </a>
          </div>
        </Modal>
      )}
      {g.paused && (
        <Modal
          eyebrow=""
          title="Paused"
          close={() => useGame.setState({ paused: false })}
        >
          <button
            className="primary-button"
            onClick={() => useGame.setState({ paused: false })}
          >
            Keep playing <Icon name="arrow" size={17} />
          </button>
          {!hub && (
            <button className="quiet-button" onClick={() => g.go("hub")}>
              Return to village
            </button>
          )}
          <a className="quiet-button" href="/">
            Back to portfolio
          </a>
        </Modal>
      )}
      {g.result && g.panel !== "leaderboard" && (
        <Modal
          title={g.result.title}
          close={() => g.go(g.scene === "rowing" ? "boathouse" : "hub")}
        >
          <div className="result-score">{g.result.score}</div>
          <p className="result-detail">{g.result.detail}</p>
          <div className="reward-line">
            <Icon name="coin" size={23} />
            <b>+{g.result.coins}</b>
            <span>coins</span>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              runtime.aim = 0;
              runtime.raceCadence = 30;
              g.go(g.scene as Scene);
            }}
          >
            Play again <Icon name="arrow" size={17} />
          </button>
          <button
            className="quiet-button"
            onClick={() => g.go(g.scene === "rowing" ? "boathouse" : "hub")}
          >
            {g.scene === "rowing"
              ? "Back to the boathouse"
              : "Back to the village"}
          </button>
          <small className="local-note">
            Local record only. No global rankings or cloud saves.
          </small>
          <button
            className="quiet-button"
            onClick={() => useGame.setState({ panel: "leaderboard" })}
          >
            Records
          </button>
        </Modal>
      )}
    </div>
  );
}
