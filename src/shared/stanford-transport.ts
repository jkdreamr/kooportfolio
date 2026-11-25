/** Stanford's full-size public stops adjoin the campus streets. */
export const STANFORD_TELESCOPE = [-12, 6] as const;
export const STANFORD_TELESCOPE_ENTRY = [-12, 14] as const;
export const STANFORD_BULLETIN = [6, 3] as const;
export const STANFORD_BULLETIN_ENTRY = [6, 5] as const;
export const STANFORD_STATION = [-20.5, 22] as const;
export const STANFORD_STATION_GATE = [-17.5, 22] as const;

/** Clockwise coastal route, beginning beside the station platform. Not a village-wide ellipse. */
const railCorners = [
  [-31, 22],
  [-31, 14],
  [-28, -8],
  [-10, -10],
  [10, -8],
  [29, 2],
  [48, 2],
  [54, 12],
  [54, 31],
  [72, 39],
  [78, 51],
  [77, 65],
  [64, 76.5],
  [46, 80],
  [5, 80],
  [-39, 82],
  [-49, 73],
  [-50, 54],
  [-43, 42],
  [-37, 35],
  [-34, 30],
  [-31, 27],
] as const;

function curvePoint(segment: number, t: number): readonly [number, number] {
  const n = railCorners.length;
  const points = [-1, 0, 1, 2].map(
    (offset) => railCorners[(segment + offset + n) % n],
  );
  const coordinate = (axis: 0 | 1) => {
    const [a, b, c, d] = points.map((point) => point[axis]);
    return (
      0.5 *
      (2 * b +
        (-a + c) * t +
        (2 * a - 5 * b + 4 * c - d) * t * t +
        (-a + 3 * b - 3 * c + d) * t * t * t)
    );
  };
  return [coordinate(0), coordinate(1)];
}

// Arc-length samples keep coaches equally spaced around rounded coastal corners.
export const STANFORD_RAIL_POINTS: readonly (readonly [number, number])[] =
  Array.from({ length: railCorners.length * 32 + 1 }, (_, index) =>
    curvePoint(Math.floor(index / 32) % railCorners.length, (index % 32) / 32),
  );
const distances = [0];
for (let i = 1; i < STANFORD_RAIL_POINTS.length; i++) {
  const [x, z] = STANFORD_RAIL_POINTS[i];
  const [px, pz] = STANFORD_RAIL_POINTS[i - 1];
  distances.push(distances[i - 1] + Math.hypot(x - px, z - pz));
}
export const STANFORD_RAIL_LENGTH = distances[distances.length - 1];
export const STANFORD_RAIL_PROFILE = {
  // Bounds only: the shoreline curve, not an ellipse, defines this route.
  centerX: 14,
  centerZ: 36,
  radiusX: 66,
  radiusZ: 47,
  station: STANFORD_STATION,
  lapSeconds: 90,
  coachTurns: 6.5 / STANFORD_RAIL_LENGTH,
};

export function stanfordRailPose(turns: number, offset = 0) {
  const distance = ((((turns - offset) % 1) + 1) % 1) * STANFORD_RAIL_LENGTH;
  let low = 0,
    high = distances.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (distances[middle] <= distance) low = middle;
    else high = middle;
  }
  const [ax, az] = STANFORD_RAIL_POINTS[low];
  const [bx, bz] = STANFORD_RAIL_POINTS[high];
  const t = (distance - distances[low]) / (distances[high] - distances[low]);
  return {
    x: ax + (bx - ax) * t,
    z: az + (bz - az) * t,
    heading: Math.atan2(bx - ax, bz - az),
  };
}
