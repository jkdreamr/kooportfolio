/** Local campus coordinates. The world owner positions/rotates the whole parcel. */
export const campusDistrictFootprint = {
  minX: -21,
  maxX: 21,
  minZ: -20,
  maxZ: 28,
} as const;

export type CampusRect = readonly [
  x: number,
  z: number,
  halfX: number,
  halfZ: number,
];

// Solid wings and standalone buildings; paths and roofed arcades stay open.
export const campusDistrictBuildings = {
  westWing: [-14.3, -8, 1.7, 12],
  eastWing: [14.3, -8, 1.7, 12],
  northWest: [-9.6, -23.5, 4.8, 1.8],
  northEast: [9.6, -23.5, 4.8, 1.8],
  church: [0, -23, 4.4, 4.3],
  library: [-23.1, -15, 4.1, 7.4],
  tower: [23, -16, 2.5, 2.5],
  towerAnnex: [23, -24.5, 4.2, 3],
  cafe: [-23, 3.5, 4, 3.2],
  arts: [23, 2, 4.1, 3.4],
} as const satisfies Record<string, CampusRect>;

export const campusDistrictFountain = [0, -7, 1.8, 1.8] as const;
export const campusDistrictPalms = [-1, 1].flatMap((side) =>
  [10, 18, 26, 33].map((z) => [side * (z < 30 ? 14 : 5.4), z] as const),
);
export const campusDistrictArcadePillars = [-1, 1].flatMap((side) =>
  Array.from({ length: 9 }, (_, i) => [side * 11.3, -19 + i * 2.8] as const),
);

export const campusDistrictScale = [0.66, 0.85, 0.65] as const;
export const campusDistrictOffsetZ = 4;

/** The quad fountain's water (CampusDistrictArt: basin water disc r 1.6 at
 * y .72±.06, bowl r .8 at y 1.4±.08), in unscaled parcel units: its centre
 * and the FountainSpec of its spray. */
const fountainScaleXZ = (campusDistrictScale[0] + campusDistrictScale[2]) / 2;
export const campusFountainCenter = [
  campusDistrictFountain[0] * campusDistrictScale[0],
  campusDistrictFountain[1] * campusDistrictScale[2] + campusDistrictOffsetZ,
] as const;
export const campusFountainSpec = {
  basinY: 0.78 * campusDistrictScale[1],
  basinRadius: 1.6 * fountainScaleXZ,
  bowlY: 1.48 * campusDistrictScale[1],
  bowlRadius: 0.8 * fountainScaleXZ * 0.96,
  jets: 8,
  jetAngle: Math.PI / 8,
  landRadius: 1.6 * fountainScaleXZ * 0.8,
  jetApex: 0.36,
  plumeHeight: 0.78,
} as const;

export const campusDistrictObstacles: readonly CampusRect[] = (
  [
    ...Object.values(campusDistrictBuildings),
    campusDistrictFountain,
    ...campusDistrictPalms.map(([x, z]) => [x, z, 0.32, 0.32] as const),
    ...campusDistrictArcadePillars.map(([x, z]) => [x, z, 0.3, 0.3] as const),
    ...[-1, 1].flatMap((side) =>
      [4, 7, 10].map((x) => [side * x, 5.3, 0.3, 0.3] as const),
    ),
    ...[-25.8, -23.1, -20.4].map((x) => [x, -6.3, 0.3, 0.3] as const),
    // Entry piers, cafe tables, study tables and original sculpture plinths.
    [-5.4, 35, 0.6, 0.6],
    [5.4, 35, 0.6, 0.6],
    [-23, 11, 1, 1],
    [-23, 16, 1, 1],
    [-21.5, 23.5, 2.4, 1.1],
    [22, 12, 1, 1],
    [25, 19, 1.2, 1.2],
    // Low planting beds beside, never across, the primary walkways.
    [-6, -14, 2.7, 2.2],
    [6, -14, 2.7, 2.2],
    [-6, 0, 2.7, 2.2],
    [6, 0, 2.7, 2.2],
    // Seating and grove trunks have a small physical footprint, not a canopy-sized one.
    [-6, -7, 0.4, 1.3],
    [6, -7, 0.4, 1.3],
    [-15.7, 22, 0.4, 1.3],
    [15.7, 22, 0.4, 1.3],
    [-21.5, 25, 1.3, 0.45],
    [-21.5, 22, 1.3, 0.45],
    [20, 23, 1.3, 0.45],
    [26, 23, 1.3, 0.45],
    ...[
      [-27, 25],
      [-27, 18],
      [-18, 28],
      [27, 27],
      [27, 10],
      [-26, -30],
      [14, -31],
    ].map(([x, z]) => [x, z, 0.3, 0.3] as const),
  ] satisfies CampusRect[]
).map(([x, z, halfX, halfZ]) => [
  x * campusDistrictScale[0],
  z * campusDistrictScale[2] + campusDistrictOffsetZ,
  halfX * campusDistrictScale[0],
  halfZ * campusDistrictScale[2],
]);

const designStops = {
  entry: [0, 36],
  oval: [0, 21],
  mainQuad: [0, 1.5],
  memorialChurch: [0, -17.5],
  hooverTower: [23, -11.8],
  library: [-23, -4.7],
  cafe: [-19, 12],
  sculptureCourt: [20, 18],
} as const;

export const campusDistrictStops = Object.fromEntries(
  Object.entries(designStops).map(([name, [x, z]]) => [
    name,
    [
      x * campusDistrictScale[0],
      z * campusDistrictScale[2] + campusDistrictOffsetZ,
    ],
  ]),
) as Record<keyof typeof designStops, [number, number]>;
