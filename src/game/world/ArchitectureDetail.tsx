import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { sculptedMaterial } from "./Surface";

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

function Pieces({
  pieces,
  masonry = false,
}: {
  pieces: Piece[];
  masonry?: boolean;
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
      args={[clay, masonry ? stone : ceramic, pieces.length]}
      castShadow
      receiveShadow
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
        .multiplyScalar(0.79 + ((i * 37) % 17) / 62)
        .getHexString()}`;
    const slope = Math.hypot(width / 2, rise),
      rows = Math.ceil(slope / 0.55),
      pitch = Math.atan2(rise, width / 2);
    for (const side of [-1, 1])
      for (let row = 0; row < rows; row++) {
        const t = (row + 0.5) / rows,
          span = depth * (hip ? 1 - 0.44 * t : 1),
          cols = Math.max(1, Math.ceil(span / 0.62));
        for (let col = 0; col < cols; col++)
          out.push({
            p: [
              ((side * width) / 2) * (1 - t),
              y + rise * t + 0.07,
              -span / 2 + ((col + 0.5) * span) / cols,
            ],
            s: [(slope / rows) * 1.14, 0.17, (span / cols) * 0.97],
            r: [0, 0, -side * pitch],
            c: shade(out.length),
          });
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
      colors = ["#9c927c", "#b3a68c", "#c2b79a", "#a99c82"];
    for (let row = 0; row < 2; row++)
      for (const side of [-1, 1]) {
        const n = Math.ceil(width / 0.8);
        for (let i = 0; i < n; i++) {
          const x = -width / 2 + ((i + 0.5) * width) / n;
          if (side === 1 && Math.abs(x) < 0.85) continue;
          out.push({
            p: [x + (row ? 0.07 : -0.02), 0.3 + row * 0.31, (side * depth) / 2],
            s: [width / n - 0.035, 0.29, 0.3],
            c: colors[(i + row * 2) % 4],
          });
        }
        const m = Math.ceil(depth / 0.8);
        for (let i = 0; i < m; i++)
          out.push({
            p: [
              (side * width) / 2,
              0.3 + row * 0.31,
              -depth / 2 + ((i + 0.5) * depth) / m,
            ],
            s: [0.3, 0.29, depth / m - 0.035],
            c: colors[(i + row + 1) % 4],
          });
      }
    return out;
  }, [width, depth]);
  return <Pieces pieces={pieces} masonry />;
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
  return (
    <group>
      <mesh position={[0, y, 0]} geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.82} />
      </mesh>
      <RoofShingles {...{ width, depth, y, rise, color }} hip={false} />
    </group>
  );
}
