import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { chamferBoxGeometry } from "../../world/chamferBox";
import { sculptedMaterial } from "../../world/Surface";
import { Live } from "../../world/StaticBatch";
import { contactBlobGeometry, contactBlobMaterial } from "../../world/env/ContactShadows";
import { runtime, useGame, walkTo } from "../../core/store";
import { useGameMode } from "../../core/gameMode";
import { keys, touch } from "../../core/input";
import { sound } from "../../core/sound";
import { gameInputEnabled, useStage } from "../../../stage/contract";
import { exposeQa } from "../../../stage/qa";
import { roomFor } from "../../core/room";
import { isDiscovered, onDiscovery, roomProgress, useDiscoveries } from "../../core/discoveries";
import {
  activate,
  clearFocus,
  DEFAULT_REACH,
  discoveryRoomId,
  registerInteractables,
  updateFocus,
  useInteractables,
  verbOf,
  type Interactable,
} from "../../core/interactables";
import { juice, projectPoint } from "../juice/Juice";
import { type Board, type Kit, type Piece, type Prop, type Shape } from "./kit";
import { buildRoomLife } from "./rooms";
import { closeCard, showCard } from "./lifeStore";
import { startTune, stopTune, tunePlaying } from "./tunes";

/**
 * Draws a room's life (see kit.ts): its static dressing as instanced pieces
 * that the room's StaticBatch bakes into its one merged mesh, and its
 * interactive layer as five live instanced draws for the whole room: moving
 * prop parts by shape, one mesh of glows (lamp shades, fairy lights,
 * sparkles, the focus marker) and one of light pools on the floor.
 *
 * Every program is one the game already links: the sculpted instanced
 * surface (kit pieces), the instanced unlit material (glows), the contact
 * blob (pools) and a mapped standard material (boards).
 */

const SHAPES: Shape[] = ["box", "slab", "cyl", "ball", "cone"];
const GEOMETRY: Record<Shape, THREE.BufferGeometry> = {
  box: chamferBoxGeometry(0.06),
  slab: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  ball: new THREE.IcosahedronGeometry(1, 1),
  cone: new THREE.ConeGeometry(1, 1, 8),
};
const pieceMaterial = sculptedMaterial({ roughness: 0.8 });
const glowGeometry = new THREE.IcosahedronGeometry(1, 1);
const glowMaterial = new THREE.MeshBasicMaterial({ color: "#ffdc9c", toneMapped: false });
const poolMaterial = contactBlobMaterial(0.3);
poolMaterial.color.set("#ffc477");
poolMaterial.blending = THREE.AdditiveBlending;
const noRaycast = () => undefined;

const dummy = new THREE.Object3D();
dummy.rotation.order = "YXZ";
const tint = new THREE.Color();
function pieceMatrix(piece: Piece, into: THREE.Matrix4) {
  dummy.position.set(piece.p[0], piece.p[1], piece.p[2]);
  dummy.rotation.set(piece.r[0], piece.r[1], piece.r[2]);
  dummy.scale.set(piece.s[0], piece.s[1], piece.s[2]);
  dummy.updateMatrix();
  return into.copy(dummy.matrix);
}

/** Static pieces of one shape; the room's StaticBatch bakes this away. */
function PieceBatch({ shape, pieces }: { shape: Shape; pieces: Piece[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    pieces.forEach((piece, i) => {
      mesh.setMatrixAt(i, pieceMatrix(piece, matrix));
      mesh.setColorAt(i, tint.set(piece.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return () => {
      mesh.dispose();
    };
  }, [pieces]);
  return <instancedMesh ref={ref} args={[GEOMETRY[shape], pieceMaterial, pieces.length]} castShadow receiveShadow dispose={null} />;
}

/** The room's dressing. Mount inside the room's StaticBatch. */
export function RoomLifeStatic({ kit }: { kit: Kit }) {
  const groups = useMemo(() => SHAPES.map((shape) => ({ shape, pieces: kit.statics.filter((piece) => piece.shape === shape) })), [kit]);
  return (
    <group name="room-life-static">
      {groups.map(({ shape, pieces }) => pieces.length > 0 && <PieceBatch key={shape} shape={shape} pieces={pieces} />)}
    </group>
  );
}

/* ------------------------------------------------------------ live layer */

/** Seat height shared with `SeatLift` (one room is live at a time). */
const seatLift = { y: 0, on: false };

// One query object, read per frame (a fresh matchMedia each frame allocates).
let motionQuery: MediaQueryList | null | undefined;
const reducedMotion = () => {
  if (motionQuery === undefined) motionQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  return !!motionQuery?.matches;
};
const ease = (u: number) => u * u * (3 - 2 * u);
const ONE_SHOT: Record<string, number> = { whirl: 1.7, wobble: 1.2, pulse: 0.6, press: 0.24, flip: 0.75 };
const duration = (prop: Prop) => (prop.motion.kind === "hop" ? 0.34 * prop.motion.bounces + 0.25 : (ONE_SHOT[prop.motion.kind] ?? 0));
const isToggle = (prop: Prop) =>
  prop.motion.kind === "spin" || prop.motion.kind === "slide" || prop.motion.kind === "swing" || prop.action.type === "lamp" || prop.action.type === "tune" || prop.action.type === "sit";

type PartRef = { shape: Shape; index: number; q: THREE.Matrix4 };
type PropRun = {
  prop: Prop;
  /** Base × pivot. */
  p: THREE.Matrix4;
  parts: PartRef[];
  on: boolean;
  /** One-shot clock (seconds), or −1. */
  t: number;
  /** Toggle progress 0..1. */
  phase: number;
  angle: number;
  dirty: boolean;
  item: Interactable;
};

const euler = new THREE.Euler(0, 0, 0, "YXZ");
const quat = new THREE.Quaternion();
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();
const anim = new THREE.Matrix4();
const out = new THREE.Matrix4();
const ray = new THREE.Ray();
const point = new THREE.Vector3();
const ndc = new THREE.Vector2();
const caster = new THREE.Raycaster();

/** The motion's transform at this moment, about the pivot. */
function motionMatrix(run: PropRun) {
  const m = run.prop.motion;
  pos.set(0, 0, 0);
  scl.set(1, 1, 1);
  euler.set(0, 0, 0);
  const d = duration(run.prop);
  const u = run.t < 0 || d === 0 ? 1 : Math.min(1, run.t / d);
  switch (m.kind) {
    case "spin":
      if (m.axis === "z") euler.z = run.angle;
      else euler.y = run.angle;
      break;
    case "whirl":
      euler.y = Math.PI * 2 * m.turns * (1 - Math.pow(1 - u, 3));
      break;
    case "wobble": {
      const a = m.angle * Math.sin(u * Math.PI * 5) * (1 - u) * (1 - u);
      if (m.axis === "x") euler.x = a;
      else euler.z = a;
      break;
    }
    case "hop":
      pos.y = m.height * Math.abs(Math.sin(u * Math.PI * m.bounces)) * Math.pow(1 - u, 1.3);
      break;
    case "pulse": {
      const s = 1 + m.amount * Math.sin(u * Math.PI) * (1 - u * 0.4);
      scl.set(s, s, s);
      break;
    }
    case "slide":
      pos.z = m.travel * ease(run.phase);
      break;
    case "swing": {
      const a = m.angle * ease(run.phase);
      if (m.axis === "x") euler.x = a;
      else if (m.axis === "y") euler.y = a;
      else euler.z = a;
      break;
    }
    case "press":
      pos.y = -m.depth * Math.sin(u * Math.PI);
      break;
    case "flip":
      pos.y = m.height * Math.sin(u * Math.PI);
      euler.z = Math.PI * 2 * u;
      break;
    default:
      break;
  }
  quat.setFromEuler(euler);
  return anim.compose(pos, quat, scl);
}

function BoardMesh({ board, step }: { board: Board; step: number }) {
  const { texture, canvas } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = Math.max(128, Math.round((512 * board.size[1]) / board.size[0]));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { texture, canvas };
  }, [board]);
  useEffect(() => () => texture.dispose(), [texture]);
  useLayoutEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = board.ground;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = board.ink;
    ctx.textBaseline = "top";
    const shown = board.lines.slice(0, 1 + (step % board.lines.length));
    const size = Math.min(40, Math.floor((canvas.height - 40) / (board.lines.length * 1.35)));
    shown.forEach((line, i) => {
      ctx.font = `${i === 0 ? "700" : "500"} ${size}px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive`;
      ctx.fillText(line, 24, 20 + i * size * 1.35, canvas.width - 48);
    });
    texture.needsUpdate = true;
  }, [board, step, canvas, texture]);
  return (
    <mesh position={board.p} rotation={[0, board.turn, 0]} raycast={noRaycast}>
      <planeGeometry args={board.size} />
      <meshStandardMaterial map={texture} roughness={0.7} />
    </mesh>
  );
}

/** Feedback at a prop: a ring and an optional glyph where it is on screen. */
function feedback(run: PropRun, camera: THREE.Camera, canvas: HTMLElement, first: boolean) {
  const prop = run.prop;
  const [x, y] = projectPoint([prop.x, prop.y + prop.anchor, prop.z], camera, canvas);
  juice.ring(x, y, first ? "great" : "good");
  if (first) juice.pop("New find", x, y - 18, "great");
  else if (prop.pop) juice.pop(prop.pop, x, y - 18, "good");
  juice.haptic("tap");
}

/**
 * The interactive layer. Mount beside (not inside) the baked dressing.
 * `kit` must be the same object the static layer drew.
 */
export function RoomLifeLive({ kit, roomId }: { kit: Kit; roomId: string }) {
  const { camera, gl } = useThree();
  const scene = useGame((s) => s.scene);
  const partMeshes = useRef<Partial<Record<Shape, THREE.InstancedMesh | null>>>({});
  const glowMesh = useRef<THREE.InstancedMesh>(null);
  const poolMesh = useRef<THREE.InstancedMesh>(null);
  const boardSteps = useRef(0);
  const boardVersion = useRef<(n: number) => void>(() => {});
  /** A tapped item to use on arrival; `left` is game seconds (a slow frame
   *  rate walks slower in real time, so a wall clock would give up early). */
  const pending = useRef<{ run: PropRun; left: number } | null>(null);
  const seated = useRef<PropRun | null>(null);
  const hover = useRef<PropRun | null>(null);

  const model = useMemo(() => {
    const counts: Record<Shape, number> = { box: 0, slab: 0, cyl: 0, ball: 0, cone: 0 };
    const base = new THREE.Matrix4(),
      pivot = new THREE.Matrix4(),
      inverse = new THREE.Matrix4(),
      local = new THREE.Matrix4();
    const runs: PropRun[] = kit.props.map((prop) => {
      dummy.position.set(prop.x, prop.y, prop.z);
      dummy.rotation.set(0, prop.turn, 0);
      dummy.scale.setScalar(prop.scale);
      dummy.updateMatrix();
      base.copy(dummy.matrix);
      pivot.makeTranslation(prop.pivot[0], prop.pivot[1], prop.pivot[2]);
      inverse.makeTranslation(-prop.pivot[0], -prop.pivot[1], -prop.pivot[2]);
      const parts = prop.parts.map((piece) => ({
        shape: piece.shape,
        index: counts[piece.shape]++,
        q: new THREE.Matrix4().multiplyMatrices(inverse, pieceMatrix(piece, local)),
      }));
      const run: PropRun = {
        prop,
        p: new THREE.Matrix4().multiplyMatrices(base, pivot),
        parts,
        on: prop.on,
        t: -1,
        phase: prop.on ? 1 : 0,
        angle: 0,
        dirty: true,
        item: null as unknown as Interactable,
      };
      return run;
    });
    // Glow instances: fixed glows, then one sparkle per prop, then the marker.
    const sparkle0 = kit.glows.length;
    const marker = sparkle0 + runs.length;
    return { counts, runs, sparkle0, marker, glowCount: marker + 1 };
  }, [kit]);

  const lampOn = (id: string | undefined) => !id || !!model.runs.find((run) => run.prop.id === id)?.on;

  const writeLights = () => {
    const glows = glowMesh.current,
      pools = poolMesh.current;
    if (glows) {
      kit.glows.forEach((glow, i) => {
        const k = lampOn(glow.lamp) ? 1 : 0;
        out.makeScale(glow.s[0] * k, glow.s[1] * k, glow.s[2] * k).setPosition(glow.p[0], glow.p[1], glow.p[2]);
        glows.setMatrixAt(i, out);
      });
      glows.instanceMatrix.needsUpdate = true;
    }
    if (pools) {
      kit.pools.forEach((pool, i) => {
        const k = lampOn(pool.lamp) ? 2 : 0;
        out.makeScale(pool.rx * k, 1, pool.rz * k).setPosition(pool.x, 0.17, pool.z);
        pools.setMatrixAt(i, out);
      });
      pools.instanceMatrix.needsUpdate = true;
    }
  };

  // Colours and first matrices.
  useLayoutEffect(() => {
    for (const run of model.runs) {
      run.prop.parts.forEach((piece, i) => {
        const mesh = partMeshes.current[piece.shape];
        mesh?.setColorAt(run.parts[i].index, tint.set(piece.c));
      });
      run.dirty = true;
    }
    for (const shape of SHAPES) {
      const mesh = partMeshes.current[shape];
      if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    const glows = glowMesh.current;
    if (glows) {
      out.makeScale(0, 0, 0);
      for (let i = model.sparkle0; i < model.glowCount; i++) glows.setMatrixAt(i, out);
    }
    writeLights();
  }, [model]);

  // Registration: every prop is an interactable; `use` is its response.
  useEffect(() => {
    const still = reducedMotion;
    const setLamp = (run: PropRun, on: boolean) => {
      run.on = on;
      run.phase = on ? 1 : 0;
    };
    const use = (run: PropRun) => {
      const prop = run.prop;
      const action = prop.action;
      if (isToggle(prop)) {
        run.on = !run.on;
        if (still() || prop.motion.kind === "none") run.phase = run.on ? 1 : 0;
      } else if (!still() && duration(prop) > 0) run.t = 0;
      run.dirty = true;
      switch (action.type) {
        case "lamp":
          writeLights();
          break;
        case "switch": {
          const lamps = model.runs.filter((other) => other.prop.action.type === "lamp");
          const anyOn = lamps.some((lamp) => lamp.on);
          for (const lamp of lamps) setLamp(lamp, !anyOn);
          writeLights();
          break;
        }
        case "tune":
          if (run.on) startTune(action.tune);
          else stopTune();
          // One turntable at a time.
          for (const other of model.runs)
            if (other !== run && other.prop.action.type === "tune" && other.on) {
              other.on = false;
              other.dirty = true;
            }
          break;
        case "read":
          if (isToggle(prop) && !run.on) closeCard({ room: roomId, id: prop.id });
          else showCard({ room: roomId, id: prop.id, title: action.title, text: action.text });
          break;
        case "board":
          boardVersion.current(++boardSteps.current);
          break;
        case "sit":
          if (run.on) {
            runtime.path = [];
            runtime.target = null;
            runtime.x = action.seat[0];
            runtime.z = action.seat[2];
            runtime.heading = action.face;
            if (seated.current && seated.current !== run) seated.current.on = false;
            seated.current = run;
          } else {
            // Stand up a step in front of the seat.
            seated.current = null;
            runtime.x = action.seat[0] + Math.sin(action.face) * 0.9;
            runtime.z = action.seat[2] + Math.cos(action.face) * 0.9;
          }
          break;
        default:
          break;
      }
      // A tune that cannot sound (muted) still spins; say nothing more.
      sound(prop.sound, { gain: action.type === "tune" && run.on ? 0.6 : 1 });
    };
    const items = model.runs.map((run) => {
      const prop = run.prop;
      const item: Interactable = {
        id: prop.id,
        room: roomId,
        x: prop.x,
        z: prop.z,
        y: prop.y + prop.anchor,
        reach: prop.reach,
        label: prop.label,
        verb: prop.verbOn ? () => (run.on ? prop.verbOn! : prop.verb) : prop.verb,
        kind: prop.action.type,
        use: () => use(run),
      };
      run.item = item;
      return item;
    });
    const off = registerInteractables(items);
    return () => {
      off();
      clearFocus();
      closeCard();
      if (tunePlaying()) stopTune();
      seated.current = null;
      pending.current = null;
    };
  }, [model, roomId, kit]);

  // Feedback for every use here; confetti when the room is complete.
  useEffect(() => {
    const offUse = useInteractables.subscribe((state, previous) => {
      if (state.uses === previous.uses || !state.last || state.last.item.room !== roomId) return;
      const run = model.runs.find((r) => r.item === state.last!.item);
      if (run) feedback(run, camera, gl.domElement, state.last.first);
    });
    const offFind = onDiscovery((event) => {
      if (event.roomId !== roomId || !event.roomComplete) return;
      juice.confetti(24);
      sound("perfect");
    });
    return () => {
      offUse();
      offFind();
    };
  }, [model, roomId, camera, gl]);

  // Taps and clicks on a prop: use it, or walk over and then use it.
  useEffect(() => {
    const canvas = gl.domElement;
    let downX = 0,
      downY = 0,
      downAt = 0;
    const blocked = () => {
      const s = useGame.getState();
      return s.paused || s.overlayLocked || s.traveling || s.panel !== "none" || !!useGameMode.getState().active || !gameInputEnabled(useStage.getState());
    };
    const pick = (event: PointerEvent, slack: number): PropRun | null => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      caster.setFromCamera(ndc, camera);
      ray.copy(caster.ray);
      let best: PropRun | null = null,
        bestDistance = slack;
      for (const run of model.runs) {
        const prop = run.prop;
        point.set(prop.x, prop.y + Math.min(prop.anchor, 1.2) * 0.6, prop.z);
        const distance = Math.sqrt(ray.distanceSqToPoint(point));
        if (distance < bestDistance) {
          best = run;
          bestDistance = distance;
        }
      }
      return best;
    };
    const down = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
      downAt = performance.now();
    };
    const up = (event: PointerEvent) => {
      if (performance.now() - downAt > 450 || Math.hypot(event.clientX - downX, event.clientY - downY) > 12 || blocked()) return;
      const run = pick(event, event.pointerType === "mouse" ? 0.55 : 0.85);
      if (!run) return;
      const prop = run.prop;
      const reach = prop.reach ?? DEFAULT_REACH;
      if (Math.hypot(prop.x - runtime.x, prop.z - runtime.z) <= reach) {
        runtime.path = [];
        runtime.target = null;
        activate(run.item, "tap");
        return;
      }
      // Stop just short of it, on the player's side, inside the walls.
      const room = roomFor(scene);
      const dx = runtime.x - prop.x,
        dz = runtime.z - prop.z;
      const length = Math.hypot(dx, dz) || 1;
      const stand = Math.min(reach - 0.5, 1.4);
      walkTo(
        Math.max(-room.walkX, Math.min(room.walkX, prop.x + (dx / length) * stand)),
        Math.max(room.minZ, Math.min(room.maxZ, prop.z + (dz / length) * stand)),
      );
      pending.current = { run, left: 9 };
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const run = blocked() ? null : pick(event, 0.55);
      if (run !== hover.current) {
        hover.current = run;
        canvas.style.cursor = run ? "pointer" : "";
      }
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointermove", move);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointermove", move);
      canvas.style.cursor = "";
    };
  }, [model, camera, gl, scene]);

  // QA: what the room offers, and a way to use one by id.
  useEffect(() => {
    exposeQa({
      interactables: () =>
        model.runs.map((run) => ({ id: run.prop.id, label: run.prop.label, verb: verbOf(run.item), kind: run.prop.action.type, x: +run.prop.x.toFixed(2), z: +run.prop.z.toFixed(2), tapY: +(run.prop.y + Math.min(run.prop.anchor, 1.2) * 0.6).toFixed(2), found: isDiscovered(roomId, run.prop.id), on: run.on })),
      roomLife: {
        roomId,
        progress: () => roomProgress(roomId),
        use: (id: string) => {
          const run = model.runs.find((r) => r.prop.id === id);
          return run ? activate(run.item, "script") : false;
        },
      },
    });
  }, [model, roomId]);

  // Discovery keys, built once (the sparkle loop runs every frame).
  const findKeys = useMemo(() => model.runs.map((run) => `${roomId}:${run.prop.id}`), [model, roomId]);
  const found = useDiscoveries((s) => s.found);
  const foundRef = useRef(found);
  useEffect(() => {
    foundRef.current = found;
  }, [found]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const g = useGame.getState();
    const still = reducedMotion();
    const halted = g.paused || g.overlayLocked || g.traveling || g.panel !== "none" || !!useGameMode.getState().active || !gameInputEnabled(useStage.getState());
    // A door or exit prompt in reach has the key: no focus meanwhile.
    const blocked = halted || g.near !== "";
    const focus = updateFocus(runtime.x, runtime.z, runtime.heading, blocked);

    // A tap from across the room: use it on arrival.
    const wait = pending.current;
    if (wait) {
      const prop = wait.run.prop;
      const moving = keys.size > 0 || Math.hypot(touch.x, touch.z) > 0.1;
      wait.left -= dt;
      if (halted || moving || wait.left < 0) pending.current = null;
      // Walking past a doorway only defers it.
      else if (!blocked && Math.hypot(prop.x - runtime.x, prop.z - runtime.z) <= (prop.reach ?? DEFAULT_REACH)) {
        pending.current = null;
        runtime.path = [];
        runtime.target = null;
        activate(wait.run.item, "tap");
      }
    }
    // Standing up: any step off the seat.
    const seat = seated.current;
    if (seat && seat.prop.action.type === "sit") {
      const [sx, , sz] = seat.prop.action.seat;
      if (Math.hypot(runtime.x - sx, runtime.z - sz) > 0.05) {
        seat.on = false;
        seated.current = null;
      }
    }
    seatLift.on = !!seated.current;
    seatLift.y = seated.current && seated.current.prop.action.type === "sit" ? seated.current.prop.action.seat[1] : 0;

    // Moving parts.
    let touched = 0;
    for (const run of model.runs) {
      const m = run.prop.motion;
      let moving = run.dirty;
      if (run.t >= 0) {
        run.t += dt;
        moving = true;
        if (run.t >= duration(run.prop)) run.t = -1;
      }
      if (m.kind === "spin" && run.on && !still) {
        run.angle = (run.angle + dt * m.speed) % (Math.PI * 2);
        moving = true;
      }
      const target = run.on ? 1 : 0;
      if (run.phase !== target) {
        run.phase = still ? target : target > run.phase ? Math.min(1, run.phase + dt * 3.2) : Math.max(0, run.phase - dt * 3.2);
        moving = true;
      }
      if (!moving || run.parts.length === 0) {
        run.dirty = false;
        continue;
      }
      run.dirty = false;
      const a = motionMatrix(run);
      for (const part of run.parts) {
        const mesh = partMeshes.current[part.shape];
        if (!mesh) continue;
        out.multiplyMatrices(run.p, a).multiply(part.q);
        mesh.setMatrixAt(part.index, out);
        touched |= 1 << SHAPES.indexOf(part.shape);
      }
    }
    if (touched)
      for (let i = 0; i < SHAPES.length; i++)
        if (touched & (1 << i)) {
          const mesh = partMeshes.current[SHAPES[i]];
          if (mesh) mesh.instanceMatrix.needsUpdate = true;
        }

    // Sparkles on what has not been touched yet, and the focus marker.
    const glows = glowMesh.current;
    if (glows) {
      const array = glows.instanceMatrix.array as Float32Array;
      const time = state.clock.elapsedTime;
      const known = foundRef.current;
      for (let i = 0; i < model.runs.length; i++) {
        const prop = model.runs[i].prop;
        const o = (model.sparkle0 + i) * 16;
        const hidden = known[findKeys[i]] === true || model.runs[i].item === focus;
        const twinkle = hidden ? 0 : still ? 0.8 : 0.62 + 0.38 * Math.sin(time * 3.1 + i * 1.7);
        const lift = still ? 0 : Math.sin(time * 1.6 + i) * 0.06;
        array[o] = 0.075 * twinkle;
        array[o + 5] = 0.13 * twinkle;
        array[o + 10] = 0.075 * twinkle;
        array[o + 12] = prop.x;
        array[o + 13] = prop.y + prop.anchor + 0.32 + lift;
        array[o + 14] = prop.z;
        array[o + 15] = 1;
      }
      const o = model.marker * 16;
      const marked = focus && focus.room === roomId ? focus : hover.current && !blocked ? hover.current.item : null;
      const bob = still ? 0 : Math.sin(time * 4.2) * 0.07;
      const s = marked ? 1 : 0;
      array[o] = 0.1 * s;
      array[o + 5] = 0.17 * s;
      array[o + 10] = 0.1 * s;
      array[o + 12] = marked ? marked.x : 0;
      array[o + 13] = marked ? (marked.y ?? 1.4) + 0.42 + bob : -10;
      array[o + 14] = marked ? marked.z : 0;
      array[o + 15] = 1;
      glows.instanceMatrix.clearUpdateRanges();
      glows.instanceMatrix.addUpdateRange(model.sparkle0 * 16, (model.runs.length + 1) * 16);
      glows.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <Live>
      <group name="room-life-live">
        {SHAPES.map(
          (shape) =>
            model.counts[shape] > 0 && (
              <instancedMesh
                key={shape}
                ref={(mesh) => {
                  partMeshes.current[shape] = mesh;
                }}
                args={[GEOMETRY[shape], pieceMaterial, model.counts[shape]]}
                receiveShadow
                frustumCulled={false}
                raycast={noRaycast}
                dispose={null}
              />
            ),
        )}
        <instancedMesh ref={glowMesh} args={[glowGeometry, glowMaterial, model.glowCount]} frustumCulled={false} raycast={noRaycast} dispose={null} />
        {kit.pools.length > 0 && (
          <instancedMesh ref={poolMesh} args={[contactBlobGeometry, poolMaterial, kit.pools.length]} renderOrder={-1} frustumCulled={false} raycast={noRaycast} dispose={null} />
        )}
        <Boards boards={kit.boards} register={(set) => (boardVersion.current = set)} />
      </group>
    </Live>
  );
}

function Boards({ boards, register }: { boards: Board[]; register: (set: (n: number) => void) => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => register(setStep), [register]);
  return (
    <>
      {boards.map((board, i) => (
        <BoardMesh key={i} board={board} step={step} />
      ))}
    </>
  );
}

/**
 * Mount after the room's Walker: lifts the avatar onto the seat it took.
 * (The Walker writes the avatar's position each frame; this runs next.)
 */
export function SeatLift() {
  const { scene } = useThree();
  const avatar = useRef<THREE.Object3D | null>(null);
  useFrame(() => {
    if (!seatLift.on) return;
    if (!avatar.current?.parent) avatar.current = scene.getObjectByName("scene-root")?.getObjectByName("village-player") ?? null;
    if (avatar.current) avatar.current.position.y = 0.18 + seatLift.y;
  });
  useEffect(
    () => () => {
      seatLift.y = 0;
      seatLift.on = false;
    },
    [],
  );
  return null;
}

/** The kit for the scene the player is in (memoised per room and tier). */
export function useRoomLifeKit(world: string, scene: string): { kit: Kit | null; roomId: string } {
  const thin = useStage((s) => s.tier === "low");
  const roomId = discoveryRoomId(world, scene);
  const kit = useMemo(() => buildRoomLife(roomId, { thin }), [roomId, thin]);
  return { kit, roomId };
}
