import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { sculptedMaterial } from "./Surface";

/**
 * Hand-built architecture kit: pure generators that return lists of rounded
 * pieces (plank cladding with per-board variance, riveted round-top doors,
 * porches with stairs, shutters, chimneys, flagstone paths, tubs, barrels,
 * crates, a rowboat…). `KitPieces` draws a list as three instanced meshes
 * (clay box / cylinder / sphere); inside a StaticBatch the whole building
 * then bakes to one draw, so detail costs triangles, not draw calls.
 * All variance is hashed from position, so it is deterministic.
 */

export type V3 = [number, number, number];
export type KitPiece = {
  p: V3;
  s: V3;
  r?: V3;
  c: string;
  shape?: "box" | "cyl" | "sphere";
  rough?: number;
};

const geometries = {
  box: new RoundedBoxGeometry(1, 1, 1, 2, 0.08),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
  sphere: new THREE.SphereGeometry(0.5, 12, 8),
};
for (const g of Object.values(geometries)) g.deleteAttribute("uv");
const materials = {
  wood: sculptedMaterial({ roughness: 0.86 }),
  stone: sculptedMaterial({ roughness: 0.94 }),
  metal: sculptedMaterial({ roughness: 0.45, metalness: 0.55 }),
  paint: sculptedMaterial({ roughness: 0.62 }),
};
export type KitMaterial = keyof typeof materials;

export const hash = (a: number, b = 0, c = 0) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
export const tone = (hex: string, k: number) =>
  `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;

function KitShape({
  pieces,
  shape,
  material,
}: {
  pieces: KitPiece[];
  shape: "box" | "cyl" | "sphere";
  material: KitMaterial;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new THREE.Object3D(),
      c = new THREE.Color();
    pieces.forEach((piece, i) => {
      o.position.set(...piece.p);
      o.scale.set(...piece.s);
      o.rotation.set(...(piece.r ?? [0, 0, 0]));
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.set(piece.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [pieces]);
  if (!pieces.length) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometries[shape], materials[material], pieces.length]}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}

/** Draws kit pieces, grouped by shape. */
export function KitPieces({
  pieces,
  material = "wood",
}: {
  pieces: KitPiece[];
  material?: KitMaterial;
}) {
  const split = useMemo(
    () => ({
      box: pieces.filter((p) => !p.shape || p.shape === "box"),
      cyl: pieces.filter((p) => p.shape === "cyl"),
      sphere: pieces.filter((p) => p.shape === "sphere"),
    }),
    [pieces],
  );
  return (
    <>
      <KitShape pieces={split.box} shape="box" material={material} />
      <KitShape pieces={split.cyl} shape="cyl" material={material} />
      <KitShape pieces={split.sphere} shape="sphere" material={material} />
    </>
  );
}

/* ----------------------------------------------------------- generators */

type Opening = [number, number, number, number]; // u0,u1,v0,v1 in face space

/**
 * Vertical board cladding on a wall face. Face space: u along the wall
 * (centred on `center`), v up from `y0`. `axis` "z" = face looks along +z
 * (or −z with normal −1); "x" = along ±x. Boards split around openings.
 */
export function planks({
  center,
  width,
  y0,
  height,
  axis = "z",
  normal = 1,
  color,
  board = 0.3,
  openings = [],
  thickness = 0.07,
}: {
  center: V3;
  width: number;
  y0: number;
  height: number;
  axis?: "x" | "z";
  normal?: 1 | -1;
  color: string;
  board?: number;
  openings?: Opening[];
  thickness?: number;
}): KitPiece[] {
  const out: KitPiece[] = [];
  const n = Math.max(1, Math.round(width / board));
  const w = width / n;
  for (let i = 0; i < n; i++) {
    const u = -width / 2 + (i + 0.5) * w;
    // Split the board's vertical extent around openings it crosses.
    let spans: [number, number][] = [[0, height]];
    for (const [u0, u1, v0, v1] of openings) {
      if (u + w / 2 <= u0 || u - w / 2 >= u1) continue;
      spans = spans.flatMap(([a, b]) => {
        const res: [number, number][] = [];
        if (v0 > a) res.push([a, Math.min(b, v0)]);
        if (v1 < b) res.push([Math.max(a, v1), b]);
        return res.filter(([x, y]) => y - x > 0.08);
      });
    }
    spans.forEach(([a, b], k) => {
      const h = hash(center[0] + u * 3.1, center[2] + k, i);
      const c = tone(color, 0.82 + h * 0.3);
      const out_ = normal * (thickness / 2 + hash(i, k, 3) * 0.015);
      const lean = (hash(i, 9) - 0.5) * 0.02;
      const v = y0 + (a + b) / 2;
      out.push({
        p:
          axis === "z"
            ? [center[0] + u, v, center[2] + out_]
            : [center[0] + out_, v, center[2] + u],
        s:
          axis === "z"
            ? [w * 0.93, b - a, thickness]
            : [thickness, b - a, w * 0.93],
        r: axis === "z" ? [0, 0, lean] : [lean, 0, 0],
        c,
      });
    });
  }
  return out;
}

/** Corner posts and a top plate / sill beam: the timber frame. */
export function timberFrame({
  width,
  depth,
  y0,
  height,
  color = "#5d4129",
  post = 0.26,
}: {
  width: number;
  depth: number;
  y0: number;
  height: number;
  color?: string;
  post?: number;
}): KitPiece[] {
  const out: KitPiece[] = [];
  for (const x of [-1, 1])
    for (const z of [-1, 1])
      out.push({
        p: [(x * width) / 2, y0 + height / 2, (z * depth) / 2],
        s: [post, height + 0.1, post],
        c: tone(color, 0.92 + hash(x, z) * 0.16),
      });
  for (const z of [-1, 1])
    out.push(
      {
        p: [0, y0 + height, (z * depth) / 2],
        s: [width + 0.2, 0.22, 0.22],
        c: color,
      },
      {
        p: [0, y0 + 0.1, (z * depth) / 2],
        s: [width + 0.1, 0.2, 0.24],
        c: tone(color, 0.85),
      },
    );
  for (const x of [-1, 1])
    out.push({
      p: [(x * width) / 2, y0 + height, 0],
      s: [0.22, 0.22, depth + 0.2],
      c: color,
    });
  return out;
}

/**
 * Round-top riveted door, like a ship's cabin: dark arched frame, painted
 * plank leaf, iron straps with rivets, porthole and ring pull. Faces +z;
 * `p` is the bottom-centre on the wall surface.
 */
export function rivetedDoor({
  p,
  width = 1.15,
  height = 2.1,
  color = "#5f87a8",
  frame = "#4a3424",
  iron = "#3a3f44",
  rotationY = 0,
}: {
  p: V3;
  width?: number;
  height?: number;
  color?: string;
  frame?: string;
  iron?: string;
  rotationY?: number;
}): KitPiece[] {
  const out: KitPiece[] = [];
  const r = width / 2,
    body = height - r;
  const add = (piece: KitPiece) => out.push(piece);
  // Frame: jambs + arch disc behind.
  add({ p: [0, body / 2, 0.04], s: [width + 0.34, body, 0.16], c: frame });
  add({
    p: [0, body, 0.04],
    s: [width + 0.34, 0.16, width + 0.34],
    r: [Math.PI / 2, 0, 0],
    c: frame,
    shape: "cyl",
  });
  // Leaf: vertical boards + arched top.
  const boards = 4;
  for (let i = 0; i < boards; i++) {
    const u = -r + (i + 0.5) * (width / boards);
    add({
      p: [u, body / 2, 0.13],
      s: [(width / boards) * 0.95, body, 0.08],
      c: tone(color, 0.9 + hash(i, p[0], p[2]) * 0.16),
    });
  }
  add({
    p: [0, body, 0.13],
    s: [width, 0.08, width],
    r: [Math.PI / 2, 0, 0],
    c: tone(color, 1.04),
    shape: "cyl",
  });
  // Iron straps with rivets.
  for (const v of [0.35, body - 0.25]) {
    add({
      p: [0, v, 0.19],
      s: [width * 0.98, 0.09, 0.03],
      c: iron,
      rough: 0.4,
    });
    for (let k = 0; k < 5; k++)
      add({
        p: [-r + 0.1 + (k * (width - 0.2)) / 4, v, 0.215],
        s: [0.05, 0.05, 0.035],
        c: "#9aa1a6",
        shape: "sphere",
      });
  }
  // Rivets around the arch.
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * Math.PI;
    add({
      p: [Math.cos(a) * (r - 0.07), body + Math.sin(a) * (r - 0.07), 0.19],
      s: [0.045, 0.045, 0.03],
      c: "#9aa1a6",
      shape: "sphere",
    });
  }
  for (const side of [-1, 1])
    for (let k = 0; k < 4; k++)
      add({
        p: [side * (r - 0.07), 0.2 + (k * (body - 0.3)) / 3, 0.19],
        s: [0.045, 0.045, 0.03],
        c: "#9aa1a6",
        shape: "sphere",
      });
  // Porthole: brass ring + dark glass.
  add({
    p: [0, body + r * 0.15, 0.2],
    s: [0.42, 0.06, 0.42],
    r: [Math.PI / 2, 0, 0],
    c: "#b48a45",
    shape: "cyl",
  });
  add({
    p: [0, body + r * 0.15, 0.225],
    s: [0.3, 0.04, 0.3],
    r: [Math.PI / 2, 0, 0],
    c: "#22323d",
    shape: "cyl",
  });
  // Ring pull.
  add({
    p: [r * 0.6, body * 0.48, 0.23],
    s: [0.09, 0.09, 0.07],
    c: "#c49a4a",
    shape: "sphere",
  });
  // Threshold.
  add({ p: [0, 0.04, 0.2], s: [width + 0.5, 0.1, 0.4], c: "#8a7a64" });
  return transform(out, p, rotationY);
}

/** Two board shutters with a Z brace either side of a window (faces +z). */
export function shutters({
  p,
  width,
  height = 1.15,
  color = "#4f7a6a",
}: {
  p: V3;
  width: number;
  height?: number;
  color?: string;
}): KitPiece[] {
  const out: KitPiece[] = [];
  const sw = Math.max(0.36, width * 0.42);
  for (const side of [-1, 1]) {
    const x = side * (width / 2 + 0.16 + sw / 2);
    for (let i = 0; i < 3; i++)
      out.push({
        p: [x - sw / 3 + (i * sw) / 3, 0, 0.06],
        s: [sw / 3 - 0.02, height, 0.06],
        c: tone(color, 0.9 + hash(i, side, p[0]) * 0.18),
      });
    for (const v of [-height / 2 + 0.15, height / 2 - 0.15])
      out.push({ p: [x, v, 0.11], s: [sw, 0.08, 0.04], c: tone(color, 0.75) });
    out.push({
      p: [x, 0, 0.11],
      s: [0.07, Math.hypot(sw, height - 0.3), 0.04],
      r: [0, 0, side * Math.atan2(sw, height - 0.3)],
      c: tone(color, 0.75),
    });
  }
  return transform(out, p, 0);
}

/** Front porch: plank deck on posts, rail, and stairs down to the ground. */
export function porch({
  p,
  width,
  depth,
  height,
  stairs = 1.3,
  color = "#8a6442",
  rail = true,
}: {
  p: V3;
  width: number;
  depth: number;
  height: number;
  stairs?: number;
  color?: string;
  rail?: boolean;
}): KitPiece[] {
  const out: KitPiece[] = [];
  const n = Math.round(width / 0.32);
  for (let i = 0; i < n; i++)
    out.push({
      p: [-width / 2 + (i + 0.5) * (width / n), height, depth / 2],
      s: [(width / n) * 0.92, 0.09, depth],
      c: tone(color, 0.85 + hash(i, p[0]) * 0.28),
    });
  for (const x of [-1, 1]) {
    out.push({
      p: [(x * (width - 0.2)) / 2, height / 2, depth - 0.12],
      s: [0.18, height + 0.02, 0.18],
      c: tone(color, 0.7),
    });
    if (rail) {
      out.push({
        p: [(x * (width - 0.2)) / 2, height + 0.5, depth - 0.12],
        s: [0.14, 1, 0.14],
        c: tone(color, 0.8),
        shape: "cyl",
      });
      out.push({
        p: [(x * (width - 0.2)) / 2, height + 0.98, depth - 0.12],
        s: [0.18, 0.08, 0.18],
        c: "#c9a46a",
        shape: "cyl",
      });
    }
  }
  out.push({
    p: [0, height - 0.12, depth - 0.1],
    s: [width, 0.16, 0.14],
    c: tone(color, 0.65),
  });
  // Stairs.
  const steps = Math.max(1, Math.round(height / 0.22));
  for (let s = 0; s < steps; s++) {
    const y = height - ((s + 1) * height) / (steps + 0.4);
    out.push({
      p: [0, y, depth + 0.22 + s * 0.3],
      s: [stairs, 0.08, 0.32],
      c: tone(color, 0.88 + hash(s, 7) * 0.2),
    });
  }
  for (const x of [-1, 1])
    out.push({
      p: [
        (x * (stairs + 0.06)) / 2,
        height / 2 - 0.06,
        depth + 0.1 + (steps * 0.3) / 2,
      ],
      s: [0.08, 0.16, Math.hypot(steps * 0.3, height) + 0.1],
      r: [Math.atan2(height, steps * 0.3), 0, 0],
      c: tone(color, 0.62),
    });
  return transform(out, p, 0);
}

/** Rough stone chimney with a cap and a slight hand-laid wobble. */
export function chimney(p: V3, height = 2.2, color = "#8f8578"): KitPiece[] {
  const out: KitPiece[] = [];
  const courses = Math.round(height / 0.3);
  for (let i = 0; i < courses; i++)
    out.push({
      p: [
        (hash(i, p[0]) - 0.5) * 0.04,
        i * 0.3 + 0.15,
        (hash(i, p[2]) - 0.5) * 0.04,
      ],
      s: [0.72 + hash(i, 2) * 0.06, 0.29, 0.72 + hash(i, 3) * 0.06],
      c: tone(color, 0.85 + hash(i, 5) * 0.3),
    });
  out.push({
    p: [0, courses * 0.3 + 0.08, 0],
    s: [0.95, 0.14, 0.95],
    c: tone(color, 0.75),
  });
  out.push({
    p: [0, courses * 0.3 + 0.22, 0],
    s: [0.5, 0.14, 0.5],
    c: "#3b3632",
    shape: "cyl",
  });
  return transform(out, p, 0);
}

/** Irregular flagstones from (x, z0) toward z1 with mossy joints. */
export function flagstones(
  x: number,
  z0: number,
  z1: number,
  y = 0.2,
  width = 1.4,
): KitPiece[] {
  const out: KitPiece[] = [];
  const len = Math.abs(z1 - z0),
    dir = Math.sign(z1 - z0) || 1;
  const rows = Math.max(1, Math.round(len / 0.62));
  for (let r = 0; r < rows; r++) {
    const across = 2 + ((r + Math.round(x)) % 2);
    for (let k = 0; k < across; k++) {
      const h = hash(x + r * 1.7, k, z0);
      const u = -width / 2 + ((k + 0.5) * width) / across + (h - 0.5) * 0.14;
      const z =
        z0 + dir * ((r + 0.5) * (len / rows) + (hash(r, k, 4) - 0.5) * 0.12);
      const w = (width / across) * (0.84 + h * 0.12),
        d = (len / rows) * (0.8 + hash(k, r) * 0.14);
      // Two overlapping slabs at different angles read as one irregular stone.
      for (let j = 0; j < 2; j++)
        out.push({
          p: [x + u + (j ? (h - 0.5) * 0.08 : 0), y + h * 0.012 + j * 0.004, z],
          s: [w * (j ? 0.82 : 1), 0.07, d * (j ? 1.08 : 0.86)],
          r: [0, (h - 0.5) * 0.6 + j * (0.5 + hash(r, k, 11) * 0.5), 0],
          c: tone(j ? "#a69c8b" : "#9c9384", 0.84 + hash(r, k, 9 + j) * 0.26),
        });
    }
  }
  return out;
}

/** Coopered wooden tub with iron hoops; `water` adds a dark surface. */
export function tub(
  p: V3,
  radius = 0.42,
  height = 0.42,
  water = true,
): KitPiece[] {
  const out: KitPiece[] = [];
  const staves = 12;
  for (let i = 0; i < staves; i++) {
    const a = (i / staves) * Math.PI * 2;
    out.push({
      p: [Math.cos(a) * radius, height / 2, Math.sin(a) * radius],
      s: [0.07, height, (2 * Math.PI * radius) / staves + 0.02],
      r: [0, -a, 0],
      c: tone("#9a6b42", 0.82 + hash(i, p[0], p[2]) * 0.3),
    });
  }
  out.push({
    p: [0, 0.05, 0],
    s: [radius * 2, 0.08, radius * 2],
    c: "#6e4a2e",
    shape: "cyl",
  });
  for (const v of [0.1, height - 0.09])
    out.push({
      p: [0, v, 0],
      s: [radius * 2 + 0.07, 0.05, radius * 2 + 0.07],
      c: "#43474a",
      shape: "cyl",
    });
  if (water)
    out.push({
      p: [0, height * 0.78, 0],
      s: [radius * 1.9, 0.02, radius * 1.9],
      c: "#3d6f86",
      shape: "cyl",
    });
  return transform(out, p, 0);
}

/** Bellied barrel built from staves and hoops. */
export function barrel(p: V3, rotationY = 0): KitPiece[] {
  const out: KitPiece[] = [];
  const staves = 10,
    h = 0.9;
  for (let i = 0; i < staves; i++) {
    const a = (i / staves) * Math.PI * 2;
    for (let s = 0; s < 3; s++) {
      const v = (s + 0.5) / 3;
      const bulge = 0.3 + Math.sin(v * Math.PI) * 0.05;
      out.push({
        p: [Math.cos(a) * bulge, v * h, Math.sin(a) * bulge],
        s: [0.06, h / 3 + 0.02, 0.2],
        r: [0, -a, 0],
        c: tone("#8b5e38", 0.84 + hash(i, s, p[0]) * 0.28),
      });
    }
  }
  out.push({
    p: [0, h - 0.02, 0],
    s: [0.6, 0.05, 0.6],
    c: "#6b4729",
    shape: "cyl",
  });
  for (const v of [0.14, h / 2, h - 0.14])
    out.push({
      p: [0, v, 0],
      s: [v === h / 2 ? 0.72 : 0.68, 0.05, v === h / 2 ? 0.72 : 0.68],
      c: "#3e4245",
      shape: "cyl",
    });
  return transform(out, p, rotationY);
}

/** Slatted crate with a frame; optional lid colour for a painted toolbox. */
export function crate(
  p: V3,
  size = 0.6,
  rotationY = 0,
  color = "#a57a4c",
): KitPiece[] {
  const out: KitPiece[] = [];
  const s = size;
  out.push({
    p: [0, s / 2, 0],
    s: [s * 0.92, s * 0.92, s * 0.92],
    c: tone(color, 0.78),
  });
  for (const z of [-1, 1])
    for (let i = 0; i < 3; i++)
      out.push({
        p: [0, s * (0.2 + i * 0.3), (z * s) / 2],
        s: [s, s * 0.22, 0.04],
        c: tone(color, 0.9 + hash(i, z, p[0]) * 0.2),
      });
  for (const x of [-1, 1])
    for (const z of [-1, 1])
      out.push({
        p: [(x * s) / 2, s / 2, (z * s) / 2],
        s: [0.07, s, 0.07],
        c: tone(color, 0.7),
      });
  return transform(out, p, rotationY);
}

/** Beached rowboat: elliptical plank hull, dark interior, thwarts, oars. */
export function rowboat(p: V3, rotationY = 0, color = "#6e3d26"): KitPiece[] {
  const out: KitPiece[] = [];
  const L = 3.1,
    B = 1.25;
  out.push({
    p: [0, 0.2, 0],
    s: [B, 0.52, L],
    c: tone(color, 0.92),
    shape: "sphere",
  });
  out.push({
    p: [0, 0.34, 0],
    s: [B * 0.86, 0.3, L * 0.9],
    c: "#3e2618",
    shape: "sphere",
  });
  // Gunwale rim: short boards around the ellipse.
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2,
      a1 = ((i + 1) / n) * Math.PI * 2;
    const x0 = (Math.cos(a0) * B) / 2,
      z0 = (Math.sin(a0) * L) / 2,
      x1 = (Math.cos(a1) * B) / 2,
      z1 = (Math.sin(a1) * L) / 2;
    out.push({
      p: [(x0 + x1) / 2, 0.47, (z0 + z1) / 2],
      s: [0.08, 0.07, Math.hypot(x1 - x0, z1 - z0) * 1.15],
      r: [0, Math.atan2(x1 - x0, z1 - z0), 0],
      c: tone("#9a6440", 0.9 + hash(i, p[0]) * 0.2),
    });
  }
  // Strake lines on the outside.
  for (const y of [0.3, 0.38])
    for (const side of [-1, 1])
      out.push({
        p: [side * (B / 2 - 0.04), y, 0],
        s: [0.04, 0.035, L * 0.72],
        c: tone(color, 0.7),
      });
  for (const z of [-0.65, 0.4])
    out.push({ p: [0, 0.44, z], s: [B * 0.86, 0.06, 0.24], c: "#a8774a" });
  out.push({
    p: [0.25, 0.5, 0.2],
    s: [0.06, 0.05, 2.2],
    r: [0, 0.12, 0],
    c: "#c4a06a",
  });
  out.push({
    p: [0.32, 0.5, 1.28],
    s: [0.18, 0.03, 0.45],
    r: [0, 0.12, 0],
    c: "#c4a06a",
  });
  return transform(out, p, rotationY);
}

/** Sandstone arcade with round arches and a red-tile shed roof (faces +z). */
export function arcade({
  z,
  columns,
  height = 2.4,
  depth = 1.3,
  stone = "#d9c194",
  tile = "#b4523a",
  y0 = 0.2,
}: {
  z: number;
  columns: number[];
  height?: number;
  depth?: number;
  stone?: string;
  tile?: string;
  y0?: number;
}): KitPiece[] {
  const out: KitPiece[] = [];
  const front = z + depth;
  for (const x of columns) {
    out.push(
      { p: [x, y0 + 0.15, front], s: [0.5, 0.3, 0.5], c: tone(stone, 0.86) },
      {
        p: [x, y0 + height / 2, front],
        s: [0.34, height, 0.34],
        c: stone,
        shape: "cyl",
      },
      {
        p: [x, y0 + height + 0.08, front],
        s: [0.48, 0.16, 0.48],
        c: tone(stone, 0.92),
      },
    );
  }
  for (let i = 0; i < columns.length - 1; i++) {
    const a = columns[i],
      b = columns[i + 1];
    const r = (b - a) / 2 - 0.12,
      cx = (a + b) / 2,
      spring = y0 + height + 0.16;
    const segs = 9;
    for (let k = 0; k < segs; k++) {
      const t0 = (k / segs) * Math.PI,
        t1 = ((k + 1) / segs) * Math.PI;
      const x0 = cx - Math.cos(t0) * r,
        y0a = spring + Math.sin(t0) * r * 0.75,
        x1 = cx - Math.cos(t1) * r,
        y1 = spring + Math.sin(t1) * r * 0.75;
      out.push({
        p: [(x0 + x1) / 2, (y0a + y1) / 2, front],
        s: [Math.hypot(x1 - x0, y1 - y0a) * 1.15, 0.22, 0.4],
        r: [0, 0, Math.atan2(y1 - y0a, x1 - x0)],
        c: tone(stone, 0.95 + hash(i, k) * 0.1),
      });
    }
    // Spandrel wall above the arch.
    out.push({
      p: [cx, spring + r * 0.75 + 0.3, front],
      s: [b - a, 0.45, 0.38],
      c: tone(stone, 1.02),
    });
  }
  const span = columns[columns.length - 1] - columns[0] + 0.8;
  const top =
    y0 + height + 0.16 + ((columns[1] - columns[0]) / 2) * 0.75 + 0.55;
  const cx = (columns[0] + columns[columns.length - 1]) / 2;
  out.push({
    p: [cx, top, z + depth / 2],
    s: [span, 0.12, depth + 0.5],
    c: tone(stone, 0.8),
  });
  // Red barrel-tile shed roof sloping away from the wall.
  const rows = 4;
  for (let rr = 0; rr < rows; rr++) {
    const t = (rr + 0.5) / rows;
    const cols = Math.round(span / 0.32);
    for (let k = 0; k < cols; k++)
      out.push({
        p: [
          cx - span / 2 + (k + 0.5) * (span / cols),
          top + 0.4 - t * 0.38,
          z + 0.1 + t * (depth + 0.4),
        ],
        s: [(span / cols) * 0.8, 0.13, (depth + 0.5) / rows + 0.1],
        r: [0.3, 0, 0],
        c: tone(tile, 0.85 + hash(rr, k, z) * 0.28),
        shape: "cyl",
      });
  }
  return out;
}

/** Lantern post with a hooked arm (lantern glass is drawn by the host). */
export function signPost(p: V3, color = "#5a4330"): KitPiece[] {
  return transform(
    [
      { p: [0, 1.1, 0], s: [0.16, 2.2, 0.16], c: color },
      { p: [0.3, 2.1, 0], s: [0.7, 0.1, 0.1], c: color },
      { p: [0.55, 1.75, 0], s: [0.72, 0.42, 0.08], c: "#d9c49a" },
      { p: [0, 0.08, 0], s: [0.4, 0.16, 0.4], c: "#7d7469" },
    ],
    p,
    0,
  );
}

/** Translate/rotate a piece list into place (about Y). */
export function transform(
  pieces: KitPiece[],
  p: V3,
  rotationY: number,
): KitPiece[] {
  const c = Math.cos(rotationY),
    s = Math.sin(rotationY);
  return pieces.map((piece) => {
    const [x, y, z] = piece.p;
    const r = piece.r ?? [0, 0, 0];
    if (!rotationY) return { ...piece, p: [x + p[0], y + p[1], z + p[2]] };
    const e = new THREE.Euler(r[0], r[1], r[2]);
    const q = new THREE.Quaternion()
      .setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rotationY)
      .multiply(new THREE.Quaternion().setFromEuler(e));
    const out = new THREE.Euler().setFromQuaternion(q);
    return {
      ...piece,
      p: [x * c + z * s + p[0], y + p[1], -x * s + z * c + p[2]],
      r: [out.x, out.y, out.z],
    };
  });
}
