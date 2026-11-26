import * as THREE from "three";
import { sculptedMaterial } from "../Surface";
import type { SceneryPart } from "../WorldSceneryParts";

/**
 * Shared pieces for the Korea sights: the giwa roof (same profile as the
 * Bukchon hanok roofs in KoreaHistoricLandmarks, generalised to hexagonal
 * pavilions and flat stone pagoda caps), a lathe helper and the part list
 * helpers. Everything is vertex-coloured on sculpted materials, so the
 * StaticBatch around each group bakes it into a couple of draws.
 */

export type V3 = [number, number, number];
export const tiled = sculptedMaterial({ vertexColors: true });
export const glazedStone = sculptedMaterial({
  vertexColors: true,
  roughness: 0.5,
});
export const curtainWall = sculptedMaterial({
  vertexColors: true,
  roughness: 0.3,
  metalness: 0.35,
});

export const DANCHEONG = {
  green: "#4f8a76",
  jade: "#78a58d",
  red: "#a3432f",
  blue: "#3e6a8c",
  ochre: "#c69a55",
  column: "#97412f",
  tile: "#414947",
  timber: "#624236",
  granite: "#bcb29e",
  paper: "#e6dcc4",
};

type RoofOptions = {
  /** Unit-square or unit-circle corners (x, z), counter-clockwise. */
  corners: readonly (readonly [number, number])[];
  /** Rows from eave to ridge: [x shrink, height, z shrink]. */
  profile: readonly (readonly [number, number, number])[];
  color: string;
  /** Tile ridges across the slope (0 for a smooth stone cap). */
  relief?: number;
  /** Upturned eave corners (cheoma). */
  lift?: number;
  tilesPerSide?: number;
};

/** A curved hip roof whose eave corners sweep up, like the hanok giwa. */
export function roofGeometry({
  corners,
  profile,
  color,
  relief = 0.052,
  lift = 0.21,
  tilesPerSide = 16,
}: RoofOptions) {
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const base = new THREE.Color(color);
  for (let side = 0; side < corners.length; side++) {
    const [ax, az] = corners[side];
    const [bx, bz] = corners[(side + 1) % corners.length];
    const long = Math.hypot(bx - ax, bz - az) > 1.5;
    const intervals = (long ? tilesPerSide * 2 : tilesPerSide) * 4;
    const start = positions.length / 3;
    profile.forEach(([w, y, d], row) => {
      for (let step = 0; step <= intervals; step++) {
        const t = step / intervals;
        const cornerLift = lift * Math.abs(2 * t - 1) ** 5 * (1 - y);
        const across = Math.sin((step * Math.PI) / 4) ** 2;
        const bump = relief * across * (1 - y);
        positions.push(
          THREE.MathUtils.lerp(ax, bx, t) * w * 0.5,
          y + cornerLift + bump,
          THREE.MathUtils.lerp(az, bz, t) * d * 0.5,
        );
        const light =
          0.8 + (relief > 0 ? across * 0.27 : 0.12 * y) + (row % 2) * 0.035;
        colors.push(base.r * light, base.g * light, base.b * light);
        if (row === 0 || step === intervals) continue;
        const below = start + (row - 1) * (intervals + 1) + step;
        const above = below + intervals + 1;
        indices.push(below, below + 1, above, below + 1, above + 1, above);
      }
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const square = [
  [-1, -1],
  [-1, 1],
  [1, 1],
  [1, -1],
] as const;
/** Hanok hip-and-gable roof: the ridge runs along local x. */
export const giwaRoof = roofGeometry({
  corners: square,
  profile: [
    [1, 0, 1],
    [0.93, 0.15, 0.72],
    [0.84, 0.36, 0.45],
    [0.77, 0.64, 0.23],
    [0.72, 1, 0.018],
  ],
  color: DANCHEONG.tile,
  tilesPerSide: 12,
});
/** Pyramidal six-sided pavilion roof (Hyangwonjeong). */
export const hexRoof = roofGeometry({
  corners: Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    return [Math.cos(a), -Math.sin(a)] as const;
  }),
  profile: [
    [1, 0, 1],
    [0.8, 0.22, 0.8],
    [0.56, 0.5, 0.56],
    [0.3, 0.8, 0.3],
    [0.06, 1, 0.06],
  ],
  color: DANCHEONG.tile,
  tilesPerSide: 6,
  lift: 0.3,
});
/** Thin granite roof stone of a Silla pagoda, gently lifted at the corners. */
export const stoneCap = roofGeometry({
  corners: square,
  profile: [
    [1, 0, 1],
    [0.9, 0.2, 0.9],
    [0.66, 0.55, 0.66],
    [0.55, 1, 0.55],
  ],
  color: "#bab1a0",
  relief: 0,
  lift: 0.18,
  tilesPerSide: 2,
});

export type Roof = { p: V3; s: V3; rotY?: number; geometry: THREE.BufferGeometry };

/** Part-list helpers (SceneryPart shapes: stone = chamfered block). */
export function makeParts() {
  const parts: SceneryPart[] = [];
  const roofs: Roof[] = [];
  const add = (
    p: V3,
    s: V3,
    c: string,
    shape: SceneryPart["shape"] = "stone",
    r?: V3,
  ) => parts.push({ p, s, c, shape, r });
  /** A hanok roof plus its ridge cap (ridge along x unless rotated). */
  const roof = (p: V3, s: V3, rotY = 0) => {
    roofs.push({ p, s, rotY, geometry: giwaRoof });
    const ridge: V3 = rotY ? [0.16, 0.13, s[2] * 0.73] : [s[0] * 0.73, 0.13, 0.16];
    const len = rotY ? [s[2], s[0]] : [s[0], s[2]];
    add([p[0], p[1] + s[1], p[2]], ridge, DANCHEONG.tile, "block");
    // Raised ridge ends (chimi-like stubs) read well from the high camera.
    for (const side of [-1, 1]) {
      const off = side * len[0] * 0.36;
      add(
        rotY ? [p[0], p[1] + s[1] + 0.12, p[2] + off] : [p[0] + off, p[1] + s[1] + 0.12, p[2]],
        [0.2, 0.22, 0.2],
        "#3a403f",
      );
    }
  };
  return { parts, roofs, add, roof };
}

/** Bracket band (gongpo) under an eave: alternating dancheong blocks around a
 * w x d rectangle at height y. */
export function bracketBand(
  add: ReturnType<typeof makeParts>["add"],
  cx: number,
  y: number,
  cz: number,
  w: number,
  d: number,
  spacing = 0.42,
) {
  add([cx, y, cz], [w + 0.12, 0.16, d + 0.12], DANCHEONG.green, "block");
  add([cx, y - 0.11, cz], [w + 0.02, 0.07, d + 0.02], DANCHEONG.red, "block");
  const ring = (len: number, fixed: number, alongX: boolean) => {
    const n = Math.max(2, Math.round(len / spacing));
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (i / n) * len;
      for (const side of [-1, 1]) {
        const x = alongX ? cx + t : cx + side * (fixed / 2 + 0.07);
        const z = alongX ? cz + side * (fixed / 2 + 0.07) : cz + t;
        add([x, y + 0.13, z], [0.13, 0.13, 0.13], i % 2 ? DANCHEONG.blue : DANCHEONG.ochre, "block");
        add([x, y + 0.24, z], [0.2, 0.08, 0.2], DANCHEONG.jade, "block");
      }
    }
  };
  ring(w, d, true);
  ring(d, w, false);
}

/** Vertex-coloured lathe (for jars, Cheomseongdae, column bases). */
export function lathe(
  profile: readonly (readonly [number, number])[],
  segments: number,
  colorAt: (row: number, y: number) => string,
) {
  const geometry = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const c = new THREE.Color();
  // Lathe vertices run profile-first for each segment.
  for (let i = 0; i < position.count; i++) {
    const row = i % profile.length;
    c.set(colorAt(row, position.getY(i)));
    c.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}
