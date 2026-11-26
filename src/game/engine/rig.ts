import * as THREE from "three";
import {
  useCameraRig,
  type CameraCommand,
  type CameraPose,
  type RigEase,
} from "../../stage/contract";

/** Mutable pose used inside the engine (no per-frame allocation). */
export interface Pose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  roll: number;
}
export const makePose = (): Pose => ({
  position: new THREE.Vector3(),
  target: new THREE.Vector3(),
  fov: 20,
  roll: 0,
});
const copyPose = (to: Pose, from: Pose) => {
  to.position.copy(from.position);
  to.target.copy(from.target);
  to.fov = from.fov;
  to.roll = from.roll;
  return to;
};
const fromContract = (to: Pose, from: CameraPose) => {
  to.position.set(...from.position);
  to.target.set(...from.target);
  to.fov = from.fov;
  to.roll = from.roll ?? 0;
  return to;
};
export function lerpPose(out: Pose, a: Pose, b: Pose, t: number) {
  out.position.lerpVectors(a.position, b.position, t);
  out.target.lerpVectors(a.target, b.target, t);
  out.fov = a.fov + (b.fov - a.fov) * t;
  out.roll = a.roll + (b.roll - a.roll) * t;
  return out;
}
const forward = new THREE.Vector3();
/** Read the pose gameplay wrote to the camera this frame. */
export function readPose(out: Pose, camera: THREE.Camera) {
  out.position.copy(camera.position);
  camera.getWorldDirection(forward);
  const distance =
    typeof camera.userData.viewDistance === "number"
      ? camera.userData.viewDistance
      : 24;
  out.target.copy(camera.position).addScaledVector(forward, distance);
  out.fov = (camera as THREE.PerspectiveCamera).isPerspectiveCamera
    ? (camera as THREE.PerspectiveCamera).fov
    : out.fov;
  out.roll = 0;
  return out;
}
/** Write a pose; returns true if the projection changed. */
export function writePose(camera: THREE.Camera, pose: Pose) {
  camera.position.copy(pose.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.target);
  if (pose.roll) camera.rotateZ(pose.roll);
  camera.updateMatrixWorld();
  const perspective = camera as THREE.PerspectiveCamera;
  if (!perspective.isPerspectiveCamera) return;
  const distance = pose.position.distanceTo(pose.target);
  perspective.fov = pose.fov;
  perspective.near = Math.max(0.1, distance * 0.04);
  perspective.far = distance + 700;
  perspective.updateProjectionMatrix();
}

const ease = (kind: RigEase | undefined, t: number) => {
  const x = Math.min(1, Math.max(0, t));
  if (kind === "linear") return x;
  if (kind === "cubic-in-out")
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  return 1 - Math.pow(1 - x, 5);
};
const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

interface PathRun {
  positions: THREE.CatmullRomCurve3;
  targets: THREE.CatmullRomCurve3;
  poses: Pose[];
  command: Extract<CameraCommand, { kind: "path" }>;
  elapsed: number;
  blendStarted: boolean;
}

/**
 * The persistent camera rig. Gameplay writes the camera as before; at render
 * time `apply` overlays the active command (and any cut-smoothing blend) and
 * `restore` puts the gameplay pose back, so nothing feeds back into gameplay.
 */
export class CameraRigRuntime {
  readonly live = makePose();
  readonly rendered = makePose();
  private readonly saved = makePose();
  private readonly scratch = makePose();
  private readonly held = makePose();
  private readonly blendFrom = makePose();
  private blendTime = 0;
  private blendDuration = 0;
  private serial = -1;
  private command: CameraCommand = { kind: "live" };
  private path: PathRun | null = null;
  private hasRendered = false;
  private savedNear = 0.1;
  private savedFar = 1000;
  private overridden = false;

  private holding = false;
  private readonly frozen = makePose();
  /** Freeze the on-screen pose (e.g. while the next scene compiles hidden). */
  hold() {
    if (!this.hasRendered || this.holding) return;
    copyPose(this.frozen, this.rendered);
    this.holding = true;
  }
  /** Unfreeze, smoothing into the live pose over `seconds`. */
  release(seconds: number) {
    if (!this.holding) return;
    this.holding = false;
    this.blend(seconds);
  }

  /** Smooth from what is on screen now into whatever comes next. */
  blend(seconds: number) {
    if (!this.hasRendered || seconds <= 0) return;
    copyPose(this.blendFrom, this.rendered);
    this.blendTime = 0;
    this.blendDuration = seconds;
  }

  private sync() {
    const state = useCameraRig.getState();
    if (state.serial === this.serial) return;
    this.serial = state.serial;
    const command = state.command;
    this.command = command;
    this.path = null;
    if (command.kind === "live") this.blend(command.blend ?? 0);
    else if (command.kind === "pose") {
      fromContract(this.held, command.pose);
      this.blend(command.blend ?? 0);
    } else {
      const poses = command.points.map((p) => fromContract(makePose(), p));
      if (poses.length < 2) poses.push(copyPose(makePose(), poses[0]));
      this.path = {
        positions: new THREE.CatmullRomCurve3(
          poses.map((p) => p.position),
          false,
          "centripetal",
        ),
        targets: new THREE.CatmullRomCurve3(
          poses.map((p) => p.target),
          false,
          "centripetal",
        ),
        poses,
        command,
        elapsed: 0,
        blendStarted: false,
      };
      this.blendDuration = 0;
    }
  }

  private samplePath(run: PathRun, delta: number, out: Pose): void {
    const { command } = run;
    run.elapsed += delta;
    const duration = Math.max(0.001, command.duration);
    const u = ease(command.ease ?? "quintic-out", run.elapsed / duration);
    run.positions.getPointAt(u, out.position);
    run.targets.getPointAt(u, out.target);
    const scaled = u * (run.poses.length - 1);
    const index = Math.min(run.poses.length - 2, Math.floor(scaled));
    const local = scaled - index;
    out.fov =
      run.poses[index].fov +
      (run.poses[index + 1].fov - run.poses[index].fov) * local;
    out.roll =
      run.poses[index].roll +
      (run.poses[index + 1].roll - run.poses[index].roll) * local;
    const blendSeconds = Math.min(duration, command.blendToLive ?? 0.6);
    const blendStart = duration - blendSeconds;
    if (run.elapsed >= blendStart) {
      if (!run.blendStarted) {
        run.blendStarted = true;
        command.onBlendStart?.();
      }
      const w = smooth(
        blendSeconds > 0 ? (run.elapsed - blendStart) / blendSeconds : 1,
      );
      lerpPose(out, out, this.live, w);
    }
    if (run.elapsed >= duration) {
      this.path = null;
      this.command = { kind: "live" };
      // Leave the store consistent for readers; serial bump is ours.
      useCameraRig.setState((s) => ({
        command: { kind: "live" },
        serial: s.serial + 1,
      }));
      this.serial = useCameraRig.getState().serial;
      command.onDone?.();
    }
  }

  /** Overlay the rig on the camera for this render. */
  apply(camera: THREE.Camera, rawDelta: number) {
    this.sync();
    readPose(this.live, camera);
    const delta = rawDelta * useCameraRig.getState().timeScale;
    let out: Pose = this.live;
    if (this.path) {
      this.samplePath(this.path, delta, this.scratch);
      out = this.scratch;
    }
    else if (this.command.kind === "pose") out = this.held;
    if (this.holding) out = this.frozen;
    if (this.blendDuration > 0) {
      this.blendTime += delta;
      const w = smooth(this.blendTime / this.blendDuration);
      if (w >= 1) this.blendDuration = 0;
      else out = lerpPose(this.scratch, this.blendFrom, out, w);
    }
    this.overridden = out !== this.live;
    if (this.overridden) {
      copyPose(this.saved, this.live);
      const perspective = camera as THREE.PerspectiveCamera;
      this.savedNear = perspective.near;
      this.savedFar = perspective.far;
      // Keep the gameplay camera's real orientation for the restore.
      this.savedQuaternion.copy(camera.quaternion);
      this.savedUp.copy(camera.up);
      writePose(camera, out);
    }
    copyPose(this.rendered, out);
    this.hasRendered = true;
    publish(this.live, this.rendered);
  }
  private readonly savedQuaternion = new THREE.Quaternion();
  private readonly savedUp = new THREE.Vector3();

  /** Put the gameplay pose back after rendering. */
  restore(camera: THREE.Camera) {
    if (!this.overridden) return;
    this.overridden = false;
    camera.position.copy(this.saved.position);
    camera.quaternion.copy(this.savedQuaternion);
    camera.up.copy(this.savedUp);
    const perspective = camera as THREE.PerspectiveCamera;
    if (perspective.isPerspectiveCamera) {
      perspective.fov = this.saved.fov;
      perspective.near = this.savedNear;
      perspective.far = this.savedFar;
      perspective.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }
}

const toTuple = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z];
let publishedAt = 0;
/** Expose live/rendered poses to the contract (throttled; plain tuples). */
function publish(live: Pose, rendered: Pose) {
  const now = performance.now();
  const state = useCameraRig.getState();
  if (state.live && now - publishedAt < 50) {
    // Mutate in place between throttled publishes: readers get fresh values
    // without a store notification per frame.
    writeTuple(state.live, live);
    if (state.rendered) writeTuple(state.rendered, rendered);
    return;
  }
  publishedAt = now;
  useCameraRig.setState({
    live: {
      position: toTuple(live.position),
      target: toTuple(live.target),
      fov: live.fov,
    },
    rendered: {
      position: toTuple(rendered.position),
      target: toTuple(rendered.target),
      fov: rendered.fov,
      roll: rendered.roll,
    },
  });
}
function writeTuple(to: CameraPose, from: Pose) {
  const p = to.position as [number, number, number];
  const t = to.target as [number, number, number];
  p[0] = from.position.x;
  p[1] = from.position.y;
  p[2] = from.position.z;
  t[0] = from.target.x;
  t[1] = from.target.y;
  t[2] = from.target.z;
  (to as { fov: number }).fov = from.fov;
}
