import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { runtime, useGame } from "../core/store";
import { keys, touch } from "../core/input";
import {
  canTravel,
  travelOptions,
  WORLD_NAMES,
  type TravelMode,
  type TravelOption,
  type TravelStop,
  type TravelWorld,
} from "../core/travel";
import { Ball, Box, Cylinder, Sign } from "./Models";
import { JourneyTrain, PassengerJet, RoadCar } from "./TravelVehicles";
import "./world-travel.css";

export type { TravelWorld, TravelMode } from "../core/travel";
type Journey = TravelOption & { from: TravelWorld };

function clearTravelInput() {
  keys.clear();
  touch.x = touch.z = 0;
  runtime.path = [];
  runtime.target = null;
  runtime.moving = false;
  runtime.shooting = runtime.burst = false;
  runtime.shoot = false;
}

function Airport() {
  return (
    <group position={[58, 0, 52]} name="island-airport">
      <Box p={[0, 0.14, 2]} s={[11, 0.28, 11]} c="#b4af98" />
      <Box p={[0, 1.8, 0]} s={[9, 3.2, 7]} c="#c5b493" />
      <Box p={[0, 3.5, 0]} s={[9.8, 0.4, 7.8]} c="#385b62" />
      <Box p={[0, 1.7, 3.55]} s={[3, 2.8, 0.12]} c="#385861" />
      {[-3.1, 3.1].map((x) => (
        <Box key={x} p={[x, 2.1, 3.56]} s={[1.9, 1.2, 0.14]} c="#a7c8c2" />
      ))}
      <Box p={[0, 3.2, 4.1]} s={[8, 0.2, 1.7]} c="#b49a64" />
      <Sign text="AIRPORT" p={[0, 3.9, 3.8]} size={[4.7, 0.7]} />
      <Cylinder p={[-3.4, 4.5, 0]} s={[0.08, 2.3, 0.08]} c="#b49a64" />
      <Box
        p={[-2.8, 5.3, 0]}
        s={[1.3, 0.3, 0.35]}
        c="#b95840"
        r={[0, 0, -0.1]}
      />
      <Box p={[0, 0.36, 5]} s={[4, 0.2, 2]} c="#d1c29e" />
    </group>
  );
}

function JourneyScenery({ plane, train }: { plane: boolean; train: boolean }) {
  return (
    <group>
      <Box
        p={[0, -0.55, 0]}
        s={[100, 0.5, 180]}
        c={plane ? "#76a9ab" : "#89a56b"}
        sharp
      />
      {plane ? (
        [-43, 43].map((z) => (
          <group key={z}>
            <Box p={[0, -0.2, z]} s={[36, 0.7, 32]} c="#8ca570" />
            <Box p={[0, 0.18, z]} s={[8, 0.12, 30]} c="#52636a" sharp />
            {[-10, -5, 0, 5, 10].map((dz) => (
              <Box
                key={dz}
                p={[0, 0.26, z + dz]}
                s={[0.16, 0.04, 2]}
                c="#f0e7cf"
                sharp
              />
            ))}
          </group>
        ))
      ) : (
        <>
          <Box
            p={[0, -0.08, 0]}
            s={[train ? 4 : 8, 0.16, 160]}
            c={train ? "#a69a80" : "#53656a"}
            sharp
          />
          {train ? (
            <>
              {[-0.77, 0.77].map((x) => (
                <Box
                  key={x}
                  p={[x, 0.13, 0]}
                  s={[0.13, 0.14, 160]}
                  c="#485860"
                  sharp
                />
              ))}
              {Array.from({ length: 64 }, (_, i) => (
                <Box
                  key={i}
                  p={[0, 0.05, i * 2.5 - 80]}
                  s={[2.5, 0.12, 0.3]}
                  c="#7b5d41"
                  sharp
                />
              ))}
            </>
          ) : (
            Array.from({ length: 32 }, (_, i) => (
              <Box
                key={i}
                p={[0, 0.02, i * 5 - 80]}
                s={[0.14, 0.03, 2.5]}
                c="#e9d7a4"
                sharp
              />
            ))
          )}
        </>
      )}
      {!plane &&
        [-1, 1].flatMap((side) =>
          Array.from({ length: 15 }, (_, i) => (
            <group
              key={`${side}:${i}`}
              position={[side * (10 + (i % 3) * 4), 0, i * 10 - 70]}
            >
              <Cylinder p={[0, 0.8, 0]} s={[0.2, 1.6, 0.2]} c="#766044" />
              <Ball
                p={[0, 2.3, 0]}
                s={[1.4, 1.9, 1.4]}
                c={i % 2 ? "#658351" : "#829358"}
              />
            </group>
          )),
        )}
      {plane &&
        [-1, 1].flatMap((side) =>
          [-18, 0, 18].map((z) => (
            <group key={`${side}:${z}`} position={[side * 11, 11, z]}>
              <Ball s={[3, 1.1, 1.8]} c="#f2eee2" />
              <Ball p={[1, 0.6, 0]} s={[1.9, 1, 1.6]} c="#f2eee2" />
            </group>
          )),
        )}
    </group>
  );
}

function JourneyScene({
  trip,
  elapsed,
  progress,
  reduced,
  onComplete,
}: {
  trip: Journey;
  elapsed: React.RefObject<number>;
  progress: React.RefObject<HTMLProgressElement | null>;
  reduced: boolean;
  onComplete: () => void;
}) {
  const actor = useRef<THREE.Group>(null);
  const done = useRef(false);
  const plane = trip.mode === "plane",
    train = trip.mode === "train";
  const duration = reduced ? 3 : plane ? 9 : train ? 8 : 6;
  useFrame(({ camera }, delta) => {
    if (done.current || document.hidden) return;
    elapsed.current += Math.min(delta, 0.1);
    const p = Math.min(1, elapsed.current / duration);
    if (progress.current) progress.current.value = p;
    const z = reduced ? 0 : -35 + p * 70;
    const y = plane
      ? 1.1 + (reduced ? 7 : Math.sin(p * Math.PI) ** 1.25 * 14)
      : train
        ? 0.35
        : 0;
    if (actor.current) {
      actor.current.position.set(0, y, z);
      actor.current.rotation.x =
        plane && !reduced ? -0.25 * Math.cos(p * Math.PI) : 0;
    }
    const centerZ = z - (train ? 3.5 : 0);
    camera.position.set(18, y + 13, centerZ + 22);
    camera.lookAt(0, y + 0.8, centerZ);
    if (p === 1) {
      done.current = true;
      onComplete();
    }
  });
  return (
    <>
      <color attach="background" args={["#bfd3d2"]} />
      <fog attach="fog" args={["#bfd3d2", 50, 120]} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[-10, 25, 12]} intensity={2.4} />
      <JourneyScenery plane={plane} train={train} />
      <group ref={actor}>
        {plane ? <PassengerJet /> : train ? <JourneyTrain /> : <RoadCar />}
      </group>
    </>
  );
}

export function WorldTravel({
  world,
  onArrive,
  onTravelChange,
  disabled = false,
}: {
  world: TravelWorld;
  onArrive: (destination: TravelWorld, mode: TravelMode) => void;
  onTravelChange?: (active: boolean) => void;
  disabled?: boolean;
}) {
  const [stop, setStop] = useState<TravelStop | null>(null);
  const [trip, setTrip] = useState<Journey | null>(null);
  const hidden =
    useGame((s) => s.paused || s.build || s.panel !== "none") || disabled;
  const gl = useThree((s) => s.gl);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  const elapsed = useRef(0);
  const progress = useRef<HTMLProgressElement>(null);
  const departure = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [reduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const traveling = trip !== null;
  const cancel = useCallback(() => {
    clearTravelInput();
    setTrip(null);
  }, []);
  useEffect(() => {
    onTravelChange?.(traveling);
    return () => onTravelChange?.(false);
  }, [traveling, onTravelChange]);
  useEffect(() => {
    if (!traveling) return;
    // The nested journey has its own tiny scene. Suspend the covered world.
    setFrameloop("demand");
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
      } else if (
        /^(w|a|s|d|e|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/i.test(
          event.key,
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", keydown, true);
    return () => {
      window.removeEventListener("keydown", keydown, true);
      setFrameloop(useGame.getState().paused ? "demand" : "always");
    };
  }, [traveling, hidden, setFrameloop, cancel]);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      (traveling ? cancelButton : departure).current?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [traveling, hidden]);
  useFrame(() => {
    if (traveling) return;
    const next =
      Math.hypot(runtime.x - 58, runtime.z - 61) < 5
        ? "airport"
        : world !== "korea" && Math.hypot(runtime.x + 76, runtime.z - 12) < 5
          ? "station"
          : null;
    if (next !== stop) setStop(next);
  });
  const depart = (option: TravelOption) => {
    if (
      hidden ||
      traveling ||
      !canTravel(world, option.destination, option.mode)
    )
      return;
    clearTravelInput();
    elapsed.current = 0;
    setTrip({ ...option, from: world });
  };
  const arrive = () => {
    if (!trip) return;
    clearTravelInput();
    setTrip(null);
    onArrive(trip.destination, trip.mode);
  };
  return (
    <group>
      <Airport />
      {!hidden && !trip && stop && (
        <Html
          fullscreen
          calculatePosition={(_object, _camera, size) => [
            size.width / 2,
            size.height / 2,
          ]}
          onOcclude={() => undefined}
          portal={portal}
          zIndexRange={[28, 0]}
          style={{ pointerEvents: "none" }}
        >
          <section
            className={`world-travel-stop world-travel-stop--${stop}`}
            aria-label={stop === "airport" ? "Flights" : "Domestic travel"}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <strong>
              {stop === "airport" ? "Departures" : "Home ↔ Stanford"}
            </strong>
            <div>
              {travelOptions(world, stop).map((option, i) => (
                <button
                  ref={i === 0 ? departure : undefined}
                  key={`${option.mode}:${option.destination}`}
                  onClick={() => depart(option)}
                >
                  {option.mode === "plane"
                    ? "Fly"
                    : option.mode === "car"
                      ? "Drive"
                      : "Train"}{" "}
                  to {WORLD_NAMES[option.destination]}
                </button>
              ))}
            </div>
          </section>
        </Html>
      )}
      {!hidden && trip && (
        <Html
          fullscreen
          calculatePosition={(_object, _camera, size) => [
            size.width / 2,
            size.height / 2,
          ]}
          onOcclude={() => undefined}
          portal={portal}
          zIndexRange={[110, 0]}
        >
          <section
            className="world-journey"
            role="dialog"
            aria-modal="true"
            aria-label={`Travel to ${WORLD_NAMES[trip.destination]}`}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Tab") {
                e.preventDefault();
                cancelButton.current?.focus();
              }
            }}
          >
            <header>
              <h2>
                {WORLD_NAMES[trip.from]} <span aria-hidden="true">→</span>{" "}
                {WORLD_NAMES[trip.destination]}
              </h2>
              <button ref={cancelButton} onClick={cancel}>
                Cancel journey
              </button>
            </header>
            <div className="world-journey-view" aria-hidden="true">
              <Canvas
                orthographic
                camera={{
                  position: [18, 13, 22],
                  zoom: 28,
                  near: 0.1,
                  far: 180,
                }}
                dpr={[1, 1.3]}
                gl={{ antialias: true }}
              >
                <JourneyScene
                  trip={trip}
                  elapsed={elapsed}
                  progress={progress}
                  reduced={reduced}
                  onComplete={arrive}
                />
              </Canvas>
            </div>
            <footer>
              <span>
                {trip.mode === "plane"
                  ? "Flying"
                  : trip.mode === "train"
                    ? "On the train"
                    : "On the road"}
              </span>
              <progress
                ref={progress}
                max={1}
                value={0}
                aria-label="Journey progress"
              />
            </footer>
          </section>
        </Html>
      )}
    </group>
  );
}
