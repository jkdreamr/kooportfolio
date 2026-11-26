/**
 * Korea "sights": the heritage garden, Sungnyemun, the extra hanok lane and
 * the modern Seoul street furniture. Pure layout data shared by the renderer
 * (world/korea/*), collision (core/world.ts) and the placement test.
 *
 * Every solid is [centre x, centre z, half width, half depth], the same
 * convention as every other obstacle list. Positions were fitted against the
 * walk mask, doors, gates, NPC routes and existing meshes (see
 * tests/koreaSights.test.ts).
 */

type Solid = readonly [number, number, number, number];

export const KOREA_SIGHTS = {
  /** Geunjeongjeon-style throne hall on a two-tier stone terrace, facing south. */
  hall: { x: -24.5, z: 24, width: 9, depth: 6 },
  /** Cheomseongdae observatory (Silla, 7th century). */
  cheomseongdae: { x: -30, z: 30, radius: 1.05 },
  /** Seokgatap-style three-storey stone pagoda. */
  pagoda: { x: -18.6, z: 21.6, size: 2.1 },
  /** Hyangwonjeong-style hexagonal pavilion on an islet in the pond. */
  pavilion: { x: -26, z: 42, radius: 1.25 },
  /** Sungnyemun (Namdaemun): the promenade at z = 12 runs through its arch. */
  sungnyemun: { x: -38, z: 12, width: 3.4, depth: 6.4, tunnel: 1.8 },
  /** Jangseung guardian posts flanking the Bukchon lane's west entrance. */
  jangseung: [
    [-47.3, -16.4],
    [-47.3, -12.4],
  ],
  /** Extra hanoks behind a stone wall, between Bukchon and the exercise yard. */
  hanoks: [
    { x: -44, z: -6.2, width: 4.6, depth: 2.8, facing: 1 },
    { x: -37.6, z: -6.2, width: 4.6, depth: 2.8, facing: 1 },
    { x: -50.3, z: -8, width: 4.6, depth: 3, facing: 0 },
  ],
  /** Dol-dam stone wall behind the new hanoks (x, z, length). */
  laneWall: [-40.8, -8.6, 15.2],
  /** Jangdokdae: a stone stand of onggi jars beside the west hanok. */
  jars: [-50.3, -4.55],
  /** Lotte World Tower-style supertall on the north hillside (unwalkable). */
  lotte: { x: 33.4, z: -33.2, base: 1.45, height: 21 },
  /** Hillside apartment blocks, numbered 101-103. */
  apartments: [
    { x: 6.6, z: -32.9, number: "101" },
    { x: 16, z: -33.6, number: "102" },
    { x: 24.6, z: -33.4, number: "103" },
  ],
  /** Dongdaemun Design Plaza-style curved building in the market court. */
  ddp: { x: 14, z: -6.5, width: 9, depth: 6 },
  store: { x: 13.5, z: 5.9, width: 4, depth: 2.4 },
  storeTables: [
    [12.2, 7.6],
    [14.8, 7.6],
  ],
  pojangmacha: { x: 18.4, z: 5.8, width: 2.8, depth: 2.2 },
  subway: { x: -9.5, z: 7.5, width: 2.2, depth: 3.6 },
  busStops: [
    [25, -12.1],
    [-14, -12.1],
  ],
} as const;

const S = KOREA_SIGHTS;
const box = (x: number, z: number, w: number, d: number): Solid => [
  x,
  z,
  w / 2,
  d / 2,
];
const gate = S.sungnyemun;
const wing = (gate.depth - gate.tunnel) / 2;

/** Non-walkable footprints (collision). The pond pavilion needs none: the
 * pond itself is already solid. */
export const KOREA_SIGHT_SOLIDS: readonly Solid[] = [
  box(S.hall.x, S.hall.z, S.hall.width, S.hall.depth),
  box(
    S.cheomseongdae.x,
    S.cheomseongdae.z,
    S.cheomseongdae.radius * 2.1,
    S.cheomseongdae.radius * 2.1,
  ),
  box(S.pagoda.x, S.pagoda.z, S.pagoda.size, S.pagoda.size),
  // Sungnyemun's two stone wings; the arch between them stays walkable.
  box(gate.x, gate.z - gate.tunnel / 2 - wing / 2, gate.width, wing),
  box(gate.x, gate.z + gate.tunnel / 2 + wing / 2, gate.width, wing),
  ...S.jangseung.map(([x, z]) => box(x, z, 0.6, 0.6)),
  ...S.hanoks.map(({ x, z, width, depth, facing }) =>
    facing ? box(x, z, width, depth) : box(x, z, depth, width),
  ),
  box(S.laneWall[0], S.laneWall[1], S.laneWall[2], 0.36),
  box(S.jars[0], S.jars[1], 1.5, 0.9),
  // The hillside is already unwalkable; these keep the rule explicit.
  box(S.lotte.x, S.lotte.z, S.lotte.base * 2.2, S.lotte.base * 2.2),
  ...S.apartments.map(({ x, z }) => box(x, z, 5.6, 2.2)),
  box(S.ddp.x, S.ddp.z, S.ddp.width, S.ddp.depth),
  box(S.store.x, S.store.z, S.store.width, S.store.depth),
  ...S.storeTables.map(([x, z]) => box(x, z, 0.9, 0.7)),
  box(S.pojangmacha.x, S.pojangmacha.z, S.pojangmacha.width, S.pojangmacha.depth),
  box(S.subway.x, S.subway.z, S.subway.width, S.subway.depth),
  ...S.busStops.map(([x, z]) => box(x, z, 2.6, 0.8)),
];

/** Paved aprons (x, z, width, depth): the environment keeps grass off them. */
export const KOREA_SIGHT_PAVING: readonly (readonly [
  number,
  number,
  number,
  number,
])[] = [
  [S.hall.x, S.hall.z + 1.6, S.hall.width + 3, S.hall.depth + 4.4],
  [S.cheomseongdae.x, S.cheomseongdae.z, 3.6, 3.6],
  [S.pagoda.x, S.pagoda.z, 3.4, 3.4],
  [gate.x, gate.z, gate.width + 2.4, gate.depth + 1.2],
  [-40.8, -6.2, 15.2, 4.6],
  [S.hanoks[2].x, S.hanoks[2].z, 4, 5.6],
  [S.ddp.x, S.ddp.z, S.ddp.width + 1.2, S.ddp.depth + 1.2],
];

/** Footprints that must never cover a door, gate or path junction (tests). */
export const KOREA_SIGHT_FOOTPRINTS = KOREA_SIGHT_SOLIDS;
