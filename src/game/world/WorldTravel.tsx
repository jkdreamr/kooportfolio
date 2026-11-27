import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { StaticBatch } from "./StaticBatch";
import { runtime, useGame } from "../core/store";
import { keys, touch } from "../core/input";
import {
  canTravel,
  directJourney,
  travelOptions,
  WORLD_NAMES,
  type TravelMode,
  type TravelOption,
  type TravelWorld,
} from "../core/travel";
import { journeyGate } from "../core/journey";
import { announceArrival } from "../core/arrival";
import { Box, Cylinder, Sign } from "./Models";
import { PassengerJet, PassengerStairs } from "./TravelVehicles";
import { IslandJourney, type IslandTrip, type JourneyControl } from "./IslandJourney";
import "./world-travel.css";
import { screenOverlayNoOcclude, screenOverlayPosition, screenOverlayStyle } from "./screenOverlay";

export type { TravelWorld, TravelMode } from "../core/travel";

function clearTravelInput() {
  keys.clear();
  touch.x = touch.z = 0;
  runtime.path = [];
  runtime.target = null;
  runtime.moving = false;
  runtime.shooting = runtime.burst = false;
  runtime.shoot = false;
}

function Airport({
  traveling,
  world,
}: {
  traveling: boolean;
  world: TravelWorld;
}) {
  const gate = journeyGate("plane", world);
  return (
    <group name="island-airport" position={[gate[0] - 58, 0, gate[1] - 61]}>
      <StaticBatch id={`island-airport-${world}`}>
        <group position={[58, 0, 52]}>
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
        <Box p={[58, 0.12, 65]} s={[12, 0.16, 13]} c="#a6aa99" />
        {[-4, 0, 4].map((z) => (
          <Box
            key={z}
            p={[58, 0.21, 65 + z]}
            s={[0.15, 0.02, 1.4]}
            c="#f3e9d0"
          />
        ))}
        {!traveling && (
          <group position={[58, 1.2, 65]}>
            <PassengerJet />
            <PassengerStairs />
          </group>
        )}
      </StaticBatch>
    </group>
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
  const [nearAirport, setNearAirport] = useState(false);
  // Departures opens only once the player has walked away from the gate
  // (more than 7 m) and come back (within 5 m): never on landing (B7).
  const departuresArmed = useRef(false);
  const journeyControl = useRef<JourneyControl>({ cancel: false });
  const [trip, setTrip] = useState<IslandTrip | null>(null);
  const request = useGame((s) => s.travelRequest);
  const paused = useGame((s) => s.paused);
  const hidden = useGame((s) => s.paused || s.panel !== "none") || disabled;
  const gl = useThree((s) => s.gl);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [reduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const traveling = !!trip;
  const finish = useCallback(() => {
    clearTravelInput();
    departuresArmed.current = false;
    journeyControl.current.cancel = false;
    setTrip(null);
  }, []);
  // Cancel is the journey's to perform: it raises the veil, swaps back
  // behind it if the region already changed, and lowers it over the origin.
  const cancel = useCallback(() => {
    if (trip) journeyControl.current.cancel = true;
    else finish();
  }, [trip, finish]);
  const cancelled = useCallback(() => {
    if (trip) {
      [runtime.x, runtime.z] = trip.origin;
      useGame.getState().persist();
    }
    finish();
  }, [trip, finish]);
  useEffect(() => {
    onTravelChange?.(traveling);
    return () => onTravelChange?.(false);
  }, [traveling, onTravelChange]);
  useEffect(() => {
    if (!traveling) return;
    cancelButton.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      // The ordinary pause dialog owns Escape until the journey is resumed.
      if (useGame.getState().paused) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
      } else if (
        /^(w|a|s|d|e|Shift|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/i.test(
          event.key,
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, [traveling, cancel]);
  useFrame(() => {
    if (traveling) return;
    const airport = journeyGate("plane", world);
    const distance = Math.hypot(runtime.x - airport[0], runtime.z - airport[1]);
    if (distance > 7) departuresArmed.current = true;
    const next = departuresArmed.current && distance < 5;
    if (next !== nearAirport) setNearAirport(next);
  });
  const depart = useCallback(
    (option: TravelOption) => {
      if (
        hidden ||
        traveling ||
        !canTravel(world, option.destination, option.mode)
      )
        return;
      const origin: [number, number] = [runtime.x, runtime.z];
      clearTravelInput();
      setTrip({ ...option, from: world, origin, heading: runtime.heading });
    },
    [hidden, traveling, world],
  );
  useEffect(() => {
    // Keep the booking until the local loop has let the passenger off.
    if (!request || hidden || traveling) return;
    useGame.setState({ travelRequest: null });
    const option =
      typeof request === "string" ? directJourney(world, request) : request;
    if (option) depart(option);
  }, [request, world, depart, hidden, traveling]);
  return (
    <group>
      <Airport traveling={traveling} world={world} />
      {trip && (
        <IslandJourney
          trip={trip}
          world={world}
          reduced={reduced}
          control={journeyControl}
          onArrive={() => onArrive(trip.destination, trip.mode)}
          onSwapBack={() => onArrive(trip.from, trip.mode)}
          onCancelled={cancelled}
          onComplete={() => {
            [runtime.x, runtime.z] = journeyGate(trip.mode, trip.destination);
            finish();
            // The world's name, briefly, where Departures used to open.
            announceArrival(trip.destination);
          }}
        />
      )}
      {!hidden && !trip && nearAirport && (
        <Html onOcclude={screenOverlayNoOcclude}
          fullscreen
          calculatePosition={screenOverlayPosition}
          portal={portal}
          zIndexRange={[28, 0]}
          style={screenOverlayStyle}
        >
          <section
            className="world-travel-stop world-travel-stop--airport"
            aria-label="Flights"
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <strong>Departures</strong>
            <div>
              {travelOptions(world, "airport").map((option) => (
                <button
                  key={`${option.mode}:${option.destination}`}
                  onClick={() => depart(option)}
                >
                  {option.mode === "plane" ? "Fly" : "Train"} to{" "}
                  {WORLD_NAMES[option.destination]}
                </button>
              ))}
            </div>
          </section>
        </Html>
      )}
      {trip && !paused && (
        <Html onOcclude={screenOverlayNoOcclude}
          fullscreen
          calculatePosition={screenOverlayPosition}
          portal={portal}
          zIndexRange={[110, 0]}
          style={screenOverlayStyle}
        >
          <div
            className="world-travel-status"
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === " ") event.stopPropagation();
            }}
          >
            <span role="status">
              {WORLD_NAMES[trip.from]} → {WORLD_NAMES[trip.destination]}
            </span>
            <button
              ref={(node) => {
                cancelButton.current = node;
                node?.focus();
              }}
              onClick={cancel}
            >
              Cancel journey
            </button>
          </div>
        </Html>
      )}
    </group>
  );
}
