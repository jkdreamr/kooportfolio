import { useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { runtime, useGame } from "../core/store";
import { findPath } from "../core/world";
import { moveJourneyApproach } from "../core/journeyApproach";
import {
  boardingPose,
  journeyGate,
  journeyPose,
  journeyRidePose,
} from "../core/journey";
import type { TravelOption, TravelWorld } from "../core/travel";
import { Character } from "./Models";
import { JourneyTrain, PassengerJet, PassengerStairs } from "./TravelVehicles";
import { ISLAND_CAMERA_OFFSET } from "../core/islandCamera";
import { footstep, sound } from "../core/sound";

export type IslandTrip = TravelOption & {
  from: TravelWorld;
  origin: [number, number];
  heading: number;
};

export function IslandJourney({
  trip,
  world,
  reduced,
  onArrive,
  onComplete,
}: {
  trip: IslandTrip;
  world: TravelWorld;
  reduced: boolean;
  onArrive: () => void;
  onComplete: () => void;
}) {
  const actor = useRef<THREE.Group>(null),
    vehicle = useRef<THREE.Group>(null);
  const trainCars = useRef<THREE.Group>(null);
  const previousWorld = useRef(world);
  const phase = useRef<"approach" | "board" | "ride" | "leave" | "done">(
    "approach",
  );
  const time = useRef(0),
    arrived = useRef(false);
  const gate = journeyGate(trip.mode, trip.from);
  // Compute once: switching the visible region must not re-run pathfinding.
  // A failed route keeps no waypoint: a straight walk to the gate can stall on
  // obstacles, so the journey skips the approach leg instead.
  const [route] = useState(() => {
    const path = findPath(trip.origin, [gate[0], gate[1]], trip.from);
    const endpoint: [number, number] = [gate[0], gate[1]];
    return { current: path.length ? [...path, endpoint] : path };
  });
  const position = useRef(
    new THREE.Vector3(trip.origin[0], 0.18, trip.origin[1]),
  );
  const { camera, size } = useThree();
  // Start from the live camera, not the passenger, so booking never cuts views.
  const focus = useRef(
    camera.position.clone().sub(new THREE.Vector3(...ISLAND_CAMERA_OFFSET)),
  );
  const color = useGame((state) => state.save.color);
  const hat = useGame((state) => state.save.hat);
  const offset = useRef(new THREE.Vector3(...ISLAND_CAMERA_OFFSET));
  const lookRotation = useRef(new THREE.Quaternion());
  const lookMatrix = useRef(new THREE.Matrix4());
  const desired = useRef(new THREE.Vector3());
  const walking = useRef(false);
  const speed = useRef(0);
  const stalled = useRef(0);
  useFrame((_, delta) => {
    if (
      document.hidden ||
      useGame.getState().paused ||
      phase.current === "done"
    )
      return;
    const dt = Math.min(delta, 0.1);
    const plane = trip.mode === "plane";
    // This prop changes in the same commit as the scenery and railway.
    const localWorld = world;
    const initial = journeyPose(trip.mode, 0, localWorld);
    let pose = initial;
    let progress = 0;
    let actorVisible = true;
    let heading = actor.current?.rotation.y ?? trip.heading;
    walking.current = false;
    time.current += dt;
    if (phase.current === "approach") {
      if (!route.current.length) {
        // The gate is unreachable on foot from here; board anyway rather than
        // walking into an obstacle forever.
        phase.current = "board";
        time.current = 0;
      } else {
        // Consume nearby grid nodes in the same frame instead of pausing at
        // each, easing up to speed and back down into the gate.
        const remaining = route.current.reduce((distance, point, i) => {
          const previous = i
            ? route.current[i - 1]
            : [position.current.x, position.current.z];
          return (
            distance +
            Math.hypot(point[0] - previous[0], point[1] - previous[1])
          );
        }, 0);
        speed.current = THREE.MathUtils.damp(
          speed.current,
          Math.min(6, Math.max(0.4, remaining * 3)),
          5,
          dt,
        );
        const [x, z] = moveJourneyApproach(
          position.current.x,
          position.current.z,
          route.current,
          (dt * speed.current) / 10,
          trip.from,
        );
        const dx = x - position.current.x,
          dz = z - position.current.z;
        const moved = Math.hypot(dx, dz);
        if (moved > 0.0001) {
          heading = Math.atan2(dx, dz);
          walking.current = true;
          stalled.current = 0;
        } else {
          // A waypoint blocked by drifted obstacles is skipped rather than
          // retried forever against a collider.
          stalled.current += dt;
          if (stalled.current > 1.5) {
            route.current.shift();
            stalled.current = 0;
          }
        }
        position.current.set(x, 0.18, z);
        if (!route.current.length) {
          phase.current = "board";
          time.current = 0;
        }
      }
    } else if (phase.current === "board") {
      const t = Math.min(1, time.current / (plane ? 3.2 : 2));
      const passenger = boardingPose(trip.mode, t, trip.from);
      position.current.set(passenger.x, passenger.y, passenger.z);
      heading = passenger.heading;
      actorVisible = passenger.visible;
      walking.current = t > 0.02 && t < 0.98;
      if (t === 1) {
        sound("chime");
        phase.current = "ride";
        time.current = 0;
      }
    } else if (phase.current === "ride") {
      const p = Math.min(1, time.current / (plane ? 18 : 14));
      progress = p;
      pose = journeyRidePose(trip.mode, p, trip.from, trip.destination, world);
      if (trip.mode === "train" && previousWorld.current !== world) {
        const old = journeyPose("train", p, previousWorld.current);
        // Re-anchor the camera with the train when the offshore region changes,
        // rather than sliding the train across land between unlike rail rings.
        desired.current.set(pose.x - old.x, pose.y - old.y, pose.z - old.z);
        focus.current.add(desired.current);
        camera.position.add(desired.current);
      }
      previousWorld.current = world;
      position.current.set(pose.x, pose.y + 1, pose.z);
      actorVisible = false;
      if (p >= 0.5 && !arrived.current) {
        arrived.current = true;
        sound("chime");
        onArrive();
      }
      if (p === 1) {
        phase.current = "leave";
        time.current = 0;
      }
    } else if (phase.current === "leave") {
      const t = Math.min(1, time.current / (plane ? 3.2 : 2));
      const passenger = boardingPose(trip.mode, 1 - t, trip.destination);
      position.current.set(passenger.x, passenger.y, passenger.z);
      heading = passenger.heading + Math.PI;
      actorVisible = passenger.visible;
      walking.current = t > 0.02 && t < 0.98;
      if (t === 1) {
        phase.current = "done";
      }
    }
    if (walking.current) footstep();
    if (actor.current) {
      actor.current.visible = actorVisible;
      actor.current.position.copy(position.current);
      const turn = Math.atan2(
        Math.sin(heading - actor.current.rotation.y),
        Math.cos(heading - actor.current.rotation.y),
      );
      actor.current.rotation.y += turn * (1 - Math.exp(-dt * 10));
    }
    if (vehicle.current) {
      if (trip.mode === "train") {
        vehicle.current.position.set(0, 0, 0);
        vehicle.current.rotation.set(0, 0, 0);
        trainCars.current?.children.forEach((car, coach) => {
          const p = journeyPose("train", progress, world, coach);
          car.position.set(p.x, p.y, p.z);
          car.rotation.set(0, p.heading, 0);
        });
      } else {
        vehicle.current.position.set(pose.x, pose.y, pose.z);
        vehicle.current.rotation.set(
          reduced ? 0 : pose.pitch,
          pose.heading,
          reduced ? 0 : (pose.roll ?? 0),
          "YXZ",
        );
      }
    }
    focus.current.lerp(position.current, 1 - Math.exp(-dt * 3));
    camera.position.copy(focus.current).add(offset.current);
    lookMatrix.current.lookAt(camera.position, focus.current, camera.up);
    lookRotation.current.setFromRotationMatrix(lookMatrix.current);
    camera.quaternion.slerp(lookRotation.current, 1 - Math.exp(-dt * 4));
    if (camera instanceof THREE.OrthographicCamera) {
      const zoom = Math.min(
        size.width / (reduced ? 55 : 38),
        Math.max(140, size.height - 140) / (reduced ? 48 : 32),
      );
      camera.zoom = THREE.MathUtils.damp(camera.zoom, zoom, 4, dt);
      camera.updateProjectionMatrix();
    }
    if (phase.current === "done") {
      runtime.heading = actor.current?.rotation.y ?? heading;
      onComplete();
    }
  });
  const parked = journeyPose(trip.mode, 0, trip.from);
  const landed = journeyPose(trip.mode, 0, trip.destination);
  return (
    <group name="in-world-journey">
      <group
        ref={actor}
        position={[trip.origin[0], 0.18, trip.origin[1]]}
        rotation={[0, trip.heading, 0]}
      >
        <Character
          player
          walking={walking}
          color={color}
          hat={hat}
          scale={0.65}
        />
      </group>
      {trip.mode === "plane" &&
        [parked, landed].map((p, i) => (
          <group key={i} position={[p.x, p.y, p.z]}>
            <PassengerStairs />
          </group>
        ))}
      <group
        ref={vehicle}
        position={[parked.x, parked.y, parked.z]}
        rotation={[0, parked.heading, 0]}
      >
        {trip.mode === "plane" ? (
          <PassengerJet />
        ) : (
          <JourneyTrain carsRef={trainCars} />
        )}
      </group>
    </group>
  );
}
