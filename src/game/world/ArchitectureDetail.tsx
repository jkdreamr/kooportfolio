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
    const mesh = ref.current!,
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

export type Pane = { p: [number, number, number]; s: [number, number, number] };
const paneGeometry = new THREE.BoxGeometry();
/** One shared pane glass: sky sheen by day, lit from inside after dusk. */
export const windowGlass = glassMaterial();

/** Clear-coated panes, one draw per window group. They neither cast nor
 * receive shadows: a shadowed pane loses the reflection that makes it glass. */
export function Glazing({ panes }: { panes: Pane[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const object = new THREE.Object3D(),
      mesh = ref.current!;
    panes.forEach(({ p, s }, i) => {
      object.position.set(...p);
      object.scale.set(...s);
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

/** Overlapping, individually shaded clay shingles, rather than a painted plane. */
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
      base = new THREE.Color(color);
    const shade = (i: number) =>
      `#${base
        .clone()
        .multiplyScalar(0.9 + ((i * 37) % 17) / 133)
        .getHexString()}`;
    const slope = Math.hypot(width / 2, rise),
      rows = Math.ceil(slope / 0.55),
      pitch = Math.atan2(rise, width / 2);
    for (const side of [-1, 1])
      for (let row = 0; row < rows; row++) {
        const t = (row + 0.5) / rows,
          span = depth * (hip ? 1 - 0.44 * t : 1),
          cols = Math.max(1, Math.ceil(span / 0.62));
        const unit = span / cols;
        for (let col = 0; col < cols + (row % 2); col++) {
          const start = Math.max(
            -span / 2,
            -span / 2 + (col - (row % 2) / 2) * unit,
          );
          const end = Math.min(
            span / 2,
            -span / 2 + (col + 1 - (row % 2) / 2) * unit,
          );
          out.push({
            p: [
              ((side * width) / 2) * (1 - t),
              y + rise * t + 0.07,
              (start + end) / 2,
            ],
            s: [(slope / rows) * 1.14, 0.17, (end - start) * 0.97],
            r: [0, 0, -side * pitch],
            c: shade(out.length),
          });
        }
      }
    if (hip) {
      const run = depth * 0.22,
        endSlope = Math.hypot(run, rise),
        endRows = Math.ceil(endSlope / 0.55),
        endPitch = Math.atan2(rise, run);
      for (const side of [-1, 1])
        for (let row = 0; row < endRows; row++) {
          const t = (row + 0.5) / endRows,
            span = width * (1 - t),
            cols = Math.max(1, Math.ceil(span / 0.62));
          for (let col = 0; col < cols; col++)
            out.push({
              p: [
                -span / 2 + ((col + 0.5) * span) / cols,
                y + rise * t + 0.09,
                side * (depth / 2 - run * t),
              ],
              s: [(span / cols) * 0.96, 0.18, (endSlope / endRows) * 1.12],
              r: [side * endPitch, 0, 0],
              c: shade(out.length),
            });
        }
      // Raised hip caps close the diagonal seams between the roof planes.
      const hipLength = Math.hypot(width / 2, run, rise);
      const capCount = Math.ceil(hipLength / 0.5);
      for (const x of [-1, 1])
        for (const z of [-1, 1]) {
          const direction = new THREE.Vector3(
            (-x * width) / 2,
            rise,
            -z * run,
          ).normalize();
          const rotation = new THREE.Euler().setFromQuaternion(
            new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 0, 1),
              direction,
            ),
          );
          for (let i = 0; i < capCount; i++) {
            const t = (i + 0.5) / capCount;
            out.push({
              p: [
                ((x * width) / 2) * (1 - t),
                y + rise * t + 0.16,
                z * (depth / 2 - run * t),
              ],
              s: [0.32, 0.25, (hipLength / capCount) * 1.1],
              r: [rotation.x, rotation.y, rotation.z],
              c: shade(i + 3),
            });
          }
        }
    }
    const ridge = depth * (hip ? 0.56 : 1),
      caps = Math.ceil(ridge / 0.55);
    for (let i = 0; i < caps; i++)
      out.push({
        p: [0, y + rise + 0.15, -ridge / 2 + ((i + 0.5) * ridge) / caps],
        s: [0.45, 0.3, (ridge / caps) * 1.08],
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

/** Deep stone reveals and separate glazed panes, batched into one draw call. */
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
    const w = width / 2,
      d = depth / 2;
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [-w, 0, -d, w, 0, -d, 0, rise, -d, -w, 0, d, w, 0, d, 0, rise, d],
        3,
      ),
    );
    g.setIndex([
      0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3,
    ]);
    const solid = g.toNonIndexed();
    g.dispose();
    solid.computeVertexNormals();
    return solid;
  }, [width, depth, rise]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const fascia = useMemo(() => {
    const out: Piece[] = [];
    const slope = Math.hypot(width / 2, rise);
    const pitch = Math.atan2(rise, width / 2);
    for (const side of [-1, 1]) {
      out.push({
        p: [(side * width) / 2, y - 0.035, 0],
        s: [0.24, 0.27, depth + 0.22],
        c: "#735237",
      });
      for (const end of [-1, 1])
        out.push({
          p: [(side * width) / 4, y + rise / 2, end * (depth / 2 + 0.055)],
          s: [slope + 0.15, 0.2, 0.24],
          r: [0, 0, -side * pitch],
          c: "#9b7149",
        });
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
