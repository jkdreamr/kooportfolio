import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../core/store";
import { findPath } from "../core/world";
import { moveJourneyApproach } from "../core/journeyApproach";
import { journeyGate, journeyPose, journeyRidePose } from "../core/journey";
import type { TravelOption, TravelWorld } from "../core/travel";
import { Character } from "./Models";
import { JourneyTrain, PassengerJet, RoadCar } from "./TravelVehicles";
import { ISLAND_CAMERA_OFFSET } from "../core/islandCamera";

export type IslandTrip = TravelOption & {
  from: TravelWorld;
  origin: [number, number];
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
  const route = useRef(findPath(trip.origin, [gate[0], gate[1]], trip.from));
  const position = useRef(
    new THREE.Vector3(...[trip.origin[0], 0.3, trip.origin[1]]),
  );
  const focus = useRef(position.current.clone());
  const { camera, size } = useThree();
  const color = useGame((state) => state.save.color);
  const hat = useGame((state) => state.save.hat);
  const desired = useRef(new THREE.Vector3());
  const offset = useRef(new THREE.Vector3(...ISLAND_CAMERA_OFFSET));
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
    const gate = journeyGate(trip.mode, localWorld);
    const initial = journeyPose(trip.mode, 0, localWorld);
    let pose = initial;
    let progress = 0;
    time.current += dt;
    if (phase.current === "approach") {
      if (route.current.length) {
        const [x, z] = moveJourneyApproach(
          position.current.x,
          position.current.z,
          route.current,
          dt,
          trip.from,
        );
        const dx = x - position.current.x,
          dz = z - position.current.z;
        if (actor.current && Math.hypot(dx, dz) > 0.0001)
          actor.current.rotation.y = Math.atan2(dx, dz);
        position.current.set(x, 0.3, z);
      } else {
        phase.current = "board";
        time.current = 0;
      }
    } else if (phase.current === "board") {
      const t = Math.min(1, time.current / 1.7);
      position.current.set(
        THREE.MathUtils.lerp(gate[0], initial.x, t),
        0.3 + t * 0.9,
        THREE.MathUtils.lerp(gate[1], initial.z, t),
      );
      if (actor.current)
        actor.current.rotation.y = Math.atan2(
          initial.x - gate[0],
          initial.z - gate[1],
        );
      if (t === 1) {
        phase.current = "ride";
        time.current = 0;
      }
    } else if (phase.current === "ride") {
      const p = Math.min(1, time.current / (reduced ? 5 : plane ? 12 : 10));
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
      if (p >= 0.5 && !arrived.current) {
        arrived.current = true;
        onArrive();
      }
      if (p === 1) {
        phase.current = "leave";
        time.current = 0;
      }
    } else if (phase.current === "leave") {
      const t = Math.min(1, time.current / 1.7);
      position.current.set(
        THREE.MathUtils.lerp(initial.x, gate[0], t),
        1.2 - t * 0.9,
        THREE.MathUtils.lerp(initial.z, gate[1], t),
      );
      if (actor.current)
        actor.current.rotation.y = Math.atan2(
          gate[0] - initial.x,
          gate[1] - initial.z,
        );
      if (t === 1) {
        phase.current = "done";
        onComplete();
      }
    }
    if (actor.current) {
      actor.current.visible = phase.current !== "ride";
      actor.current.position.copy(position.current);
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
        vehicle.current.rotation.set(pose.pitch, pose.heading, 0);
      }
    }
    focus.current.lerp(
      position.current,
      1 - Math.exp(-dt * (reduced ? 12 : 4)),
    );
    desired.current.copy(focus.current).add(offset.current);
    camera.position.lerp(desired.current, 1 - Math.exp(-dt * 4));
    camera.lookAt(focus.current);
    if (camera instanceof THREE.OrthographicCamera) {
      const zoom = Math.min(
        size.width / (reduced ? 50 : 30),
        (size.height - 140) / (reduced ? 45 : 26),
      );
      camera.zoom = THREE.MathUtils.damp(camera.zoom, zoom, 4, dt);
      camera.updateProjectionMatrix();
    }
  });
  const parked = journeyPose(trip.mode, 0, trip.from);
  return (
    <group name="in-world-journey">
      <group ref={actor} position={[trip.origin[0], 0.3, trip.origin[1]]}>
        <Character npc color={color} hat={hat} scale={0.65} />
      </group>
      <group
        ref={vehicle}
        position={[parked.x, parked.y, parked.z]}
        rotation={[0, parked.heading, 0]}
      >
        {trip.mode === "plane" ? (
          <PassengerJet />
        ) : trip.mode === "train" ? (
          <JourneyTrain carsRef={trainCars} />
        ) : (
          <RoadCar />
        )}
      </group>
    </group>
  );
}
