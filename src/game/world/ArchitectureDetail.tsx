import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { sculptedMaterial } from "./Surface";
import { glassMaterial } from "./GlossKit";

type Piece = {
  p: [number, number, number];
  s: [number, number, number];
  r?: [number, number, number];
  c: string;
};
const clay = new RoundedBoxGeometry(1, 1, 1, 2, 0.1);
const ceramic = sculptedMaterial({
  roughness: 0.67,
  metalness: 0.02,
});
const stone = sculptedMaterial({ roughness: 0.9 });
const timber = sculptedMaterial({ roughness: 0.85 });

function Pieces({
  pieces,
  masonry = false,
  wood = false,
}: {
  pieces: Piece[];
  masonry?: boolean;
  wood?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const mesh = ref.current,
      object = new THREE.Object3D(),
      color = new THREE.Color();
    pieces.forEach((piece, i) => {
      object.position.set(...piece.p);
      object.scale.set(...piece.s);
      object.rotation.set(...(piece.r ?? [0, 0, 0]));
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      mesh.setColorAt(i, color.set(piece.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [pieces]);
  return (
    <instancedMesh
      ref={ref}
      args={[clay, masonry ? stone : wood ? timber : ceramic, pieces.length]}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}

export type Pane = {
  p: [number, number, number];
  s: [number, number, number];
  r?: [number, number, number];
};
const paneGeometry = new THREE.BoxGeometry();
/** One shared pane glass: sky sheen by day, lit from inside after dusk. */
export const windowGlass = glassMaterial();

/** Clear-coated panes, one draw per window group. They neither cast nor
 * receive shadows: a shadowed pane loses the reflection that makes it glass. */
export function Glazing({ panes }: { panes: Pane[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const object = new THREE.Object3D(),
      mesh = ref.current;
    panes.forEach(({ p, s, r = [0, 0, 0] }, i) => {
      object.position.set(...p);
      object.scale.set(...s);
      object.rotation.set(...r);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [panes]);
  return (
    <instancedMesh
      ref={ref}
      args={[paneGeometry, windowGlass, panes.length]}
      dispose={null}
    />
  );
}

/** Convex "hand-built" roof profile: steep at the eaves, easing toward the
 * ridge (0..1 → 0..1), like a bowed timber rafter under heavy shingles. */
export const roofCurve = (t: number) => 0.5 * t + 0.5 * (1 - (1 - t) * (1 - t));
const roofSlope = (t: number) => 0.5 + (1 - t);
/** Deterministic hash in [0,1). */
const jitter = (i: number, k = 1) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Overlapping, individually shaded clay/timber shingles on a bowed profile,
 * with an eave overhang, per-shingle tilt and tone variance, moss-touched
 * low courses and raised ridge/hip caps. */
export function RoofShingles({
  width,
  depth,
  y,
  rise,
  color,
  hip = true,
}: {
  width: number;
  depth: number;
  y: number;
  rise: number;
  color: string;
  hip?: boolean;
}) {
  const pieces = useMemo(() => {
    const out: Piece[] = [],
      base = new THREE.Color(color),
      moss = new THREE.Color("#7d8a4f");
    const shade = (i: number, t = 0.5) => {
      const c = base
        .clone()
        .multiplyScalar(0.84 + jitter(i, 2) * 0.26)
        .lerp(moss, jitter(i, 5) > 0.93 && t < 0.45 ? 0.28 : 0);
      return `#${c.getHexString()}`;
    };
    const run = width / 2,
      overhang = 0.32;
    const slope = Math.hypot(run, rise) * 1.08,
      rows = Math.ceil(slope / 0.42);
    // Underlay boards keep the bowed roof solid between shingle rows.
    for (const side of [-1, 1])
      for (let row = -1; row < rows; row++) {
        const t0 = Math.max(-overhang / run, row / rows),
          t1 = (row + 1) / rows;
        const t = (t0 + t1) / 2;
        const len = Math.hypot(
          (t1 - t0) * run,
          (roofCurve(t1) - roofCurve(t0)) * rise,
        );
        const pitch = Math.atan2(roofSlope(Math.max(0, t)) * rise, run);
        const span =
          depth * (hip ? 1 - 0.44 * Math.max(0, t) : 1) + (hip ? 0 : 0.5);
        out.push({
          p: [side * run * (1 - t), y + roofCurve(t) * rise - 0.02, 0],
          s: [len * 1.04, 0.1, span],
          r: [0, 0, -side * pitch],
          c: `#${base.clone().multiplyScalar(0.62).getHexString()}`,
        });
      }
    for (const side of [-1, 1])
      for (let row = -1; row < rows; row++) {
        // Row -1 is the eave course hanging past the wall.
        const t = row < 0 ? -overhang / run / 2 : (row + 0.5) / rows,
          tt = Math.max(0, t);
        const span = depth * (hip ? 1 - 0.44 * tt : 1) + (hip ? 0 : 0.5),
          cols = Math.max(1, Math.ceil(span / 0.5));
        const unit = span / cols;
        const pitch = Math.atan2(roofSlope(tt) * rise, run);
        const odd = ((row + 2) % 2) / 2;
        for (let col = 0; col < cols + (odd ? 1 : 0); col++) {
          const start = Math.max(-span / 2, -span / 2 + (col - odd) * unit);
          const end = Math.min(span / 2, -span / 2 + (col + 1 - odd) * unit);
          if (end - start < 0.08) continue;
          const i = out.length;
          out.push({
            p: [
              side * run * (1 - t),
              y + roofCurve(t) * rise + 0.08 + jitter(i, 3) * 0.02,
              (start + end) / 2,
            ],
            s: [(slope / rows) * 1.32, 0.14, (end - start) * 0.94],
            r: [
              (jitter(i, 4) - 0.5) * 0.05,
              (jitter(i, 6) - 0.5) * 0.06,
              -side * (pitch + (jitter(i, 7) - 0.5) * 0.05),
            ],
            c: shade(i, tt),
          });
        }
      }
    if (hip) {
      const endRun = depth * 0.22,
        endSlope = Math.hypot(endRun, rise),
        endRows = Math.ceil(endSlope / 0.42),
        endPitch = (t: number) => Math.atan2(roofSlope(t) * rise, endRun);
      for (const side of [-1, 1])
        for (let row = 0; row < endRows; row++) {
          const t = (row + 0.5) / endRows,
            span = width * (1 - t),
            cols = Math.max(1, Math.ceil(span / 0.5));
          for (let col = 0; col < cols; col++) {
            const i = out.length;
            out.push({
              p: [
                -span / 2 + ((col + 0.5) * span) / cols,
                y + roofCurve(t) * rise + 0.1,
                side * (depth / 2 - endRun * t),
              ],
              s: [(span / cols) * 0.96, 0.15, (endSlope / endRows) * 1.3],
              r: [side * endPitch(t), (jitter(i, 6) - 0.5) * 0.06, 0],
              c: shade(i, t),
            });
          }
        }
      // Raised hip caps follow the bowed seams between the roof planes.
      const caps = 9;
      for (const x of [-1, 1])
        for (const z of [-1, 1])
          for (let i = 0; i < caps; i++) {
            const t0 = i / caps,
              t1 = (i + 1) / caps;
            const a = new THREE.Vector3(
              ((x * width) / 2) * (1 - t0),
              y + roofCurve(t0) * rise + 0.17,
              z * (depth / 2 - endRun * t0),
            );
            const b = new THREE.Vector3(
              ((x * width) / 2) * (1 - t1),
              y + roofCurve(t1) * rise + 0.17,
              z * (depth / 2 - endRun * t1),
            );
            const rotation = new THREE.Euler().setFromQuaternion(
              new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, 1),
                b.clone().sub(a).normalize(),
              ),
            );
            out.push({
              p: [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2],
              s: [0.3, 0.24, a.distanceTo(b) * 1.15],
              r: [rotation.x, rotation.y, rotation.z],
              c: shade(i + 3),
            });
          }
    }
    const ridge = depth * (hip ? 0.56 : 1) + (hip ? 0 : 0.5),
      caps = Math.ceil(ridge / 0.45);
    for (let i = 0; i < caps; i++)
      out.push({
        p: [0, y + rise + 0.16, -ridge / 2 + ((i + 0.5) * ridge) / caps],
        s: [0.46, 0.3, (ridge / caps) * 1.06],
        c: shade(i + 4),
      });
    return out;
  }, [width, depth, y, rise, color, hip]);
  return <Pieces pieces={pieces} />;
}

/** Staggered rounded masonry gives buildings a visible, weight-bearing base. */
export function StoneFooting({
  width,
  depth,
}: {
  width: number;
  depth: number;
}) {
  const pieces = useMemo(() => {
    const out: Piece[] = [],
      colors = ["#9c927c", "#b3a68c", "#bbb094", "#a99c82"];
    // Cut end stones rather than sliding entire rows past building corners.
    const course = (
      start: number,
      end: number,
      fixed: number,
      alongX: boolean,
      row: number,
    ) => {
      if (end <= start) return;
      const n = Math.ceil((end - start) / 0.8);
      const unit = (end - start) / n;
      for (let i = 0; i < n + row; i++) {
        const a = Math.max(start, start + (i - row / 2) * unit);
        const b = Math.min(end, start + (i + 1 - row / 2) * unit);
        const center = (a + b) / 2;
        out.push({
          p: alongX
            ? [center, 0.3 + row * 0.31, fixed]
            : [fixed, 0.3 + row * 0.31, center],
          s: alongX ? [b - a - 0.03, 0.29, 0.34] : [0.34, 0.29, b - a - 0.03],
          c: colors[(i + row * 2) % colors.length],
        });
      }
      if (row === 1)
        out.push({
          p: alongX
            ? [(start + end) / 2, 0.83, fixed]
            : [fixed, 0.83, (start + end) / 2],
          s: alongX ? [end - start, 0.14, 0.43] : [0.43, 0.14, end - start],
          c: "#c9bca0",
        });
    };
    for (let row = 0; row < 2; row++) {
      course(-width / 2, width / 2, -depth / 2, true, row);
      // Leave the front threshold open; the footing never blocks the doorway.
      course(-width / 2, -0.9, depth / 2, true, row);
      course(0.9, width / 2, depth / 2, true, row);
      for (const side of [-1, 1])
        course(
          -depth / 2 + 0.19,
          depth / 2 - 0.19,
          (side * width) / 2,
          false,
          row,
        );
    }
    return out;
  }, [width, depth]);
  return <Pieces pieces={pieces} masonry />;
}

/** Warm interiors behind cool, reflective glazing and the existing timber. */
export function WindowDetail({ width }: { width: number }) {
  const pieces = useMemo(() => {
    const out: Piece[] = [
      { p: [0, 0, 0.015], s: [width + 0.24, 1.22, 0.17], c: "#3c4140" },
      { p: [0, 0.64, 0.12], s: [width + 0.5, 0.18, 0.36], c: "#d6c29b" },
      { p: [0, -0.63, 0.2], s: [width + 0.5, 0.18, 0.5], c: "#ddcca9" },
      { p: [0, -0.76, 0.1], s: [width + 0.24, 0.08, 0.28], c: "#ab9675" },
      { p: [0, 0, 0.21], s: [0.065, 1.07, 0.09], c: "#73573c" },
      { p: [0, 0, 0.21], s: [width, 0.065, 0.09], c: "#73573c" },
    ];
    for (const side of [-1, 1]) {
      out.push(
        {
          p: [side * (width / 2 + 0.08), 0, 0.12],
          s: [0.14, 1.14, 0.32],
          c: "#b9a480",
        },
        {
          p: [side * (width / 2 - 0.025), 0, 0.18],
          s: [0.055, 1.08, 0.1],
          c: "#846443",
        },
        { p: [0, side * 0.51, 0.18], s: [width, 0.06, 0.1], c: "#846443" },
      );
    }
    return out;
  }, [width]);
  const panes = useMemo(() => {
    const out: Pane[] = [];
    for (const side of [-1, 1])
      for (const vertical of [-1, 1])
        out.push({
          p: [(side * width) / 4, vertical * 0.25, 0.12],
          s: [width / 2 - 0.06, 0.44, 0.06],
        });
    return out;
  }, [width]);
  return (
    <>
      <Pieces pieces={pieces} />
      <Glazing panes={panes} />
    </>
  );
}

export function GableRoof({
  width,
  depth,
  y,
  rise,
  color,
}: {
  width: number;
  depth: number;
  y: number;
  rise: number;
  color: string;
}) {
  const geometry = useMemo(() => {
    // Solid gable mass on the same bowed profile as the shingles.
    const w = width / 2,
      shape = new THREE.Shape();
    const steps = 10;
    shape.moveTo(-w, 0);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      shape.lineTo(-w * (1 - t), roofCurve(t) * rise);
    }
    for (let i = steps - 1; i >= 0; i--) {
      const t = i / steps;
      shape.lineTo(w * (1 - t), roofCurve(t) * rise);
    }
    shape.lineTo(-w, 0);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      steps: 1,
    });
    g.translate(0, 0, -depth / 2);
    g.computeVertexNormals();
    return g;
  }, [width, depth, rise]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const fascia = useMemo(() => {
    const out: Piece[] = [];
    for (const side of [-1, 1]) {
      out.push({
        p: [(side * width) / 2, y - 0.035, 0],
        s: [0.24, 0.27, depth + 0.22],
        c: "#735237",
      });
      // Bargeboards follow the bowed gable edge in short timber lengths.
      for (const end of [-1, 1])
        for (let i = 0; i < 6; i++) {
          const t0 = i / 6,
            t1 = (i + 1) / 6;
          const x0 = side * (width / 2) * (1 - t0),
            x1 = side * (width / 2) * (1 - t1);
          const y0 = y + roofCurve(t0) * rise,
            y1 = y + roofCurve(t1) * rise;
          out.push({
            p: [(x0 + x1) / 2, (y0 + y1) / 2 + 0.06, end * (depth / 2 + 0.3)],
            s: [Math.hypot(x1 - x0, y1 - y0) * 1.12, 0.24, 0.2],
            r: [0, 0, Math.atan2(y1 - y0, x1 - x0)],
            c: "#8d6440",
          });
        }
      const brackets = Math.max(2, Math.floor(depth / 1.8));
      for (let i = 0; i < brackets; i++)
        out.push({
          p: [
            side * (width / 2 - 0.08),
            y - 0.24,
            -depth / 2 + ((i + 0.5) * depth) / brackets,
          ],
          s: [0.38, 0.23, 0.2],
          c: "#af8557",
        });
    }
    return out;
  }, [width, depth, y, rise]);
  return (
    <group>
      <mesh position={[0, y, 0]} geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.82} />
      </mesh>
      <Pieces pieces={fascia} wood />
      <RoofShingles {...{ width, depth, y, rise, color }} hip={false} />
    </group>
  );
}
