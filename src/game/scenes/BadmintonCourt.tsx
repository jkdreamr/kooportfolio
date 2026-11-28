import { StaticBatch } from "../world/StaticBatch";
import { screenOverlayNoOcclude } from "../world/screenOverlay";
import { useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { setViewZoom, viewZoom, zoomedOffset } from "../engine/camera";

const courtOffset = new THREE.Vector3(),
  courtCamera = new THREE.Vector3();
import {
  BADMINTON_MARK_COUNT,
  badmintonMarkGeometry,
  badmintonMarkMaterial,
} from "../core/badminton-marks";
import {
  BADMINTON,
  canReturnBadminton,
  newBadmintonGame,
  newBadmintonLanding,
  predictBadmintonLanding,
  stepBadminton,
  type BadmintonCall,
  type BadmintonGame,
  type BadmintonInput,
  type BadmintonShot,
} from "../core/badminton";
import { runtime, useGame } from "../core/store";
import { useLauncher, useLauncherHosted } from "../core/launchers";
import { useJuice } from "./juice/Juice";
import { ResultCard } from "../ui/ResultCard";
import { startGameMode, endGameMode, useGameMode } from "../core/gameMode";
import { keys, touch } from "../core/input";
import { sound } from "../core/sound";
import { Ball, Box, Cylinder, Ring } from "../world/Models";
import { HitPad, MovePad } from "./BadmintonControls";
import { BadmintonGym } from "./BadmintonGym";
import { gameIsActive } from "./InteriorProps";
import "./badminton.css";

// Enlarge only the horizontal playing surface; avatars retain village scale.
const COURT_SCALE = 1.4;

// Court cues, all in one instanced draw (core/badminton-marks.ts). Slots:
const SHADOW = 0,
  LAND_RING = 1,
  LAND_DOT = 2,
  REACH_RING = 3,
  REACH_GLOW = 4,
  LINE = 5,
  PULSE = 6,
  TRAIL = 7,
  TRAIL_COUNT = BADMINTON_MARK_COUNT - TRAIL;
const MARK_Y = 0.236;
const markColor = {
  shadow: new THREE.Color("#0b2423"),
  /** Lands in on your side: yours to return. */
  yours: new THREE.Color("#ffc93d"),
  /** Lands in on their side: a good shot. */
  theirs: new THREE.Color("#4ff2c4"),
  out: new THREE.Color("#ff4f4f"),
  reach: new THREE.Color("#ffe07a"),
  idle: new THREE.Color("#eaf6f0"),
  trail: new THREE.Color("#fff6de"),
};
const markFloor = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -Math.PI / 2,
);
const markSlot = new THREE.Object3D();
const landing = newBadmintonLanding();
const callText: Record<BadmintonCall, string> = {
  none: "Point",
  in: "In!",
  out: "Out!",
  net: "Net!",
  short: "Short",
};

function placeMark(
  mesh: THREE.InstancedMesh,
  shape: THREE.InstancedBufferAttribute,
  i: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  color: THREE.Color,
  inner: number,
  soft: number,
  alpha: number,
  facing: THREE.Quaternion = markFloor,
) {
  if (alpha > 0) markSlot.position.set(x, y, z);
  else markSlot.position.set(0, -10, 0);
  markSlot.quaternion.copy(facing);
  markSlot.scale.set(alpha > 0 ? sx : 0, alpha > 0 ? sy : 0, 1);
  markSlot.updateMatrix();
  mesh.setMatrixAt(i, markSlot.matrix);
  mesh.setColorAt(i, color);
  shape.setXYZ(i, inner, soft, alpha);
}

/** Shadow, predicted landing, reach, line call and trail for this frame. */
function drawMarks(
  mesh: THREE.InstancedMesh,
  game: BadmintonGame,
  trail: Float32Array,
  camera: THREE.Camera,
  time: number,
) {
  const shape = mesh.geometry.getAttribute(
    "aMark",
  ) as THREE.InstancedBufferAttribute;
  const s = game.shuttle,
    k = COURT_SCALE;
  const sx = s.x * k,
    sz = (s.z - 2) * k,
    height = Math.max(0, s.y - BADMINTON.floor);
  // A soft contact shadow: tight and dark near the floor, wide and faint high.
  placeMark(mesh, shape, SHADOW, sx, MARK_Y, sz, 0.46 + height * 0.1, 0.46 + height * 0.1,
    markColor.shadow, 0, 0.85, Math.max(0.16, 0.62 - height * 0.09));
  predictBadmintonLanding(game, landing);
  const land = landing.active ? (landing.net || !landing.inBounds ? markColor.out : landing.side === "player" ? markColor.yours : markColor.theirs) : markColor.out;
  // The ring closes on the spot as contact nears; the dot is the exact point.
  const ring = 0.5 + Math.min(1.6, landing.time * 0.9);
  const lx = landing.x * k,
    lz = (landing.z - 2) * k;
  placeMark(mesh, shape, LAND_RING, lx, MARK_Y + 0.002, lz, ring * 2, ring * 2, land,
    0.8, 0.1, landing.active ? 0.95 : 0);
  placeMark(mesh, shape, LAND_DOT, lx, MARK_Y + 0.003, lz, 0.34, 0.34, land,
    0, 0.45, landing.active ? 0.95 : 0);
  // Reach: the racket's true radius around the player, lit when a hit is legal.
  const ready = canReturnBadminton(game);
  const incoming = game.phase === "rally" && game.lastHit === "opponent";
  const px = game.player.x * k,
    pz = (game.player.z - 2) * k,
    reach = 1.65 * k * 2;
  const beat = 0.85 + 0.15 * Math.sin(time * 18);
  placeMark(mesh, shape, REACH_RING, px, MARK_Y + 0.001, pz, reach, reach,
    ready ? markColor.reach : markColor.idle, 0.93, 0.05, ready ? beat : incoming ? 0.22 : 0);
  placeMark(mesh, shape, REACH_GLOW, px, MARK_Y, pz, reach, reach, markColor.reach,
    0, 1, ready ? 0.3 * beat : 0);
  // Line call: the judged boundary flashes green (in) or red (out) at the
  // contact, with a pulse ring, through the point pause.
  const call = game.call;
  const showing = game.phase !== "rally" && call.kind !== "none" && call.kind !== "short";
  const fade = showing ? Math.max(0, 1 - game.pointTime / 1.4) : 0;
  const flash = fade * (0.65 + 0.35 * Math.cos(game.pointTime * 16));
  const tone = call.kind === "in" ? markColor.theirs : markColor.out;
  const hw = BADMINTON.halfWidth,
    hl = BADMINTON.halfLength;
  const ax = Math.abs(call.x),
    az = Math.abs(call.z);
  const sideline =
    call.kind === "net" ? false : call.kind === "out" ? ax - hw > az - hl : hw - ax < hl - az;
  const zSign = call.z < 0 ? -1 : 1;
  if (call.kind === "net")
    placeMark(mesh, shape, LINE, 0, MARK_Y + 0.004, -2 * k, hw * 2 * k + 0.3, 0.3, tone, -1, 0.5, flash);
  else if (sideline)
    placeMark(mesh, shape, LINE, (call.x < 0 ? -hw : hw) * k, MARK_Y + 0.004, ((zSign * hl) / 2 - 2) * k,
      0.3, hl * k + 0.3, tone, -1, 0.5, flash);
  else
    placeMark(mesh, shape, LINE, 0, MARK_Y + 0.004, (zSign * hl - 2) * k, hw * 2 * k + 0.3, 0.3, tone, -1, 0.5, flash);
  const pulse = 0.6 + (1 - fade) * 2.4;
  placeMark(mesh, shape, PULSE, call.x * k, MARK_Y + 0.005, (call.z - 2) * k, pulse, pulse, tone,
    0.78, 0.12, fade * 0.95);
  // Trail: the last few sampled positions, facing the camera, fading out.
  const flying = game.phase === "rally";
  const wy = s.y + 0.18;
  const dx = sx - trail[0],
    dy = wy - trail[1],
    dz = sz - trail[2];
  if (!flying) trail.fill(NaN);
  else if (!(dx * dx + dy * dy + dz * dz < 0.09)) {
    trail.copyWithin(3, 0, trail.length - 3);
    trail[0] = sx;
    trail[1] = wy;
    trail[2] = sz;
  }
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const x = trail[i * 3],
      f = 1 - i / TRAIL_COUNT,
      size = 0.1 + 0.16 * f;
    placeMark(mesh, shape, TRAIL + i, x, trail[i * 3 + 1], trail[i * 3 + 2], size, size,
      markColor.trail, 0, 0.9, flying && i > 0 && x === x ? 0.32 * f : 0, camera.quaternion);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  shape.needsUpdate = true;
}

function Racket({ color = "#dba752" }: { color?: string }) {
  return (
    <group>
      <Cylinder p={[0, 0.25, 0]} s={[0.045, 0.5, 0.045]} c="#4c4540" />
      <Cylinder p={[0, 0.06, 0]} s={[0.065, 0.2, 0.065]} c="#ebe2c8" />
      <group position={[0, 0.82, 0]} scale={[0.8, 1.1, 1]}>
        <Ring radius={0.36} tube={0.045} c={color} r={[0, 0, 0]} />
        {[-0.18, -0.06, 0.06, 0.18].map((v) => (
          <group key={v}>
            <Box
              p={[v, 0, 0]}
              s={[0.014, Math.sqrt(0.36 ** 2 - v ** 2) * 2, 0.014]}
              c="#ece0b7"
              sharp
            />
            <Box
              p={[0, v, 0]}
              s={[Math.sqrt(0.36 ** 2 - v ** 2) * 2, 0.014, 0.014]}
              c="#ece0b7"
              sharp
            />
          </group>
        ))}
      </group>
    </group>
  );
}

function Shuttlecock() {
  return (
    <group scale={0.85}>
      <Ball s={[0.13, 0.16, 0.13]} c="#eee4c8" />
      <Cylinder p={[0, 0.12, 0]} s={[0.145, 0.06, 0.145]} c="#ab6a40" />
      {Array.from({ length: 8 }, (_, i) => (
        <group key={i} rotation={[0, (i * Math.PI) / 4, 0]}>
          <Box
            p={[0.12, 0.34, 0]}
            s={[0.09, 0.46, 0.06]}
            r={[0, 0, -0.4]}
            c={i % 2 ? "#fff3d9" : "#e5d6ba"}
          />
        </group>
      ))}
      <Ring p={[0, 0.46, 0]} radius={0.24} tube={0.018} c="#ded0af" />
    </group>
  );
}

function Player({
  game,
  opponent = false,
  color,
}: {
  game: BadmintonGame;
  opponent?: boolean;
  color: string;
}) {
  const rig = useRef<THREE.Group>(null),
    arm = useRef<THREE.Group>(null),
    legs = useRef<THREE.Group>(null);
  const previous = useRef({ x: 0, z: opponent ? -5.7 : 5.7, stride: 0 });
  useFrame((_, delta) => {
    if (!rig.current || !gameIsActive() || !runtime.active) return;
    const p = opponent ? game.opponent : game.player;
    const speed = Math.hypot(
      p.x - previous.current.x,
      p.z - previous.current.z,
    );
    previous.current.stride += Math.min(delta, 0.05) * (speed > 0.001 ? 15 : 0);
    rig.current.position.set(p.x * COURT_SCALE, 0.19, (p.z - 2) * COURT_SCALE);
    rig.current.rotation.y = opponent ? 0 : Math.PI;
    if (arm.current)
      arm.current.rotation.x =
        -0.4 - Math.sin((p.swing / 0.28) * Math.PI) * 2.2;
    legs.current?.children.forEach((leg, i) => {
      leg.rotation.x =
        speed > 0.001
          ? Math.sin(previous.current.stride + i * Math.PI) * 0.6
          : 0;
    });
    previous.current.x = p.x;
    previous.current.z = p.z;
  });
  return (
    <group
      ref={rig}
      position={[0, 0.19, (opponent ? -7.7 : 3.7) * COURT_SCALE]}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <circleGeometry args={[0.5, 24]} />
        <meshBasicMaterial
          color="#143c3b"
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      </mesh>
      <group ref={legs}>
        {[-0.2, 0.2].map((x) => (
          <group key={x} position={[x, 0.5, 0]}>
            <Box p={[0, -0.05, 0]} s={[0.3, 0.36, 0.36]} c="#263b40" />
            <Box p={[0, -0.28, 0]} s={[0.2, 0.25, 0.23]} c="#d9a57b" />
            <Box p={[0, -0.42, 0.08]} s={[0.33, 0.18, 0.49]} c="#f4e8ce" />
            <Box p={[0, -0.48, 0.08]} s={[0.34, 0.05, 0.5]} c={color} />
          </group>
        ))}
      </group>
      <Box p={[0, 0.95, 0]} s={[0.8, 0.72, 0.46]} c={color} />
      <Box p={[0, 1.18, 0.24]} s={[0.12, 0.13, 0.025]} c="#efdca6" />
      <group ref={arm} position={[-0.5, 1.13, 0]}>
        <Box p={[0, -0.2, 0]} s={[0.24, 0.5, 0.26]} c="#e4b28a" />
        <Box p={[0, -0.35, 0]} s={[0.26, 0.1, 0.28]} c="#f5e8cd" />
        <group position={[0, -0.45, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
          <Racket color={opponent ? "#c45e44" : "#dba752"} />
        </group>
      </group>
      <Box
        p={[0.5, 0.94, 0]}
        s={[0.23, 0.5, 0.25]}
        c="#e4b28a"
        r={[-0.2, 0, 0.15]}
      />
      <Box p={[0, 1.67, 0]} s={[0.8, 0.7, 0.68]} c="#e4b28a" />
      <Box p={[0, 1.99, -0.02]} s={[0.84, 0.2, 0.72]} c="#3d332c" />
      <Box
        p={[0, 1.9, 0.04]}
        s={[0.83, 0.09, 0.67]}
        c={opponent ? "#c45e44" : "#e8d5a9"}
      />
      {[-0.17, 0.17].map((x) => (
        <Ball
          key={x}
          p={[x, 1.68, 0.35]}
          s={[0.045, 0.065, 0.025]}
          c="#342c27"
        />
      ))}
      <Box p={[0, 1.51, 0.355]} s={[0.16, 0.025, 0.02]} c="#936552" />
    </group>
  );
}

function CourtFurnishings() {
  return (
    <group>
      <group scale={[COURT_SCALE, 1, COURT_SCALE]}>
        <Box p={[0, 0.05, -2]} s={[10.4, 0.24, 19.4]} c="#365844" />
        <Box p={[0, 0.185, -2]} s={[8, 0.035, 17]} c="#387e83" sharp />
        {[-4, -3.4, 3.4, 4].map((x) => (
          <Box
            key={x}
            p={[x, 0.213, -2]}
            s={[0.055, 0.025, 17.05]}
            c="#f2e5c2"
            sharp
          />
        ))}
        {[-8.5, -7.55, -2.5, 2.5, 7.55, 8.5].map((z) => (
          <Box
            key={z}
            p={[0, 0.213, z - 2]}
            s={[8.05, 0.025, 0.055]}
            c="#f2e5c2"
            sharp
          />
        ))}
        {[-1, 1].map((side) => (
          <Box
            key={side}
            p={[0, 0.213, side * 5.5 - 2]}
            s={[0.055, 0.025, 6]}
            c="#f2e5c2"
            sharp
          />
        ))}
        {[-4.15, 4.15].map((x) => (
          <group key={x} position={[x, 0, -2]}>
            <Box p={[0, 0.3, 0]} s={[0.68, 0.35, 0.7]} c="#3a433c" />
            <Cylinder p={[0, 1.25, 0]} s={[0.1, 2.25, 0.1]} c="#ca9b4f" />
            <Ball p={[0, 2.42, 0]} s={[0.15, 0.15, 0.15]} c="#e6ba62" />
            <Ring p={[0, 0.52, 0]} radius={0.15} tube={0.04} c="#9d7136" />
          </group>
        ))}
        {/* Real open mesh, rather than an opaque card across the play area. */}
        {Array.from({ length: 41 }, (_, i) => (
          <Box
            key={`v${i}`}
            p={[-4 + i * 0.2, 1.65, -2]}
            s={[0.015, 1.2, 0.015]}
            c="#293c39"
            sharp
          />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <Box
            key={`h${i}`}
            p={[0, 1.05 + i * 0.2, -2]}
            s={[8.1, 0.015, 0.015]}
            c="#293c39"
            sharp
          />
        ))}
        <Box
          p={[0, BADMINTON.net + 0.18, -2]}
          s={[8.25, 0.095, 0.065]}
          c="#f5e6bd"
        />
        <Box p={[0, 1.05, -2]} s={[8.25, 0.035, 0.035]} c="#dfc898" />
      </group>
      {[-10.5, 10.5].map((x) => (
        <group key={x} position={[x, 0, -5]}>
          {[-1.1, 1.1].map((z) => (
            <Box key={z} p={[0, 0.35, z]} s={[1, 0.7, 0.4]} c="#4d4030" />
          ))}
          {[-0.32, 0, 0.32].map((xx) => (
            <Box key={xx} p={[xx, 0.78, 0]} s={[0.28, 0.2, 3.5]} c="#a86b38" />
          ))}
          <Box
            p={[x < 0 ? -0.5 : 0.5, 1.22, 0]}
            s={[0.18, 0.7, 3.5]}
            c="#86502d"
          />
          <group
            position={[0, 0.92, -0.7]}
            rotation={[0, 0.2, Math.PI / 2]}
            scale={0.9}
          >
            <Racket />
          </group>
          <Cylinder p={[0.1, 1.03, 0.8]} s={[0.14, 0.52, 0.14]} c="#688d9d" />
          <Cylinder p={[0.1, 1.32, 0.8]} s={[0.1, 0.08, 0.1]} c="#dfc998" />
          <Box p={[0, 0.93, 0.2]} s={[0.75, 0.12, 0.62]} c="#e2d4b4" />
        </group>
      ))}
      <group position={[-10.5, 0, 7.7]}>
        <Box p={[0, 0.42, 0]} s={[1.4, 0.8, 1.1]} c="#795132" />
        <Box p={[0, 0.84, 0]} s={[1.48, 0.15, 1.18]} c="#c39a54" />
        {[0, 1, 2].map((i) => (
          <group
            key={i}
            position={[-0.4 + i * 0.35, 0.95, 0]}
            rotation={[0, 0, i * 0.2]}
          >
            <Shuttlecock />
          </group>
        ))}
      </group>
    </group>
  );
}

function view(game: BadmintonGame) {
  return {
    score: [...game.score],
    phase: game.phase,
    message: game.message,
    rally: game.rally,
    longest: game.longestRally,
    winner: game.winner,
    canReturn: canReturnBadminton(game),
  };
}
const noInput = (): BadmintonInput => ({
  x: 0,
  z: 0,
  swing: false,
  aim: 0,
  shot: "clear",
});
const moveKeys = new Set([
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  " ",
  "q",
  "e",
  "1",
  "2",
  "3",
]);

/** Furnishings for the shared 34×40 hall; the host hides Walker while playing. */
export function BadmintonCourt({
  onPlayingChange,
}: {
  onPlayingChange?: (active: boolean) => void;
}) {
  const game = useRef(newBadmintonGame());
  const input = useRef(noInput()),
    held = useRef(new Set<string>()),
    movement = useRef({ x: 0, z: 0 });
  const playing = useGameMode((s) => s.active?.id === "badminton");
  const [snapshot, setSnapshot] = useState(() => view(game.current));
  const [record, setRecord] = useState<null | { won: boolean; longest: number; bestRally: number; newRally: boolean; wins: number }>(null);
  const fx = useJuice();
  const [aim, setAim] = useState<-1 | 0 | 1>(0),
    [shot, setShot] = useState<BadmintonShot>("clear");
  const blocked = useGame((s) => s.paused || s.panel !== "none");
  const color = useGame((s) => s.save.color);
  const gl = useThree((s) => s.gl),
    portal = useMemo(() => ({ current: gl.domElement.parentElement! }), [gl]);
  const shuttle = useRef<THREE.Group>(null);
  const marks = useMemo(() => {
    const mesh = new THREE.InstancedMesh(
      badmintonMarkGeometry(),
      badmintonMarkMaterial,
      BADMINTON_MARK_COUNT,
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    // Colour attribute present from the first frame: the prewarmed program.
    for (let i = 0; i < BADMINTON_MARK_COUNT; i++)
      mesh.setColorAt(i, markColor.idle);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return mesh;
  }, []);
  useEffect(() => () => marks.geometry.dispose(), [marks]);
  const trail = useMemo(() => new Float32Array(TRAIL_COUNT * 3).fill(NaN), []);
  const clock = useRef(0);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const matchCamera = useThree((s) => s.camera);
  useEffect(
    () => () => {
      if (
        matchCamera instanceof THREE.OrthographicCamera ||
        matchCamera instanceof THREE.PerspectiveCamera
      )
        matchCamera.clearViewOffset();
    },
    [playing, matchCamera],
  );
  useEffect(() => {
    onPlayingChange?.(playing);
    return () => onPlayingChange?.(false);
  }, [playing, onPlayingChange]);
  useEffect(() => {
    if (!playing) return;
    const clear = () => {
      held.current.clear();
      movement.current.x = movement.current.z = 0;
      input.current.x = input.current.z = 0;
      input.current.swing = false;
      keys.clear();
      touch.x = touch.z = 0;
    };
    clear();
    const down = (e: KeyboardEvent) => {
      if (!moveKeys.has(e.key.toLowerCase()) || !gameIsActive()) return;
      const target = e.target as HTMLElement;
      if (
        target.matches("input,textarea,select") ||
        (e.key === " " &&
          target.closest("button,a") &&
          !target.closest("[data-badminton-shortcuts]"))
      )
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const key = e.key.toLowerCase();
      held.current.add(key);
      if (e.repeat) return;
      if (key === " ") input.current.swing = true;
      if (["1", "2", "3"].includes(key)) {
        const next = (["clear", "drop", "smash"] as const)[Number(key) - 1];
        input.current.shot = next;
        setShot(next);
      }
      if (key === "q" || key === "e") {
        const next = Math.max(
          -1,
          Math.min(1, input.current.aim + (key === "q" ? -1 : 1)),
        ) as -1 | 0 | 1;
        input.current.aim = next;
        setAim(next);
      }
    };
    const up = (e: KeyboardEvent) => {
      held.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", clear);
    window.addEventListener("interior-game-close", clear);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", clear);
      window.removeEventListener("interior-game-close", clear);
      clear();
    };
  }, [playing]);
  useEffect(() => {
    if (blocked) {
      held.current.clear();
      movement.current.x = movement.current.z = 0;
      input.current.swing = false;
    }
  }, [blocked]);
  useFrame(({ camera, size, clock: frameClock }, delta) => {
    if (!playing) return;
    if (gameIsActive() && runtime.active) {
      const h = held.current;
      input.current.x =
        Number(h.has("d") || h.has("arrowright")) -
        Number(h.has("a") || h.has("arrowleft")) +
        movement.current.x;
      input.current.z =
        Number(h.has("s") || h.has("arrowdown")) -
        Number(h.has("w") || h.has("arrowup")) +
        movement.current.z;
      const prev = {
        rally: game.current.rally,
        lastHit: game.current.lastHit,
        score: [...game.current.score],
        phase: game.current.phase,
      };
      const chosenShot = input.current.shot;
      stepBadminton(game.current, input.current, Math.min(delta, 0.05));
      input.current.swing = false;
      {
        const now = game.current;
        const spot: [number, number, number] = [now.shuttle.x * COURT_SCALE, 0.4, (now.shuttle.z - 2) * COURT_SCALE];
        const called = callText[now.call.kind];
        if (now.phase === "over" && prev.phase !== "over") {
          const won = now.winner === "player";
          const g = useGame.getState();
          const rally = g.recordBest("badminton.rally", now.longestRally);
          const wins = won ? g.countBest("badminton.wins") : null;
          setRecord({
            won,
            longest: now.longestRally,
            bestRally: rally.bests["badminton.rally"] ?? now.longestRally,
            newRally: rally.improved && now.longestRally > 0,
            wins: wins?.bests["badminton.wins"] ?? g.save.bests?.["badminton.wins"] ?? 0,
          });
          sound(won ? "win" : "lose");
          if (won) {
            fx.confetti();
            fx.haptic("win");
          }
        } else if (now.score[0] > prev.score[0]) {
          sound("score");
          fx.score(spot, called, "good");
        } else if (now.score[1] > prev.score[1]) {
          sound("miss");
          const [x, y] = fx.at(spot);
          fx.pop(called, x, y, "miss");
        } else if (now.rally > prev.rally) {
          if (now.lastHit === "player") {
            const smash = chosenShot === "smash";
            sound("shuttle", { intensity: smash ? 1 : 0 });
            if (smash) fx.shake(0.3);
            fx.haptic("tap");
          } else sound("shuttle", { gain: 0.7, pan: Math.max(-0.6, Math.min(0.6, now.shuttle.x / 4)) });
        }
      }
      clock.current += delta;
      if (clock.current >= 0.08) {
        setSnapshot(view(game.current));
        clock.current = 0;
      }
    }
    const s = game.current.shuttle;
    drawMarks(marks, game.current, trail, camera, frameClock.elapsedTime);
    if (shuttle.current) {
      shuttle.current.position.set(
        s.x * COURT_SCALE,
        s.y + 0.18,
        (s.z - 2) * COURT_SCALE,
      );
      direction.set(s.vx * COURT_SCALE, s.vy, s.vz * COURT_SCALE);
      if (direction.lengthSq() > 0.01)
        shuttle.current.quaternion.setFromUnitVectors(
          THREE.Object3D.DEFAULT_UP,
          direction.normalize().negate(),
        );
    }
    const narrow = size.width < 700;
    // Keep the entire court between the score and two compact touch surfaces.
    const portrait = size.width < 600 && size.height >= 500;
    const fitted = Math.min(
      30,
      (size.width - (narrow ? 24 : 120)) / (narrow ? 15 : 29),
      portrait
        ? (size.height - 154) / 20
        : (size.height - (size.height < 500 ? 84 : 160)) / 20,
    );
    const zoom = THREE.MathUtils.damp(
      viewZoom(camera),
      Math.max(6, fitted),
      7,
      delta,
    );
    courtOffset.set(0, 34, 36.1);
    zoomedOffset(camera, courtOffset, zoom, size.height);
    courtCamera.set(0, 0, -2.1).add(courtOffset);
    camera.position.lerp(courtCamera, 1 - Math.exp(-delta * 7));
    camera.lookAt(0, 0, -2.1);
    setViewZoom(camera, zoom, size.height);
    const viewed = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    if (portrait || size.height < 500)
      viewed.setViewOffset(
        size.width,
        size.height,
        0,
        portrait ? 15 : -20,
        size.width,
        size.height,
      );
    else if (viewed.view?.enabled) viewed.clearViewOffset();
    viewed.updateProjectionMatrix();
  });
  const begin = () => {
    if (!playing && !startGameMode("badminton")) return;
    setRecord(null);
    game.current = newBadmintonGame();
    input.current = noInput();
    setAim(0);
    setShot("clear");
    setSnapshot(view(game.current));
  };
  const end = () => {
    endGameMode();
  };
  const hosted = useLauncherHosted("badminton");
  useLauncher("badminton", "badminton", "Play a match", begin, { enabled: !playing, hint: "Enter" });
  const serving =
    snapshot.phase === "ready" && game.current.server === "player";
  const receiving = snapshot.phase === "ready" && !serving;
  const aimArrow = aim === -1 ? "↖" : aim === 1 ? "↗" : "↑";
  return (
    <>
      <BadmintonGym />
      <CourtFurnishings />
      <Player game={game.current} opponent color="#b8573f" />
      {playing && (
        <>
          <Player game={game.current} color={color} />
          <group ref={shuttle}>
            <Shuttlecock />
          </group>
          <primitive object={marks} dispose={null} />
        </>
      )}
      {!blocked && (
        <Html onOcclude={screenOverlayNoOcclude}
          portal={portal}
          fullscreen
          calculatePosition={(_object, _camera, size) => [
            size.width / 2,
            size.height / 2,
          ]}
          zIndexRange={[30, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className={`badminton-ui ${playing ? "is-playing" : ""}`}>
            {!playing ? (
              hosted ? null : <section className="badminton-start" aria-label="Badminton match">
                <p>Quick singles · first to 7</p>
                <button onClick={begin}>Play a match</button>
              </section>
            ) : (
              <>
                <p className="badminton-live" aria-live="polite" role="status">
                  {snapshot.phase === "over"
                    ? `Match over. ${snapshot.winner === "player" ? "You won" : "You lost"} ${snapshot.score[0]} to ${snapshot.score[1]}.`
                    : `You ${snapshot.score[0]}, opponent ${snapshot.score[1]}`}
                </p>
                <section className="badminton-score" aria-label="Rally">
                  <small>
                    {snapshot.message ||
                      `${snapshot.rally} shot${snapshot.rally === 1 ? "" : "s"} rally`}
                  </small>
                </section>
                {snapshot.phase === "over" ? (
                  <section
                    className="badminton-result"
                    aria-label="Match result"
                  >
                    <h2>{snapshot.winner === "player" ? "You win" : "Match over"}</h2>
                    <ResultCard
                      score={record?.longest ?? snapshot.longest}
                      unit="shot rally"
                      best={!!record?.newRally}
                      detail={`${snapshot.winner === "player" ? "Won" : "Lost"} ${snapshot.score[0]}–${snapshot.score[1]}${
                        record && !record.newRally ? ` · best rally ${record.bestRally}` : ""
                      }${record && record.wins > 0 ? ` · ${record.wins} won` : ""}`}
                      onReplay={begin}
                      onBack={end}
                      backLabel="Back to the room"
                    />
                  </section>
                ) : (
                  <>
                    <MovePad movement={movement} />
                    <section
                      className="badminton-actions"
                      aria-label="Racket controls"
                    >
                      <output
                        className="badminton-selection"
                        aria-label={
                          serving
                            ? "Standard high serve"
                            : receiving
                              ? "Receiving serve"
                              : "Selected return shot"
                        }
                      >
                        {serving ? "High serve" : receiving ? "Receive" : shot}{" "}
                        <span>{aimArrow}</span>
                      </output>
                      <div
                        className="badminton-shots"
                        role="group"
                        aria-label="Return shot"
                      >
                        {(["clear", "drop", "smash"] as const).map((v) => (
                          <button
                            key={v}
                            aria-pressed={shot === v}
                            onClick={() => {
                              setShot(v);
                              input.current.shot = v;
                            }}
                          >
                            {v === "clear"
                              ? "Clear"
                              : v === "drop"
                                ? "Drop"
                                : "Smash"}
                          </button>
                        ))}
                      </div>
                      <HitPad
                        input={input}
                        disabled={snapshot.phase === "point" || receiving}
                        serve={serving}
                        ready={snapshot.canReturn}
                        onShot={({ aim: nextAim, shot: nextShot }) => {
                          input.current.aim = nextAim;
                          input.current.shot = nextShot;
                          setAim(nextAim);
                          setShot(nextShot);
                        }}
                      />
                      <small className="badminton-gesture-hint">
                        {serving ? (
                          <>
                            High serve {aimArrow} · ← / → aim
                            <br />
                            Shots on returns
                          </>
                        ) : (
                          <>
                            ↑ clear · ↓ smash
                            <br />
                            <output
                              className="badminton-touch-selection"
                              aria-label="Selected return shot"
                            >
                              {shot} {aimArrow} ·{" "}
                            </output>
                            ← / → aim
                          </>
                        )}
                      </small>
                    </section>
                    <p className="badminton-hint">
                      WASD move · Space hit · Q/E aim · 1/2/3 shot
                    </p>
                    <button
                      className="badminton-leave badminton-quiet"
                      aria-label="Close match"
                      onClick={end}
                    >
                      Close
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </Html>
      )}
    </>
  );
}

/** Village-scale landmark only; placement and entry remain with the world host. */
export function BadmintonPavilion() {
  return (
    <StaticBatch id="BadmintonPavilion">
      <group>
        <Box p={[0, 0.3, 0]} s={[8, 0.6, 10]} c="#6c7053" />
        <Box p={[0, 0.62, 0]} s={[7.5, 0.15, 9.5]} c="#bca67c" />
        <Box p={[0, 0.72, 0]} s={[4.8, 0.06, 7.7]} c="#337b7f" />
        {[-2.2, 2.2].map((x) => (
          <Box
            key={x}
            p={[x, 0.77, 0]}
            s={[0.055, 0.02, 7.2]}
            c="#f0dfb6"
            sharp
          />
        ))}
        {[-3.6, -1.2, 1.2, 3.6].map((z) => (
          <Box
            key={z}
            p={[0, 0.77, z]}
            s={[4.45, 0.02, 0.055]}
            c="#f0dfb6"
            sharp
          />
        ))}
        {[-2.4, 2.4].map((x) => (
          <group key={x}>
            <Box p={[x, 0.9, 0]} s={[0.5, 0.35, 0.5]} c="#4c5140" />
            <Cylinder p={[x, 1.6, 0]} s={[0.07, 1.6, 0.07]} c="#d4a64f" />
          </group>
        ))}
        {Array.from({ length: 17 }, (_, i) => (
          <Box
            key={i}
            p={[-2.3 + i * 0.29, 1.8, 0]}
            s={[0.018, 0.9, 0.018]}
            c="#344e46"
            sharp
          />
        ))}
        {[1.35, 1.6, 1.85, 2.1, 2.25].map((y) => (
          <Box
            key={y}
            p={[0, y, 0]}
            s={[4.7, 0.018, 0.018]}
            c="#344e46"
            sharp
          />
        ))}
        <Box p={[0, 2.3, 0]} s={[4.85, 0.09, 0.07]} c="#f4e6bd" />
        <group position={[3.2, 1.2, -3]} rotation={[0, 0, -0.3]} scale={1.6}>
          <Racket />
        </group>
        <group position={[-1.1, 0.83, 1.7]}>
          <Shuttlecock />
        </group>
      </group>
    </StaticBatch>
  );
}
