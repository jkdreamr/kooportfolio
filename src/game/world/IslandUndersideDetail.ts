import {
  hash01,
  undersideFalls,
  undersideModel,
  type IsletPlacement,
  type UndersideModel,
  type V3,
} from "../core/islandUnderside";
import { ISLAND_SCREEN_DOWN_GROUND } from "../core/islandView";
import type { WorldId } from "../core/worlds";
import type { TreePlacement } from "./TreeArt";

// Per-world dressing for the hanging rock: original box/cylinder kit pieces,
// batched by shape. Built once per world from the deterministic core model.

export type DetailShape = "block" | "stone" | "column" | "pyramid";
export type DetailPart = {
  p: V3;
  s: V3;
  c: string;
  r?: V3;
  shape: DetailShape;
};
export type Lantern = { p: V3; c: string };
export type UndersideDetail = {
  parts: DetailPart[];
  /** Hanging roots and vines: skipped on low quality. */
  fine: DetailPart[];
  lanterns: Lantern[];
  trees: TreePlacement[];
  wheel: { p: V3; normal: readonly [number, number]; radius: number } | null;
};

const facing = (model: UndersideModel, [x, , z]: V3) => {
  const dx = x - model.apex[0],
    dz = z - model.apex[2];
  return (
    (dx * ISLAND_SCREEN_DOWN_GROUND[0] + dz * ISLAND_SCREEN_DOWN_GROUND[2]) /
    (Math.hypot(dx, dz) || 1)
  );
};
const outward = (model: UndersideModel, [x, , z]: V3): [number, number] => {
  const dx = x - model.apex[0],
    dz = z - model.apex[2];
  const length = Math.hypot(dx, dz) || 1;
  return [dx / length, dz / length];
};

/** A box spanning two points (thickness w × d), for beams, rails and ropes. */
function span(
  parts: DetailPart[],
  a: V3,
  b: V3,
  w: number,
  d: number,
  c: string,
) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  parts.push({
    p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    s: [w, d, length],
    // Yaw to the horizontal heading, then pitch the box's +Z onto the span.
    r: [-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0],
    c,
    shape: "block",
  });
}

function ladder(parts: DetailPart[], top: V3, bottom: V3, side: [number, number]) {
  const wood = "#88745b",
    rung = "#a58a66";
  for (const k of [-0.42, 0.42])
    span(
      parts,
      [top[0] + side[0] * k, top[1], top[2] + side[1] * k],
      [bottom[0] + side[0] * k, bottom[1], bottom[2] + side[1] * k],
      0.13,
      0.13,
      wood,
    );
  const length = Math.hypot(top[0] - bottom[0], top[1] - bottom[1], top[2] - bottom[2]);
  for (let s = 0.45; s < length - 0.2; s += 0.62) {
    const t = s / length;
    const p: V3 = [
      top[0] + (bottom[0] - top[0]) * t,
      top[1] + (bottom[1] - top[1]) * t,
      top[2] + (bottom[2] - top[2]) * t,
    ];
    span(
      parts,
      [p[0] - side[0] * 0.42, p[1], p[2] - side[1] * 0.42],
      [p[0] + side[0] * 0.42, p[1], p[2] + side[1] * 0.42],
      0.09,
      0.07,
      rung,
    );
  }
}

/** Ring vertex whose direction from the axis best matches a world point. */
function ringVertexToward(model: UndersideModel, k: number, x: number, z: number) {
  const ring = model.rings[k].points;
  const target = Math.atan2(z - model.apex[2], x - model.apex[0]);
  let best = ring[0],
    bestDelta = Infinity;
  for (const point of ring) {
    const angle = Math.atan2(point[2] - model.apex[2], point[0] - model.apex[0]);
    const delta = Math.abs(Math.atan2(Math.sin(angle - target), Math.cos(angle - target)));
    if (delta < bestDelta) {
      best = point;
      bestDelta = delta;
    }
  }
  return best;
}

/** Furthest rock along a horizontal direction from a point, between two heights. */
function reachAlong(
  model: UndersideModel,
  from: V3,
  normal: readonly [number, number],
  low: number,
  high: number,
) {
  let reach = 0;
  for (const ring of model.rings)
    for (const [x, y, z] of ring.points) {
      if (y < low || y > high) continue;
      const along = (x - from[0]) * -normal[1] + (z - from[2]) * normal[0];
      if (Math.abs(along) < 2.5)
        reach = Math.max(reach, (x - from[0]) * normal[0] + (z - from[2]) * normal[1]);
    }
  return reach;
}

/** Roots dangling from undercut ledges the camera can see. */
function roots(model: UndersideModel, fine: DetailPart[], every: number, colors: readonly string[]) {
  const { profile } = model.spec;
  for (let k = 2; k + 1 < model.rings.length; k++) {
    if (profile[k + 1].t - profile[k].t >= 0.02 || profile[k].t > 0.75) continue;
    model.rings[k].points.forEach((point, i) => {
      if (i % every || facing(model, point) < 0.15) return;
      const h = hash01(model.spec.seed, k, i, 90);
      if (h < 0.35) return;
      const [nx, nz] = outward(model, point);
      const length = 1.4 + h * 4.2;
      fine.push({
        p: [point[0] - nx * 0.3, point[1] - length / 2, point[2] - nz * 0.3],
        s: [0.13 + h * 0.08, length, 0.13 + h * 0.08],
        r: [Math.PI + (h - 0.5) * 0.2, 0, (h - 0.6) * 0.25],
        c: colors[i % colors.length],
        shape: "column",
      });
    });
  }
}

/** Ledge boulders on the up-facing lip just below the ground slab. */
function lipBoulders(model: UndersideModel, parts: DetailPart[], every: number, colors: readonly string[], shape: DetailShape) {
  model.rings[1].points.forEach((point, i) => {
    if (i % every || facing(model, point) < -0.2) return;
    const h = hash01(model.spec.seed, i, 91);
    const [nx, nz] = outward(model, point);
    const size = 0.7 + h * 0.9;
    parts.push({
      p: [point[0] - nx * size * 0.6, point[1] + size * 0.25, point[2] - nz * size * 0.6],
      s: [size * 1.3, size * 0.75, size],
      r: [h * 0.6, h * 6.28, 0.2],
      c: colors[i % colors.length],
      shape,
    });
  });
}

function isletTrees(islet: IsletPlacement, trees: TreePlacement[]) {
  islet.trees.forEach((tree, k) =>
    trees.push({
      p: [
        islet.top[0] + tree.at[0] * islet.radius,
        islet.top[1] + 0.05,
        islet.top[2] + tree.at[1] * islet.radius,
      ],
      size: tree.size,
      species: tree.species,
      variant: k,
    }),
  );
}

function homeDetail(model: UndersideModel): UndersideDetail {
  const parts: DetailPart[] = [],
    fine: DetailPart[] = [],
    lanterns: Lantern[] = [],
    trees: TreePlacement[] = [];
  const honey = "#ffc46b";
  roots(model, fine, 3, ["#5b4a36", "#4d3e2e", "#66533c"]);
  // Green vines from the lip, where the turf above spills over the strata.
  model.rings[1].points.forEach((point, i) => {
    if (i % 5 !== 2 || facing(model, point) < 0.1) return;
    const h = hash01(model.spec.seed, i, 92);
    const [nx, nz] = outward(model, point);
    const length = 1.6 + h * 3;
    fine.push({
      p: [point[0] + nx * 0.25, point[1] - length / 2, point[2] + nz * 0.25],
      s: [0.12, length, 0.12],
      r: [Math.PI, 0, 0],
      c: i % 2 ? "#58724a" : "#4f6a43",
      shape: "column",
    });
  });
  lipBoulders(model, parts, 6, ["#9a8062", "#86705a", "#a98d6a"], "stone");
  for (const islet of model.islets) isletTrees(islet, trees);

  // Shed islet: a plank bridge from a ledge under the railway, a tiny
  // allotment shed and three growing rows.
  const shed = model.islets.find((islet) => islet.prop === "shed");
  if (shed) {
    const [cx, cy, cz] = shed.top;
    const anchor = ringVertexToward(model, 0, cx, cz);
    const [nx, nz] = outward(model, anchor);
    const start: V3 = [anchor[0] + nx * 1.35, -0.55, anchor[2] + nz * 1.35];
    const toward = Math.atan2(start[2] - cz, start[0] - cx);
    const end: V3 = [
      cx + Math.cos(toward) * shed.radius * 0.82,
      cy + 0.15,
      cz + Math.sin(toward) * shed.radius * 0.82,
    ];
    const dx = end[0] - start[0],
      dz = end[2] - start[2];
    const length = Math.hypot(dx, dz);
    const side: [number, number] = [-dz / length, dx / length];
    const sag = (t: number) => start[1] + (end[1] - start[1]) * t - Math.sin(Math.PI * t) * 0.7;
    const count = Math.ceil(length / 0.5);
    for (let s = 0; s < count; s++) {
      const t = (s + 0.5) / count;
      parts.push({
        p: [start[0] + dx * t, sag(t), start[2] + dz * t],
        s: [1.25, 0.08, 0.38],
        r: [0, Math.atan2(side[0], side[1]), 0],
        c: s % 3 ? "#9b7f5c" : "#8a6f4f",
        shape: "block",
      });
    }
    for (const k of [-0.62, 0.62]) {
      let previous: V3 | null = null;
      for (let s = 0; s <= 6; s++) {
        const t = s / 6;
        const rope: V3 = [start[0] + dx * t + side[0] * k, sag(t) + 0.75 - Math.sin(Math.PI * t) * 0.15, start[2] + dz * t + side[1] * k];
        if (previous) span(parts, previous, rope, 0.05, 0.05, "#c9b28a");
        previous = rope;
      }
      for (const [p, base] of [
        [start, start[1]],
        [end, end[1]],
      ] as const) {
        parts.push({
          p: [p[0] + side[0] * k, base + 0.4, p[2] + side[1] * k],
          s: [0.14, 1.1, 0.14],
          c: "#7a6248",
          shape: "block",
        });
      }
    }
    lanterns.push({ p: [end[0] + side[0] * 0.62, end[1] + 1.05, end[2] + side[1] * 0.62], c: honey });
    // Shed: plank walls, terracotta gable, door, facing the bridge.
    const sx = cx - Math.cos(toward) * shed.radius * 0.18 - side[0] * 1.1,
      sz = cz - Math.sin(toward) * shed.radius * 0.18 - side[1] * 1.1;
    const yaw = Math.atan2(Math.cos(toward), Math.sin(toward));
    parts.push({ p: [sx, cy + 0.65, sz], s: [1.6, 1.3, 1.3], r: [0, yaw, 0], c: "#b48d5f", shape: "block" });
    for (const k of [-1, 1])
      parts.push({
        p: [sx + side[0] * k * 0.42, cy + 1.5, sz + side[1] * k * 0.42],
        s: [1.0, 0.1, 1.55],
        r: [0, yaw + Math.PI / 2, k * 0.62],
        c: "#a4573b",
        shape: "block",
      });
    parts.push({
      p: [sx + Math.cos(toward) * 0.66, cy + 0.5, sz + Math.sin(toward) * 0.66],
      s: [0.5, 0.9, 0.06],
      r: [0, yaw, 0],
      c: "#5c4632",
      shape: "block",
    });
    lanterns.push({ p: [sx + Math.cos(toward) * 0.7 + side[0] * 0.45, cy + 1.05, sz + Math.sin(toward) * 0.7 + side[1] * 0.45], c: honey });
    for (let row = 0; row < 3; row++) {
      const rx = cx + side[0] * (0.6 + row * 0.55) + Math.cos(toward) * 0.4,
        rz = cz + side[1] * (0.6 + row * 0.55) + Math.sin(toward) * 0.4;
      parts.push({ p: [rx, cy + 0.12, rz], s: [1.7, 0.16, 0.34], r: [0, yaw, 0], c: "#6b4f36", shape: "block" });
      for (let k = -1; k <= 1; k++)
        parts.push({
          p: [rx + Math.sin(toward) * k * 0.5, cy + 0.3, rz - Math.cos(toward) * k * 0.5],
          s: [0.2, 0.18, 0.2],
          c: row % 2 ? "#6d9a4a" : "#7fa857",
          shape: "stone",
        });
    }
  }

  // Scaffold: a timber deck bolted to the strata above the low islet, a ladder
  // down from a bracket under the railway and another down to the islet.
  const low = model.islets.find((islet) => islet.prop === "none");
  if (low) {
    const [lx, ly, lz] = low.top;
    const wall = ringVertexToward(model, 4, lx, lz);
    const normal = outward(model, wall);
    const tangent: [number, number] = [-normal[1], normal[0]];
    const reach = reachAlong(model, wall, normal, wall[1] - 0.5, 0.5) + 0.7;
    const deckY = wall[1] + 0.3;
    const deckOut = Math.max(2.2, reach + 0.6);
    const deck: V3 = [wall[0] + normal[0] * (deckOut / 2 - 0.2), deckY, wall[2] + normal[1] * (deckOut / 2 - 0.2)];
    parts.push({
      p: deck,
      s: [3.2, 0.22, deckOut + 0.4],
      r: [0, Math.atan2(normal[0], normal[1]), 0],
      c: "#9b7f5c",
      shape: "block",
    });
    for (const k of [-1.4, 1.4]) {
      const outer: V3 = [wall[0] + normal[0] * deckOut + tangent[0] * k, deckY, wall[2] + normal[1] * deckOut + tangent[1] * k];
      const brace: V3 = [wall[0] - normal[0] * 0.6 + tangent[0] * k, deckY - 2.6, wall[2] - normal[1] * 0.6 + tangent[1] * k];
      span(parts, outer, brace, 0.16, 0.16, "#7a6248");
      parts.push({ p: [outer[0], deckY + 0.6, outer[2]], s: [0.14, 1.2, 0.14], c: "#7a6248", shape: "block" });
      lanterns.push({ p: [outer[0], deckY + 1.15, outer[2]], c: honey });
    }
    span(
      parts,
      [wall[0] + normal[0] * deckOut + tangent[0] * 1.4, deckY + 1.1, wall[2] + normal[1] * deckOut + tangent[1] * 1.4],
      [wall[0] + normal[0] * deckOut - tangent[0] * 1.4, deckY + 1.1, wall[2] + normal[1] * deckOut - tangent[1] * 1.4],
      0.1,
      0.1,
      "#7a6248",
    );
    // Upper ladder: hung clear of every ledge between the rail and the deck.
    const top = ringVertexToward(model, 0, lx, lz);
    const upperReach = reachAlong(model, top, normal, deckY, 0.5) + 0.8;
    const ladderOut = Math.min(deckOut - 0.3, Math.max(upperReach, 1.6));
    const upper: V3 = [top[0] + normal[0] * ladderOut + tangent[0] * 0.8, -0.35, top[2] + normal[1] * ladderOut + tangent[1] * 0.8];
    span(parts, [top[0] + normal[0] * 0.6, -0.35, top[2] + normal[1] * 0.6], upper, 0.18, 0.18, "#7a6248");
    ladder(parts, upper, [upper[0], deckY + 0.11, upper[2]], tangent);
    lanterns.push({ p: [upper[0] + tangent[0] * 0.7, -0.75, upper[2] + tangent[1] * 0.7], c: honey });
    // Lower ladder: from the deck's outer edge down onto the islet.
    const deckEdge: V3 = [wall[0] + normal[0] * (deckOut - 0.1) - tangent[0] * 0.6, deckY, wall[2] + normal[1] * (deckOut - 0.1) - tangent[1] * 0.6];
    const toward = Math.atan2(deckEdge[2] - lz, deckEdge[0] - lx);
    const foot: V3 = [lx + Math.cos(toward) * low.radius * 0.55, ly + 0.15, lz + Math.sin(toward) * low.radius * 0.55];
    const dx = foot[0] - deckEdge[0],
      dz = foot[2] - deckEdge[2];
    const across: [number, number] = [-dz / (Math.hypot(dx, dz) || 1), dx / (Math.hypot(dx, dz) || 1)];
    ladder(parts, deckEdge, foot, across);
  }

  // Waterfalls: a timber chute feeds the middle fall; a wheel turns beside another.
  const falls = undersideFalls("home");
  const chute = falls.springs[1];
  if (chute) {
    const [px, py, pz] = chute.point;
    const [nx, nz] = chute.normal;
    const yaw = Math.atan2(nx, nz);
    const base: V3 = [px - nx * 0.7, py + 0.18, pz - nz * 0.7];
    parts.push({ p: base, s: [chute.width * 0.75, 0.1, 2.0], r: [0.12, yaw, 0], c: "#8a6f4f", shape: "block" });
    for (const k of [-1, 1])
      parts.push({
        p: [base[0] + chute.tangent[0] * k * chute.width * 0.38, base[1] + 0.2, base[2] + chute.tangent[1] * k * chute.width * 0.38],
        s: [0.1, 0.42, 2.0],
        r: [0.12, yaw, 0],
        c: "#7a6248",
        shape: "block",
      });
    parts.push({ p: [base[0], base[1] - 0.7, base[2]], s: [0.16, 1.3, 0.16], c: "#7a6248", shape: "block" });
  }
  const turning = falls.springs[0];
  let wheel: UndersideDetail["wheel"] = null;
  if (turning) {
    const radius = 2.3;
    const [px, py, pz] = turning.point;
    const along = turning.width / 2 + radius - 0.35;
    const y = py - 2.8;
    const from: V3 = [px + turning.tangent[0] * along, y, pz + turning.tangent[1] * along];
    const out = reachAlong(model, from, turning.normal, y - radius, y + radius) + 0.5;
    const center: V3 = [from[0] + turning.normal[0] * out, y, from[2] + turning.normal[1] * out];
    wheel = { p: center, normal: turning.normal, radius };
    span(
      parts,
      [from[0] - turning.normal[0] * 0.4, y, from[2] - turning.normal[1] * 0.4],
      center,
      0.18,
      0.18,
      "#5f4b37",
    );
  }
  return { parts, fine, lanterns, trees, wheel };
}

function koreaDetail(model: UndersideModel): UndersideDetail {
  const parts: DetailPart[] = [],
    fine: DetailPart[] = [],
    lanterns: Lantern[] = [],
    trees: TreePlacement[] = [];
  const granite = ["#c9c7ba", "#b4b6aa", "#d6d3c5"];
  lipBoulders(model, parts, 5, granite, "stone");
  // Red pines clinging to the granite lip below the slab.
  model.rings[1].points.forEach((point, i) => {
    if (i % 7 !== 3 || facing(model, point) < 0.05) return;
    const h = hash01(model.spec.seed, i, 93);
    if (h < 0.25) return;
    const [nx, nz] = outward(model, point);
    trees.push({
      p: [point[0] + nx * 0.2, point[1] + 0.05, point[2] + nz * 0.2],
      size: 0.42 + h * 0.25,
      species: "pine",
      variant: i,
    });
  });
  for (const islet of model.islets) isletTrees(islet, trees);
  // A few pale roots of pine clinging into the cleavage.
  roots(model, fine, 9, ["#7a5a45", "#6b4e3c"]);

  const pavilion = model.islets.find((islet) => islet.prop === "jeongja");
  if (pavilion) {
    const [cx, cy, cz] = pavilion.top;
    const k = 1.3;
    const red = "#a8392b",
      green = "#2f7a62",
      tile = "#3b4246";
    const add = (
      x: number,
      y: number,
      z: number,
      s: V3,
      c: string,
      shape: DetailShape,
      r?: V3,
    ) =>
      parts.push({
        p: [cx + x * k, cy + y * k, cz + z * k],
        s: [s[0] * k, s[1] * k, s[2] * k],
        c,
        shape,
        r,
      });
    add(0, 0.25, 0, [3.6, 0.5, 3.6], "#bdb9ab", "block");
    add(0, 0.06, 2.0, [1.2, 0.2, 0.6], "#b0ad9f", "block");
    for (const x of [-1.25, 1.25])
      for (const z of [-1.25, 1.25]) add(x, 1.35, z, [0.16, 1.7, 0.16], red, "column");
    // Dancheong: a green beam band with a red under-trim, then the dark eaves.
    add(0, 2.32, 0, [2.85, 0.26, 2.85], green, "block");
    add(0, 2.15, 0, [2.7, 0.1, 2.7], "#c0473a", "block");
    add(0, 2.55, 0, [4.1, 0.16, 4.1], tile, "block");
    add(0, 3.3, 0, [2.75, 1.45, 2.75], tile, "pyramid");
    add(0, 4.08, 0, [0.14, 0.32, 0.14], "#c9a54e", "column");
    // Upswept corner eaves.
    for (const [x, z] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const)
      add(x * 2.05, 2.72, z * 2.05, [0.24, 0.14, 0.95], tile, "block", [-0.55, Math.atan2(x, z), 0]);
    const colors = ["#d8483c", "#3f9a6c", "#3f6ec2", "#d8483c"];
    [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ].forEach(([x, z], n) =>
      lanterns.push({ p: [cx + x * 1.6 * k, cy + 1.95 * k, cz + z * 1.6 * k], c: colors[n] }),
    );
  }
  const cairnIslet = model.islets.find((islet) => islet.prop === "cairns");
  if (cairnIslet) {
    const [cx, cy, cz] = cairnIslet.top;
    [
      [-1.4, 0.6],
      [0.9, -0.9],
      [1.3, 1.2],
    ].forEach(([x, z], stack) => {
      let y = cy;
      const sizes = stack === 0 ? [0.85, 0.66, 0.5, 0.34] : [0.7, 0.52, 0.36];
      sizes.forEach((size, k) => {
        parts.push({
          p: [cx + x, y + size * 0.42, cz + z],
          s: [size, size * 0.55, size * 0.9],
          r: [0, (stack + k) * 1.3, 0],
          c: granite[(stack + k) % 3],
          shape: "stone",
        });
        y += size * 0.78;
      });
    });
    // A small dolmen: two uprights under a heavy capstone.
    for (const k of [-0.55, 0.55])
      parts.push({ p: [cx - 0.3 + k, cy + 0.55, cz - 1.6], s: [0.32, 1.1, 0.5], c: "#a9aa9e", shape: "block" });
    parts.push({ p: [cx - 0.3, cy + 1.2, cz - 1.6], s: [1.8, 0.3, 1.0], r: [0.05, 0.2, 0.04], c: "#b9b8ab", shape: "block" });
    lanterns.push({ p: [cx + 0.9, cy + 0.35, cz + 0.2], c: "#3f6ec2" });
    lanterns.push({ p: [cx - 0.6, cy + 0.35, cz + 1.4], c: "#d8483c" });
  }
  return { parts, fine, lanterns, trees, wheel: null };
}

function stanfordDetail(model: UndersideModel): UndersideDetail {
  const parts: DetailPart[] = [],
    fine: DetailPart[] = [],
    lanterns: Lantern[] = [],
    trees: TreePlacement[] = [];
  const top = model.rings[0].points;
  // Shelf under the viaduct: sandstone boulders and dry grass, clear of piers.
  top.forEach((point, i) => {
    const [nx, nz] = outward(model, point);
    const h = hash01(model.spec.seed, i, 94);
    if (i % 3 === 0 && h > 0.3)
      parts.push({
        p: [point[0] - nx * 0.75, point[1] + 0.18, point[2] - nz * 0.75],
        s: [0.7 + h * 0.4, 0.42, 0.55 + h * 0.3],
        r: [0, h * 6.28, 0],
        c: i % 2 ? "#c7a476" : "#b08a5c",
        shape: "stone",
      });
    else if (i % 3 === 1)
      fine.push({
        p: [point[0] - nx * 0.55, point[1] + 0.22, point[2] - nz * 0.55],
        s: [0.16, 0.44 + h * 0.3, 0.16],
        c: h > 0.5 ? "#c4a052" : "#a98a45",
        shape: "column",
      });
  });
  for (const islet of model.islets) isletTrees(islet, trees);

  // Golden poppies and dry grass on the bare islet.
  const poppy = model.islets.find((islet) => islet.cap === "#c9a65a");
  if (poppy) {
    const [cx, cy, cz] = poppy.top;
    for (let k = 0; k < 22; k++) {
      const a = k * 2.399,
        r = poppy.radius * 0.82 * Math.sqrt((k + 0.5) / 22);
      const flower = k % 3 !== 2;
      parts.push({
        p: [cx + Math.cos(a) * r, cy + (flower ? 0.32 : 0.28), cz + Math.sin(a) * r],
        s: flower ? [0.22, 0.14, 0.22] : [0.14, 0.5, 0.14],
        c: flower ? (k % 4 ? "#ec7a22" : "#f2b534") : "#b08d45",
        shape: flower ? "stone" : "block",
      });
    }
  }
  // A tiny Main Quad arcade: sandstone piers, round-headed openings, red tile.
  const arcade = model.islets.find((islet) => islet.prop === "arcade");
  if (arcade) {
    const [cx, cy, cz] = arcade.top;
    const sand = "#dcc495";
    parts.push({ p: [cx, cy + 0.15, cz], s: [5, 0.3, 2.4], c: "#cdb381", shape: "block" });
    parts.push({ p: [cx, cy + 1.1, cz - 0.75], s: [4.6, 1.9, 0.3], c: "#b8986a", shape: "block" });
    for (let k = 0; k < 4; k++)
      parts.push({ p: [cx - 1.8 + k * 1.2, cy + 0.95, cz + 0.55], s: [0.36, 1.6, 0.36], c: sand, shape: "block" });
    for (let k = 0; k < 3; k++)
      parts.push({
        p: [cx - 1.2 + k * 1.2, cy + 1.62, cz + 0.55],
        s: [0.42, 0.42, 0.34],
        r: [0, 0, Math.PI / 4],
        c: sand,
        shape: "block",
      });
    parts.push({ p: [cx, cy + 1.95, cz + 0.05], s: [4.7, 0.3, 1.5], c: sand, shape: "block" });
    for (const k of [-1, 1])
      parts.push({
        p: [cx, cy + 2.32, cz + 0.05 + k * 0.42],
        s: [4.9, 0.12, 1.0],
        r: [k * 0.5, 0, 0],
        c: "#b4502e",
        shape: "block",
      });
    lanterns.push({ p: [cx - 0.6, cy + 1.25, cz + 0.2], c: "#ffc46b" });
    lanterns.push({ p: [cx + 0.6, cy + 1.25, cz + 0.2], c: "#ffc46b" });
  }
  return { parts, fine, lanterns, trees, wheel: null };
}

const details = new Map<WorldId, UndersideDetail>();
export function undersideDetail(world: WorldId): UndersideDetail {
  let detail = details.get(world);
  if (!detail) {
    const model = undersideModel(world);
    detail =
      world === "home"
        ? homeDetail(model)
        : world === "korea"
          ? koreaDetail(model)
          : stanfordDetail(model);
    details.set(world, detail);
  }
  return detail;
}
