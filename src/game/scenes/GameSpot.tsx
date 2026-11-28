import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { atGameSpot, gameSpotFor, markSpotSeen, spotLabel, spotSeen } from "../core/gameSpots";
import { useGameMode } from "../core/gameMode";
import { runtime, useGame, type Scene } from "../core/store";
import { Ring } from "../world/Models";

/**
 * Marks a room's game on the floor with a gently pulsing ring, and steers
 * the HUD's floating "<Game> · Play" label (ui/GameSpotLabel.tsx) to sit
 * above it. Existing ring material only (no new programs); no per-frame
 * allocation (one scratch vector, style writes only when something moved).
 */
const scratch = new THREE.Vector3();
export function GameSpotMarker({ scene }: { scene: Scene }) {
  const spot = gameSpotFor(scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const ring = useRef<THREE.Group>(null);
  const seen = useRef(spotSeen(scene));
  const last = useRef({ x: NaN, y: NaN, hidden: true, edge: false, w: 0, h: 0, el: null as HTMLElement | null });
  const origin = useRef({ left: 0, top: 0 });
  useEffect(() => {
    const rect = gl.domElement.getBoundingClientRect();
    origin.current = { left: rect.left, top: rect.top };
  }, [gl, size]);
  useEffect(
    () => () => {
      const el = spotLabel.el;
      if (el) el.dataset.hidden = "true";
    },
    [scene],
  );
  useFrame(({ clock }) => {
    if (!spot) return;
    if (ring.current) {
      const s = 1 + 0.06 * Math.sin(clock.elapsedTime * 2.4);
      ring.current.scale.set(s, 1, s);
    }
    const el = spotLabel.el;
    if (!el) return;
    const prev = last.current;
    if (prev.el !== el) {
      prev.el = el;
      prev.hidden = true;
      prev.x = NaN;
      el.dataset.beacon = seen.current ? "false" : "true";
      prev.w = 0;
    }
    const g = useGame.getState();
    const here = atGameSpot(spot, runtime.x, runtime.z);
    if (here && !seen.current) {
      seen.current = true;
      markSpotSeen(scene);
      el.dataset.beacon = "false";
      prev.w = 0;
    }
    scratch.set(spot.x, spot.y + 2.1, spot.z).project(camera);
    const off =
      scratch.z > 1 ||
      !!useGameMode.getState().active ||
      g.paused ||
      g.panel !== "none" ||
      g.scene !== scene ||
      (spot.walk && here);
    if (off !== prev.hidden) {
      prev.hidden = off;
      el.dataset.hidden = off ? "true" : "false";
    }
    if (off) return;
    // Kept on screen (clear of the header bar and the joystick) so the game
    // is findable from anywhere in the room; off-ring it drops the pointer.
    const rawX = (scratch.x * 0.5 + 0.5) * size.width;
    const rawY = (-scratch.y * 0.5 + 0.5) * size.height;
    if (!prev.w) {
      // Measured only when the label (or its beacon) changes, not per frame.
      prev.w = el.offsetWidth || 180;
      prev.h = el.offsetHeight || 60;
    }
    const top = (size.width < 700 ? 296 : 116) + prev.h;
    const half = prev.w / 2 + 12;
    const cx = Math.min(size.width - half, Math.max(half, rawX));
    const cy = Math.min(size.height - 150, Math.max(top, rawY));
    const edge = cx !== rawX || cy !== rawY;
    if (edge !== prev.edge) {
      prev.edge = edge;
      el.dataset.edge = edge ? "true" : "false";
    }
    const x = Math.round(origin.current.left + cx);
    const y = Math.round(origin.current.top + cy);
    if (x !== prev.x || y !== prev.y) {
      prev.x = x;
      prev.y = y;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
  });
  if (!spot) return null;
  return (
    <group ref={ring} position={[spot.x, spot.y + 0.02, spot.z]}>
      <Ring radius={spot.radius} tube={0.06} c="#e8c26e" />
      <Ring radius={spot.radius * 0.72} tube={0.03} c="#e8c26e" />
    </group>
  );
}
