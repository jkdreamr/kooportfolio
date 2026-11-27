import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { setViewZoom, viewZoom } from "../engine/camera";
import { TELEPHOTO_FOV, zoomToDistance } from "../../stage/contract";
import { runtime, useGame } from "../core/store";
import { findPath } from "../core/world";
import { moveJourneyApproach } from "../core/journeyApproach";
import {
  boardingPose,
  canSwapWorld,
  journeyChase,
  journeyEase,
  journeyGate,
  journeyHour,
  journeyPose,
  journeyRidePose,
  journeyVeil,
  JOURNEY_SHOT,
} from "../core/journey";
import type { TravelOption, TravelWorld } from "../core/travel";
import { WORLDS } from "../core/worlds";
import { autoHour, daylightClock, useTimeOfDay } from "../core/timeOfDay";
import { TIME_PRESETS } from "../core/daylight";
import { cue } from "../core/audio/cues";
import { exposeQa } from "../../stage/qa";
import { Character } from "./Models";
import { JourneyTrain, PassengerJet, PassengerStairs } from "./TravelVehicles";
import {
  ISLAND_CAMERA_OFFSET,
  islandCenter,
  islandViewShift,
  islandZoom,
} from "../core/islandCamera";
import { useWorldView } from "../core/worldView";
import { footstep, sound } from "../core/sound";
import { journeyAtmosphere } from "./env/atmosphere";
import { cloudGeometry, cloudLikeMaterial } from "./env/Clouds";

export type IslandTrip = TravelOption & {
  from: TravelWorld;
  origin: [number, number];
  heading: number;
};

/** WorldTravel asks the journey to cancel; the journey decides how. */
export type JourneyControl = { cancel: boolean };

/** Read-only journey state for QA captures (`window.__qa.journey`). */
export const journeyRuntime = {
  phase: "idle",
  p: 0,
  veil: 0,
  chase: 0,
  frozen: false,
};
exposeQa({ journey: journeyRuntime });

const WISPS = 6;
const WISP_SPEED = 22;
const WISP_RANGE = 60;
const scratch = {
  offset: new THREE.Vector3(),
  overview: new THREE.Vector3(),
  chase: new THREE.Vector3(),
  look: new THREE.Vector3(),
  chaseLook: new THREE.Vector3(),
  forward: new THREE.Vector3(),
  right: new THREE.Vector3(),
  object: new THREE.Object3D(),
  tint: new THREE.Color(),
};
const up = new THREE.Vector3(0, 1, 0);

/**
 * The whole-island overview the hub cuts to when it takes the camera back
 * (diorama at zoom 1): the journey's last moments ease into exactly this
 * pose, so the hand-back is not a cut. Other views blend on their own.
 */
function hubOverview(world: TravelWorld, width: number, height: number, look: THREE.Vector3) {
  const view = useWorldView.getState();
  if (view.zoom !== 1 || view.view !== "diorama") return 0;
  const [cx, cz] = islandCenter(world);
  const [sx, sy, sz] = islandViewShift(world);
  look.set(cx + sx, sy + 0.7, cz + sz);
  return islandZoom(width, height, world);
}
const handBack = new THREE.Vector3();

/** The destination's hour as Auto (or the chosen preset) will show it. */
function destinationHour(world: TravelWorld) {
  const { mode } = useTimeOfDay.getState();
  return mode === "auto" ? autoHour(WORLDS[world].timeZone) : TIME_PRESETS[mode].hour;
}

export function IslandJourney({
  trip,
  world,
  reduced,
  control,
  onArrive,
  onSwapBack,
  onCancelled,
  onComplete,
}: {
  trip: IslandTrip;
  world: TravelWorld;
  reduced: boolean;
  control: RefObject<JourneyControl>;
  onArrive: () => void;
  onSwapBack: () => void;
  onCancelled: () => void;
  onComplete: () => void;
}) {
  const actor = useRef<THREE.Group>(null),
    vehicle = useRef<THREE.Group>(null);
  const trainCars = useRef<THREE.Group>(null);
  const wisps = useRef<THREE.InstancedMesh>(null);
  const wispMaterial = useMemo(cloudLikeMaterial, []);
  useEffect(() => () => wispMaterial.dispose(), [wispMaterial]);
  // Instance colours exist on the clouds too: same program, nothing links.
  useLayoutEffect(() => {
    const m = wisps.current;
    if (!m) return;
    for (let i = 0; i < WISPS; i++) m.setColorAt(i, WHITE);
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);
  const previousWorld = useRef(world);
  const phase = useRef<"approach" | "board" | "ride" | "leave" | "cancel" | "done">(
    "approach",
  );
  const time = useRef(0),
    arrived = useRef(false);
  // The ride as one shot: its own clock (held while the swap waits for the
  // destination to be drawn), the veil and the sky's hour arc.
  const ride = useRef({
    seconds: 0,
    p: 0,
    veil: 0,
    chase: 0,
    frozen: false,
    hold: 0,
    presented: 0,
    hourFrom: 0,
    hourTo: 0,
    departed: false,
    approached: false,
    wisp: 0,
  });
  // Cancel: raise the veil, swap back behind it, pull the camera out into
  // the fog, then lower the veil over the origin.
  const cancelling = useRef({ stage: 0, chase0: 0, hour0: 0, frozenFrames: 0, hold: 0 });
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
  // Whatever happens, never leave the sky held or veiled behind us.
  useEffect(
    () => () => {
      if (daylightClock.heldBy === "journey") daylightClock.heldBy = null;
      journeyAtmosphere.veil = 0;
      journeyRuntime.phase = "idle";
      journeyRuntime.veil = 0;
      journeyRuntime.chase = 0;
    },
    [],
  );
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
    const r = ride.current;
    walking.current = false;
    time.current += dt;
    if (control.current?.cancel && phase.current !== "cancel") {
      control.current.cancel = false;
      if (r.veil <= 0 && world === trip.from && phase.current !== "ride") {
        // Nothing to hide: hand straight back, as before.
        phase.current = "done";
        onCancelled();
        return;
      }
      phase.current = "cancel";
      cancelling.current = { stage: 0, chase0: r.chase, hour0: daylightClock.hour, frozenFrames: 0, hold: 0 };
      daylightClock.heldBy = "journey";
    }
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
        r.seconds = 0;
        r.hourFrom = daylightClock.hour;
        r.hourTo = destinationHour(trip.destination);
        daylightClock.heldBy = "journey";
      }
    } else if (phase.current === "ride") {
      const rideSeconds = reduced ? JOURNEY_SHOT.reducedSeconds : JOURNEY_SHOT.rideSeconds[trip.mode];
      if (r.frozen) {
        // Hold at the swap until the destination has been drawn twice.
        r.hold += dt;
        if (world === trip.destination) r.presented++;
        if (r.presented >= 3 || r.hold >= JOURNEY_SHOT.holdCap) r.frozen = false;
      } else r.seconds += dt;
      const p = Math.min(1, r.seconds / rideSeconds);
      r.p = p;
      r.veil = journeyVeil(p, reduced, rideSeconds);
      r.chase = journeyChase(p, reduced);
      progress = p;
      if (!r.departed) {
        r.departed = true;
        cue("travel-depart");
      }
      if (!r.approached && p >= JOURNEY_SHOT.veilOut[1]) {
        r.approached = true;
        cue("travel-arrive");
      }
      daylightClock.hour = journeyHour(p, r.hourFrom, r.hourTo);
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
      // The world swaps only behind a complete veil (B7).
      if (p >= JOURNEY_SHOT.swap && !arrived.current && canSwapWorld(r.veil)) {
        arrived.current = true;
        sound("chime");
        onArrive();
        r.frozen = true;
        r.hold = 0;
        r.presented = 0;
      }
      if (p === 1) {
        phase.current = "leave";
        time.current = 0;
        r.veil = 0;
        r.chase = 0;
        // The destination's own clock takes over from here (Auto lands on the
        // same hour, so nothing moves).
        daylightClock.heldBy = null;
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
    } else if (phase.current === "cancel") {
      const c = cancelling.current;
      progress = r.p;
      pose = journeyRidePose(trip.mode, r.p, trip.from, trip.destination, world);
      actorVisible = false;
      if (c.stage === 0) {
        // Raise the veil (from wherever it is).
        r.veil = Math.min(1, r.veil + dt / 0.6);
        if (canSwapWorld(r.veil)) {
          if (world !== trip.from) onSwapBack();
          c.stage = 1;
          c.hold = 0;
          c.frozenFrames = 0;
        }
      } else if (c.stage === 1) {
        // Behind the veil: wait for the origin to be drawn, and pull the
        // camera back out into the fog so the vehicle fades into it.
        c.hold += dt;
        if (world === trip.from) c.frozenFrames++;
        r.chase = Math.max(0, r.chase - dt / 1.2);
        if (r.chase <= 0 && (c.frozenFrames >= 3 || c.hold >= JOURNEY_SHOT.holdCap)) c.stage = 2;
      } else {
        // Lower the veil over the origin, the hour easing back with it.
        r.veil = Math.max(0, r.veil - dt / 1.2);
        daylightClock.hour = journeyHour(
          JOURNEY_SHOT.hour[0] + (JOURNEY_SHOT.hour[1] - JOURNEY_SHOT.hour[0]) * (1 - r.veil),
          c.hour0,
          r.hourFrom,
        );
        if (r.veil <= 0) {
          daylightClock.heldBy = null;
          phase.current = "done";
        }
      }
    }
    journeyAtmosphere.veil = r.veil;
    journeyAtmosphere.near = plane ? JOURNEY_SHOT.veilNear : JOURNEY_SHOT.trainVeilNear;
    journeyAtmosphere.far = plane ? JOURNEY_SHOT.veilFar : JOURNEY_SHOT.trainVeilFar;
    journeyRuntime.phase = phase.current;
    journeyRuntime.p = r.p;
    journeyRuntime.veil = r.veil;
    journeyRuntime.chase = r.chase;
    journeyRuntime.frozen = r.frozen;
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
    // The vehicle hides only once the camera has fully pulled back into
    // the fog behind a complete veil (cancel), never in view.
    const vehicleShown = !(phase.current === "cancel" && cancelling.current.stage >= 1 && r.chase <= 0) && phase.current !== "done";
    let vehicleHeading = pose.heading;
    if (vehicle.current) {
      vehicle.current.visible = vehicleShown;
      if (trip.mode === "train") {
        vehicle.current.position.set(0, 0, 0);
        vehicle.current.rotation.set(0, 0, 0);
        trainCars.current?.children.forEach((car, coach) => {
          const p = journeyPose("train", progress, world, coach);
          car.position.set(p.x, p.y, p.z);
          car.rotation.set(0, p.heading, 0);
          if (coach === 0) vehicleHeading = p.heading;
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
    // --- camera: the boarding/overview framing blended with a chase ---
    focus.current.lerp(position.current, 1 - Math.exp(-dt * 3));
    const zoom = THREE.MathUtils.damp(
      viewZoom(camera),
      Math.min(
        size.width / (reduced ? 55 : 38),
        Math.max(140, size.height - 140) / (reduced ? 48 : 32),
      ),
      4,
      dt,
    );
    // The last part of the trip eases into the hub's own overview pose.
    let finalZoom = zoom;
    let handWeight = 0;
    scratch.look.copy(focus.current);
    const leaveT = phase.current === "leave" || phase.current === "done"
      ? Math.min(1, time.current / (plane ? 3.2 : 2))
      : phase.current === "cancel" && cancelling.current.stage === 2
        ? 1 - r.veil
        : 0;
    if (leaveT > 0) {
      const hubZoom = hubOverview(
        phase.current === "cancel" ? trip.from : trip.destination,
        size.width,
        size.height,
        handBack,
      );
      if (hubZoom > 0) {
        handWeight = journeyEase(leaveT);
        scratch.look.lerp(handBack, handWeight);
        finalZoom = THREE.MathUtils.lerp(zoom, hubZoom, handWeight);
      }
    }
    // Same direction as the journey offset; telephoto distance for the zoom.
    const distance = zoomToDistance(finalZoom, Math.max(1, size.height), TELEPHOTO_FOV);
    scratch.offset.copy(offset.current).normalize().multiplyScalar(distance);
    scratch.overview.copy(scratch.look).add(scratch.offset);
    const w = r.chase;
    const perspective = camera as THREE.PerspectiveCamera;
    if (w > 0) {
      // Chase: behind and above the vehicle, looking a little ahead of it.
      scratch.forward.set(Math.sin(vehicleHeading), 0, Math.cos(vehicleHeading));
      const lead = trip.mode === "train" ? trainCars.current?.children[0]?.position : null;
      const at = lead ?? (vehicle.current?.position ?? position.current);
      scratch.chase
        .copy(at)
        .addScaledVector(scratch.forward, -JOURNEY_SHOT.chaseBack)
        .addScaledVector(up, JOURNEY_SHOT.chaseUp);
      scratch.chaseLook.copy(at).addScaledVector(scratch.forward, 4).addScaledVector(up, 0.6);
      camera.position.lerpVectors(scratch.overview, scratch.chase, w);
      scratch.look.lerp(scratch.chaseLook, w);
    } else {
      camera.position.copy(scratch.overview);
    }
    lookMatrix.current.lookAt(camera.position, scratch.look, camera.up);
    lookRotation.current.setFromRotationMatrix(lookMatrix.current);
    // The overview's damped turn, tightening to a locked chase.
    camera.quaternion.slerp(
      lookRotation.current,
      THREE.MathUtils.lerp(1 - Math.exp(-dt * 4), 1, Math.max(w, handWeight)),
    );
    setViewZoom(camera, finalZoom, size.height);
    if (perspective.isPerspectiveCamera) {
      const fov = THREE.MathUtils.lerp(TELEPHOTO_FOV, JOURNEY_SHOT.chaseFov, w);
      const near = THREE.MathUtils.lerp(Math.max(0.1, distance * 0.04), 0.3, w);
      const far = distance + 700;
      if (perspective.fov !== fov || perspective.near !== near || perspective.far !== far) {
        perspective.fov = fov;
        perspective.near = near;
        perspective.far = far;
        perspective.updateProjectionMatrix();
      }
      camera.userData.viewDistance = distance;
    }
    // --- cloud wisps streaming past the vehicle while veiled ---
    const m = wisps.current;
    if (m) {
      const show = !reduced && r.veil > 0.001 && vehicleShown;
      m.count = show ? WISPS : 0;
      if (show) {
        r.wisp += dt;
        scratch.forward.set(Math.sin(vehicleHeading), 0, Math.cos(vehicleHeading));
        scratch.right.crossVectors(scratch.forward, up);
        const at = vehicle.current?.position ?? position.current;
        const lead = trip.mode === "train" ? trainCars.current?.children[0]?.position ?? at : at;
        const o = scratch.object;
        for (let i = 0; i < WISPS; i++) {
          const s = (r.wisp * WISP_SPEED + i * (WISP_RANGE / WISPS)) % WISP_RANGE;
          const side = i % 2 ? 1 : -1;
          const lateral = side * (7 + ((i * 37) % 6));
          const lift = ((i * 53) % 7) - 2.5;
          // Grow in ahead, shrink away behind: no wisp ever pops.
          const life = Math.sin((Math.PI * s) / WISP_RANGE);
          o.position
            .copy(lead)
            .addScaledVector(scratch.forward, 25 - s)
            .addScaledVector(scratch.right, lateral)
            .addScaledVector(up, lift);
          o.quaternion.copy(camera.quaternion);
          const width = (12 + ((i * 29) % 7)) * life;
          o.scale.set(width * (i % 3 ? 1 : -1), width, 1);
          o.updateMatrix();
          m.setMatrixAt(i, o.matrix);
        }
        m.instanceMatrix.needsUpdate = true;
        scratch.tint.copy(journeyFogColor).lerp(WHITE, 0.08);
        wispMaterial.color.copy(scratch.tint);
        wispMaterial.opacity = 0.6 * r.veil;
      }
    }
    if (phase.current === "done") {
      runtime.heading = actor.current?.rotation.y ?? heading;
      journeyAtmosphere.veil = 0;
      if (cancelling.current.stage === 2) onCancelled();
      else onComplete();
    }
  });
  const parked = journeyPose(trip.mode, 0, trip.from);
  const landed = journeyPose(trip.mode, 0, trip.destination);
  return (
    <group name="in-world-journey">
      <FogColorProbe />
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
      <instancedMesh
        ref={wisps}
        args={[cloudGeometry, wispMaterial, WISPS]}
        count={0}
        frustumCulled={false}
        renderOrder={2}
        raycast={() => undefined}
        dispose={null}
      />
    </group>
  );
}

const WHITE = new THREE.Color(1, 1, 1);
/** The scene's fog colour (the sky's horizon), read each frame for the wisps. */
const journeyFogColor = new THREE.Color("#dce5c7");
function FogColorProbe() {
  useFrame(({ scene }) => {
    const fog = scene.fog as THREE.Fog | null;
    if (fog) journeyFogColor.copy(fog.color);
  });
  return null;
}
