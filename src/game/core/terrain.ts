import type { WorldId } from "./worlds";
import {
  HOME_ISLAND,
  HOME_LOBES,
  HOME_RAIL_LOBES,
  HOME_RAIL_RADII,
} from "./homeIsland";
import { HOME_GARDEN_GROUNDS } from "./homeGardens";
import { KOREA_COAST, KOREA_SHORE } from "./koreaDistrict";
import {
  STANFORD_COAST,
  STANFORD_MESA,
  STANFORD_SHORE,
} from "../../shared/stanford-ground";
import { STANFORD_RAIL_POINTS } from "../../shared/stanford-transport";
import {
  ccwLoop,
  distanceToPolygon,
  hash01,
  insidePolygon,
  lobeScale,
  loopBounds,
  loopCentroid,
  loopNormals,
  offsetLoop,
  rayToPolygon,
  resampleLoop,
  scaleLoop,
  type P2,
} from "./coast";

// Relief the player looks at but never stands on. Movement, click-to-move and
// every character assume flat ground at y = 0, so each feature here lies on
// land that canWalk already refuses: headlands beyond Home's walking ellipse,
// the aprons outside Korea's and Stanford's shores, and lowered shelves in the
// coves between Home's lawn and its railway. tests/coast.test.ts holds the
// invariant: canWalk(x, z) implies terrainHeightAt(x, z) === 0.

export type TerrainKind = "terrace" | "knoll" | "outcrop" | "shelf";
export type TerrainTier = {
  /** Outline scale about the feature's focus. Descending from 1. */
  scale: number;
  /** World height of this step's top surface. */
  y: number;
};
export type TerrainTree = {
  species: "oak" | "pine" | "redwood" | "palm";
  size: number;
  /** World position; y is the surface the trunk stands on. */
  p: readonly [number, number, number];
};
export type TerrainFeature = {
  id: string;
  kind: TerrainKind;
  /** Counter-clockwise footprint of the lowest tier, in (x, z). */
  outline: readonly P2[];
  /** Bounding circle of the footprint. */
  centre: P2;
  radius: number;
  /** Higher tiers shrink toward this point. */
  focus: P2;
  /** Foot of the lowest wall: buried, so no seam shows at the ground. */
  baseY: number;
  /** Top of the highest tier (negative for a lowered shelf). */
  height: number;
  /** Ascending steps. Terraces and shelves are flat-topped with upright
   * walls; knolls and outcrops slope from each ring to the next. */
  tiers: readonly TerrainTier[];
  /** Top-surface and wall colours. */
  cap: string;
  rock: string;
  trees: readonly TerrainTree[];
  seed: number;
};

const TAU = Math.PI * 2;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

function finish(
  feature: Omit<TerrainFeature, "centre" | "radius" | "height" | "trees"> & {
    trees?: readonly TerrainTree[];
  },
): TerrainFeature {
  const { minX, maxX, minZ, maxZ } = loopBounds(feature.outline);
  const centre: P2 = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  const top = feature.tiers[feature.tiers.length - 1].y;
  return {
    ...feature,
    centre,
    radius: Math.max(
      ...feature.outline.map(([x, z]) =>
        Math.hypot(x - centre[0], z - centre[1]),
      ),
    ),
    height: top,
    trees: feature.trees ?? [],
  };
}

/** Scaled tier outlines, built once per feature: terrainHeightAt runs every
 * frame for the player, villagers and blobs, so it must not allocate. */
const tierLoops = new WeakMap<TerrainFeature, (readonly P2[])[]>();
/** The scaled outline of one tier (cached; do not mutate). */
export function terrainTierLoop(feature: TerrainFeature, tier: number): readonly P2[] {
  let loops = tierLoops.get(feature);
  if (!loops) tierLoops.set(feature, (loops = []));
  return (loops[tier] ??= scaleLoop(feature.outline, feature.focus, feature.tiers[tier].scale));
}

// ---------------------------------------------------------------- Home

const { centerX, centerZ, radiusX, radiusZ } = HOME_ISLAND;
/** A point on Home's lobed loops: `scale` of the lobes, `shift` world units
 * along the radius (negative is toward the village). */
function homePoint(
  phi: number,
  lobes: typeof HOME_LOBES | null,
  rx: number,
  rz: number,
  shift: number,
): P2 {
  const c = Math.cos(phi),
    s = Math.sin(phi);
  const reach = Math.hypot(rx * c, rz * s);
  const scale = (lobes ? lobeScale(phi, lobes) : 1) + shift / reach;
  return [centerX + scale * rx * c, centerZ + scale * rz * s];
}
const lobeNamed = (name: string) =>
  HOME_LOBES.find((lobe) => lobe.name === name)!;

/** The longest run of sample angles around `at` whose band is thick enough. */
function arcWindow(
  at: number,
  span: number,
  thick: (phi: number) => number,
  least: number,
  keep: (phi: number) => boolean = () => true,
) {
  const step = radians(0.5);
  const ok = (phi: number) => thick(phi) >= least && keep(phi);
  let centre = radians(at);
  // A clipped headland may not include its own crest: start from the nearest.
  for (let k = 0; !ok(centre) && k < span * 2; k++) {
    const side = k % 2 ? 1 : -1;
    const candidate = radians(at) + side * Math.ceil(k / 2 + 0.5) * step;
    if (ok(candidate)) centre = candidate;
  }
  let from = centre,
    to = centre;
  while (centre - from < radians(span) && ok(from - step)) from -= step;
  while (to - centre < radians(span) && ok(to + step)) to += step;
  return { from, to };
}

/** A lens between two radial curves, sampled every `stride` degrees: the
 * outer edge closes onto the inner one at both tips. */
function crescent(
  from: number,
  to: number,
  outer: (phi: number) => P2,
  inner: (phi: number) => P2,
  stride = 2,
): P2[] {
  const count = Math.max(4, Math.round((to - from) / radians(stride)));
  const at = (i: number) => from + ((to - from) * i) / count;
  const lens = (i: number): P2 => {
    const taper = Math.sin((Math.PI * i) / count) ** 0.45;
    const [ox, oz] = outer(at(i)),
      [ix, iz] = inner(at(i));
    return [ix + (ox - ix) * taper, iz + (oz - iz) * taper];
  };
  return [
    ...Array.from({ length: count - 1 }, (_, i) => lens(i + 1)),
    ...Array.from({ length: count + 1 }, (_, i) => inner(at(count - i))),
  ];
}

/** Lawn beyond the walking ellipse on a named headland. `inset` is the grass
 * verge left along the cliff, `buffer` the gap kept from the walking limit. */
function headland(
  name: string,
  inset: number,
  buffer: number,
  keep?: (phi: number) => boolean,
  avoid: readonly (readonly [number, number, number, number])[] = [],
) {
  const lobe = lobeNamed(name);
  const outer = (phi: number) =>
    homePoint(phi, HOME_LOBES, radiusX, radiusZ, -inset);
  // Stand further out wherever a garden's ground pad pokes past the ellipse.
  const inner = (phi: number) => {
    for (let extra = 0; extra < 5; extra += 0.1) {
      const point = homePoint(phi, null, radiusX, radiusZ, buffer + extra);
      if (
        !avoid.some(
          ([x, z, w, d]) =>
            Math.abs(point[0] - x) < w / 2 + 1.2 &&
            Math.abs(point[1] - z) < d / 2 + 1.2,
        )
      )
        return point;
    }
    return homePoint(phi, null, radiusX, radiusZ, buffer + 5);
  };
  const thick = (phi: number) => {
    const [ox, oz] = outer(phi),
      [ix, iz] = inner(phi);
    return (
      Math.hypot(ox - centerX, oz - centerZ) -
      Math.hypot(ix - centerX, iz - centerZ)
    );
  };
  const { from, to } = arcWindow(lobe.at, lobe.width * 2.6, thick, 0.45, keep);
  const middle = (from + to) / 2;
  return {
    outline: crescent(from, to, outer, inner),
    /** A point `across` of the way from the walking side to the cliff. */
    at: (along: number, across: number): P2 => {
      const phi = from + (to - from) * along;
      const [ox, oz] = outer(phi),
        [ix, iz] = inner(phi);
      return [ix + (ox - ix) * across, iz + (oz - iz) * across];
    },
    middle,
  };
}

/** The lowered ground of a cove, between the lawn's cliff and the railway. */
function cove(name: string) {
  const lobe = lobeNamed(name);
  const inner = (phi: number) =>
    homePoint(phi, HOME_LOBES, radiusX, radiusZ, 0.4);
  const outer = (phi: number) =>
    homePoint(
      phi,
      HOME_RAIL_LOBES,
      HOME_RAIL_RADII.radiusX,
      HOME_RAIL_RADII.radiusZ,
      -1.3,
    );
  const thick = (phi: number) => {
    const [ox, oz] = outer(phi),
      [ix, iz] = inner(phi);
    return (
      Math.hypot(ox - centerX, oz - centerZ) -
      Math.hypot(ix - centerX, iz - centerZ)
    );
  };
  const { from, to } = arcWindow(lobe.at, lobe.width * 2.4, thick, 0.9);
  return {
    outline: crescent(from, to, outer, inner),
    at: (along: number, across: number): P2 => {
      const phi = from + (to - from) * along;
      const [ox, oz] = outer(phi),
        [ix, iz] = inner(phi);
      return [ix + (ox - ix) * across, iz + (oz - iz) * across];
    },
  };
}

// The jet taxis south from the apron and lands from the north at wing height:
// nothing may rise beside its line across the east of the island.
const clearOfRunway = (phi: number) => {
  const degrees = (Math.atan2(Math.sin(phi), Math.cos(phi)) * 180) / Math.PI;
  return degrees > -12 && degrees < 22;
};
const tree = (
  species: TerrainTree["species"],
  size: number,
  [x, z]: P2,
  y: number,
): TerrainTree => ({ species, size, p: [x, y, z] });

function homeTerrain(): TerrainFeature[] {
  const bluff = headland("telescope bluff", 0.55, 0.9);
  const garden = headland(
    "garden point",
    0.6,
    0.9,
    undefined,
    HOME_GARDEN_GROUNDS,
  );
  const head = headland("airport spit", 0.6, 0.9, clearOfRunway);
  const grass = "#6c8653";
  const features: TerrainFeature[] = [
    // Three dry-stone plateaus climb to the cliff behind the telescope.
    finish({
      id: "home-telescope-bluff",
      kind: "terrace",
      outline: bluff.outline,
      focus: bluff.at(0.5, 0.86),
      baseY: -0.3,
      tiers: [
        { scale: 1, y: 1.3 },
        { scale: 0.74, y: 2.6 },
        { scale: 0.46, y: 4 },
      ],
      cap: "#718c55",
      rock: "#c2b79c",
      trees: [
        tree("pine", 0.95, bluff.at(0.5, 0.84), 4),
        tree("pine", 0.72, bluff.at(0.36, 0.86), 4),
        tree("pine", 0.8, bluff.at(0.27, 0.72), 2.6),
        tree("pine", 0.86, bluff.at(0.7, 0.76), 2.6),
        tree("pine", 0.6, bluff.at(0.6, 0.7), 2.6),
        tree("pine", 0.66, bluff.at(0.12, 0.55), 1.3),
        tree("pine", 0.6, bluff.at(0.88, 0.55), 1.3),
      ],
      seed: 3,
    }),
    // A rounded knoll with one old oak over the allotments.
    finish({
      id: "home-garden-point",
      kind: "knoll",
      outline: garden.outline,
      focus: garden.at(0.5, 0.6),
      baseY: -0.2,
      tiers: [
        { scale: 1, y: 0.5 },
        { scale: 0.74, y: 1.1 },
        { scale: 0.44, y: 1.6 },
      ],
      cap: "#708a52",
      rock: grass,
      trees: [tree("oak", 0.8, garden.at(0.5, 0.6), 1.6)],
      seed: 5,
    }),
    // A low grassy rise with a boulder crown on the far side of the runway.
    finish({
      id: "home-airport-head",
      kind: "knoll",
      outline: head.outline,
      focus: head.at(0.45, 0.6),
      baseY: -0.2,
      tiers: [
        { scale: 1, y: 0.45 },
        { scale: 0.8, y: 0.85 },
        { scale: 0.56, y: 1.15 },
        { scale: 0.3, y: 1.35 },
      ],
      cap: "#6f8a53",
      rock: grass,
      seed: 7,
    }),
  ];
  // The two low headlands lie under the jet's line: a kerbed wildflower bed
  // marks the end of the walking lawn without rising to wing height.
  for (const [name, seed] of [
    ["north-east spit", 11],
    ["pergola point", 13],
  ] as const) {
    const bed = headland(name, 0.5, 0.9);
    features.push(
      finish({
        id: `home-${name.replace(/ /g, "-")}-meadow`,
        kind: "terrace",
        outline: bed.outline,
        focus: bed.at(0.5, 0.5),
        baseY: -0.2,
        tiers: [{ scale: 1, y: 0.28 }],
        cap: "#7f9650",
        rock: "#b1a78d",
        seed,
      }),
    );
  }
  // Coves: the lawn steps down to grass shelves under the trestle.
  const coves: [string, number, number][] = [
    ["north-east cove", -1.2, -2.6],
    ["north-west cove", -1.1, -2.3],
    ["south-east notch", -1.2, -1.2],
    ["west notch", -1.2, -1.2],
    ["north notch", -1.3, -1.3],
  ];
  coves.forEach(([name, upper, lower], i) => {
    const shelf = cove(name);
    features.push(
      finish({
        id: `home-${name.replace(/ /g, "-")}-shelf`,
        kind: "shelf",
        outline: shelf.outline,
        // The upper step keeps to the foot of the lawn's cliff.
        focus: shelf.at(0.5, 0.04),
        baseY: -4.4,
        tiers:
          upper === lower
            ? [{ scale: 1, y: lower }]
            : [
                { scale: 1, y: lower },
                { scale: 0.66, y: upper },
              ],
        cap: "#5f7b4b",
        rock: "#8a7458",
        seed: 31 + i,
      }),
    );
  });
  return features;
}

// ------------------------------------------------- Korea and Stanford

/** Top of Korea's unwalkable outer apron, a visible step below its streets. */
export const KOREA_APRON_Y = -0.42;
/** Top of Stanford's golden outer verge, a kerb's drop below the campus lawn. */
export const STANFORD_VERGE_Y = -0.34;

/** An irregular faceted footprint that conforms to its band: each vertex stops
 * short of `keepOut` (the walking shore) and of leaving `keepIn` (the coast). */
function fitBlob(
  centre: P2,
  radius: number,
  sides: number,
  seed: number,
  keepOut: readonly P2[],
  outMargin: number,
  keepIn: readonly P2[],
  inMargin: number,
): P2[] {
  return Array.from({ length: sides }, (_, i): P2 => {
    const angle = ((i + hash01(seed, i, 1) * 0.5) / sides) * TAU;
    const direction: P2 = [Math.cos(angle), Math.sin(angle)];
    const reach = Math.max(
      0.3,
      Math.min(
        radius * (0.8 + 0.34 * hash01(seed, i, 2)),
        rayToPolygon(centre, direction, keepOut) - outMargin,
        rayToPolygon(centre, direction, keepIn) - inMargin,
      ),
    );
    return [centre[0] + direction[0] * reach, centre[1] + direction[1] * reach];
  });
}

/** Ascending rings that narrow steadily to a pointed crown. */
const rise = (
  height: number,
  scales: readonly number[],
  lift = 0,
): TerrainTier[] =>
  scales.map((scale, i) => ({
    scale,
    y: lift + (height - lift) * ((i + 1) / scales.length) ** 0.85,
  }));
/** A rounded dome: steep at the foot, nearly level across a broad top. */
const DOME = [1, 0.9, 0.76, 0.58, 0.36] as const;
const dome = (height: number, lift = 0): TerrainTier[] =>
  DOME.map((scale, i) => ({
    scale,
    y:
      lift +
      (height - lift) * Math.sin(((i + 1) / DOME.length) * (Math.PI / 2)),
  }));

function koreaTerrain(): TerrainFeature[] {
  const blob = (centre: P2, radius: number, sides: number, seed: number) =>
    fitBlob(centre, radius, sides, seed, KOREA_SHORE, 0.9, KOREA_COAST, 0.8);
  const granite = "#b7b5aa";
  // Bukhansan-like granite behind Namsan: bare, cleaved, tallest mid-ridge.
  const peaks: [string, P2, number, number, readonly number[]][] = [
    ["west", [-54, -29.6], 4, 7, [1, 0.74, 0.5, 0.28, 0.12]],
    ["baegundae", [-49.2, -35.4], 5.6, 11.5, [1, 0.82, 0.62, 0.42, 0.24, 0.1]],
    ["insubong", [-42.8, -41.8], 5, 9.2, [1, 0.78, 0.56, 0.34, 0.14]],
    ["north", [-35.4, -48.4], 4.4, 7.4, [1, 0.74, 0.48, 0.24, 0.1]],
    ["shoulder", [-24, -50.4], 3.2, 4.4, [1, 0.68, 0.36, 0.14]],
  ];
  const features = peaks.map(([name, centre, radius, height, scales], i) =>
    finish({
      id: `korea-peak-${name}`,
      kind: "outcrop",
      outline: blob(centre, radius, 9, 41 + i),
      focus: [
        centre[0] - 0.5 + hash01(i, 5) * 0.6,
        centre[1] - 0.5 + hash01(i, 6) * 0.6,
      ] as P2,
      baseY: KOREA_APRON_Y - 0.4,
      tiers: rise(height, scales),
      cap: "#c9c7bb",
      rock: granite,
      seed: 41 + i,
    }),
  );
  // One low granite shoulder ties the peaks into a single ridge.
  const diagonal: P2 = [Math.SQRT1_2, -Math.SQRT1_2];
  const outward: P2 = [-Math.SQRT1_2, -Math.SQRT1_2];
  const foot = (t: number): P2 => [
    -56 + diagonal[0] * t + outward[0] * 1.3,
    -17.5 + diagonal[1] * t + outward[1] * 1.3,
  ];
  const ridge: P2[] = [];
  for (let t = 9; t <= 37.5; t += 2.5) {
    const reach = rayToPolygon(foot(t), outward, KOREA_COAST) - 0.9;
    const [x, z] = foot(t);
    ridge.push([x + outward[0] * reach, z + outward[1] * reach]);
  }
  features.unshift(
    finish({
      id: "korea-ridge-shoulder",
      kind: "terrace",
      outline: ccwLoop([foot(37.5), foot(9), ...ridge]),
      focus: [-47, -37.5],
      baseY: KOREA_APRON_Y - 0.4,
      tiers: [
        { scale: 1, y: 0.9 },
        { scale: 0.8, y: 1.9 },
      ],
      cap: "#a9ab9c",
      rock: granite,
      trees: [
        tree("pine", 0.5, [-39.4, -43.2], 1.9),
        tree("pine", 0.44, [-51.6, -30.6], 0.9),
        tree("pine", 0.46, [-45.4, -37], 1.9),
      ],
      seed: 40,
    }),
  );
  // The pine hillside north of the market streets, in three earth steps.
  const north = -30.5;
  const crest: P2[] = [];
  for (let x = 49; x >= -3.5; x -= 2.5) {
    const reach = rayToPolygon([x, north], [0, -1], KOREA_COAST) - 1;
    crest.push([x, north - Math.max(0.6, reach)]);
  }
  const hillside = ccwLoop([[-3.5, north], [49, north], ...crest]);
  const slope = (x: number, across: number): P2 => {
    const reach = rayToPolygon([x, north], [0, -1], KOREA_COAST) - 1;
    return [x, north - reach * across];
  };
  const hillFocus = slope(20, 0.72);
  features.push(
    finish({
      id: "korea-north-hillside",
      kind: "terrace",
      outline: hillside,
      focus: hillFocus,
      baseY: KOREA_APRON_Y - 0.4,
      tiers: [
        { scale: 1, y: 1.2 },
        { scale: 0.8, y: 2.4 },
        { scale: 0.56, y: 3.6 },
      ],
      cap: "#7f906b",
      rock: "#a8a595",
      trees: (
        [
          [20, 0.72, 3.6, 0.72],
          [12, 0.7, 3.6, 0.6],
          [29, 0.7, 3.6, 0.64],
          [2, 0.62, 2.4, 0.56],
          [37.5, 0.6, 2.4, 0.6],
          [-1, 0.5, 1.2, 0.48],
          [45.5, 0.45, 1.2, 0.5],
        ] as const
      ).map(([x, across, y, size]) => tree("pine", size, slope(x, across), y)),
      seed: 53,
    }),
  );
  // Low river-washed rock on the east bank, below every sightline.
  const bank: [P2, number, number][] = [
    [[55.2, -21], 1.9, 1],
    [[57.6, -11.5], 3, 1.5],
    [[58.2, -2.5], 3.1, 1.6],
  ];
  bank.forEach(([centre, radius, height], i) =>
    features.push(
      finish({
        id: `korea-east-bank-${i + 1}`,
        kind: "outcrop",
        outline: blob(centre, radius, 8, 61 + i),
        focus: centre,
        baseY: KOREA_APRON_Y - 0.4,
        tiers: rise(height, [1, 0.66, 0.34], KOREA_APRON_Y),
        cap: "#bdbbae",
        rock: granite,
        seed: 61 + i,
      }),
    ),
  );
  // Loose granite and red pines dress the rest of the apron wherever it is
  // wide enough, clear of the airport's approach and the two falls.
  const normals = loopNormals(KOREA_COAST);
  const placed = features.map(({ centre, radius }) => ({ centre, radius }));
  for (let i = 0; i < KOREA_COAST.length; i += 5) {
    const [cx, cz] = KOREA_COAST[i];
    const band = distanceToPolygon(cx, cz, KOREA_SHORE);
    const centre: P2 = [
      cx - normals[i][0] * band * 0.46,
      cz - normals[i][1] * band * 0.46,
    ];
    const radius =
      Math.min(1.9, band * 0.46 - 1) * (0.72 + 0.28 * hash01(i, 21));
    if (
      radius < 0.8 ||
      (centre[0] > 58 && centre[1] > 6) ||
      (centre[0] > 40 && centre[1] > 56) ||
      Math.hypot(centre[0] + 23, centre[1] - 53.5) < 6 ||
      placed.some(
        (other) =>
          Math.hypot(centre[0] - other.centre[0], centre[1] - other.centre[1]) <
          radius + other.radius + 1.2,
      )
    )
      continue;
    const height = KOREA_APRON_Y + 0.45 + radius * 0.42;
    const pine = hash01(i, 23) > 0.42 && (centre[1] < 20 || centre[0] < -40);
    const feature = finish({
      id: `korea-apron-rock-${i}`,
      kind: "outcrop",
      outline: blob(centre, radius, 7, 100 + i),
      focus: centre,
      baseY: KOREA_APRON_Y - 0.4,
      tiers: rise(height, [1, 0.62, 0.3], KOREA_APRON_Y),
      cap: "#bfbdb0",
      rock: granite,
      trees: pine
        ? [
            tree(
              "pine",
              0.42 + 0.2 * hash01(i, 25),
              [
                centre[0] - normals[i][0] * 0.2,
                centre[1] - normals[i][1] * 0.2,
              ],
              KOREA_APRON_Y,
            ),
          ]
        : [],
      seed: 100 + i,
    });
    features.push(feature);
    placed.push({ centre: feature.centre, radius: feature.radius });
  }
  return features;
}

function stanfordTerrain(): TerrainFeature[] {
  const gold = ["#c9a65a", "#b8914a"] as const;
  // Summer-gold knolls with valley oaks where the lawn's verge is widest.
  const verge: [string, P2, number, number, boolean][] = [
    ["quad-1", [13.6, 0.8], 3.6, 1.6, true],
    ["quad-2", [20.2, 3.2], 2.2, 1, false],
    ["south-east", [72.8, 56], 2.6, 1.2, true],
  ];
  const features = verge.map(([name, centre, radius, height, oak], i) =>
    finish({
      id: `stanford-knoll-${name}`,
      kind: "knoll",
      outline: fitBlob(
        centre,
        radius,
        11,
        71 + i,
        STANFORD_SHORE,
        0.8,
        STANFORD_COAST,
        0.55,
      ),
      focus: centre,
      baseY: STANFORD_VERGE_Y - 0.4,
      tiers: dome(height, STANFORD_VERGE_Y),
      cap: gold[i % 2],
      rock: gold[1],
      trees: oak
        ? [tree("oak", 0.5 + height * 0.1, centre, height * 0.86)]
        : [],
      seed: 71 + i,
    }),
  );
  // The foothills proper stand beyond the viaduct on the rock shelf, on the
  // far side from the overview camera: they rise from the shelf at y = -3.
  const track = offsetLoop(
    resampleLoop(ccwLoop(STANFORD_RAIL_POINTS), 256),
    2.3,
  );
  const range: [string, P2, number, number, number, boolean][] = [
    ["north-1", [-18.5, -18.4], 5.6, 2.6, 81, true],
    ["north-2", [-7.5, -19.6], 6.8, 3.8, 82, false],
    ["north-3", [3.6, -17.8], 5.8, 3, 83, true],
    ["north-4", [12.6, -13.6], 4.2, 1.9, 84, false],
    ["north-west", [-34, -9.6], 4.6, 2.4, 85, true],
    ["west-1", [-39.8, 8.4], 4.8, 2.3, 86, false],
    ["west-2", [-40.2, 17.6], 5.2, 3.1, 87, true],
    ["north-east", [38, -6.4], 4.6, 1.8, 88, true],
  ];
  for (const [name, centre, radius, top, seed, oak] of range) {
    const outline = fitBlob(
      centre,
      radius,
      12,
      seed,
      track,
      0.2,
      STANFORD_MESA,
      1.3,
    );
    const focus = loopCentroid(outline);
    features.push(
      finish({
        id: `stanford-foothill-${name}`,
        kind: "knoll",
        outline,
        focus,
        baseY: -3.3,
        tiers: dome(top, -3),
        cap: gold[seed % 2],
        rock: gold[1],
        trees: oak ? [tree("oak", 0.62, focus, top - 0.25)] : [],
        seed,
      }),
    );
  }
  return features;
}

export const TERRAIN: Record<WorldId, readonly TerrainFeature[]> = {
  home: homeTerrain(),
  korea: koreaTerrain(),
  stanford: stanfordTerrain(),
};

/** Height of the relief's surface at a ground point: 0 on all walkable land,
 * positive on terraces, knolls and outcrops, negative on a lowered shelf.
 * Sloped features report the level of the ring that contains the point. */
export function terrainHeightAt(x: number, z: number, world: WorldId) {
  let height = 0;
  for (const feature of TERRAIN[world]) {
    if (
      Math.hypot(x - feature.centre[0], z - feature.centre[1]) >
        feature.radius ||
      !insidePolygon(x, z, feature.outline)
    )
      continue;
    let level = feature.tiers[0].y;
    for (let tier = 1; tier < feature.tiers.length; tier++) {
      if (!insidePolygon(x, z, terrainTierLoop(feature, tier))) break;
      level = feature.tiers[tier].y;
    }
    if (Math.abs(level) > Math.abs(height)) height = level;
  }
  return height;
}
