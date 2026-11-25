// Pure coastline geometry shared by movement, rails, cameras and world art.
// No Three.js and no imports from other game modules: everything that draws or
// tests a shore can depend on this file without creating a cycle.

export type P2 = readonly [number, number];

/** A Gaussian bump (headland, amp > 0) or bite (cove, amp < 0) on a loop.
 * `at` and `width` are degrees of the loop's own angle parameter. */
export type Lobe = { at: number; amp: number; width: number; name?: string };

const TAU = Math.PI * 2;
const wrapRadians = (angle: number) =>
  Math.atan2(Math.sin(angle), Math.cos(angle));

/** Radial scale of a lobed loop at parameter angle `phi` (radians). */
export function lobeScale(phi: number, lobes: readonly Lobe[]) {
  let scale = 1;
  for (const { at, amp, width } of lobes) {
    const d =
      wrapRadians(phi - (at * Math.PI) / 180) / ((width * Math.PI) / 180);
    scale += amp * Math.exp(-d * d);
  }
  return scale;
}

/** An ellipse whose radius swells and pinches smoothly: always star-shaped
 * about its centre, so headlands and coves can never self-intersect.
 * point(phi) = centre + s(phi) * (rx cos phi, rz sin phi). */
export function lobedLoop(
  center: { centerX: number; centerZ: number },
  rx: number,
  rz: number,
  lobes: readonly Lobe[],
  count: number,
  startAngle = 0,
): P2[] {
  return Array.from({ length: count }, (_, i) => {
    const phi = startAngle + (i / count) * TAU;
    const s = lobeScale(phi, lobes);
    return [
      center.centerX + s * rx * Math.cos(phi),
      center.centerZ + s * rz * Math.sin(phi),
    ] as const;
  });
}

export const signedArea = (points: readonly P2[]) =>
  points.reduce((sum, [x, z], i) => {
    const [nx, nz] = points[(i + 1) % points.length];
    return sum + x * nz - nx * z;
  }, 0) / 2;

/** Counter-clockwise in (x, z), so the outward edge normal is (dz, -dx). */
export function ccwLoop(points: readonly P2[]): P2[] {
  const open =
    points.length > 1 &&
    points[0][0] === points[points.length - 1][0] &&
    points[0][1] === points[points.length - 1][1]
      ? points.slice(0, -1)
      : [...points];
  return signedArea(open) < 0 ? open.reverse() : open;
}

export function loopCentroid(points: readonly P2[]): P2 {
  let area = 0,
    cx = 0,
    cz = 0;
  points.forEach(([x, z], i) => {
    const [nx, nz] = points[(i + 1) % points.length];
    const cross = x * nz - nx * z;
    area += cross;
    cx += (x + nx) * cross;
    cz += (z + nz) * cross;
  });
  return [cx / (3 * area), cz / (3 * area)];
}

export function loopBounds(points: readonly P2[]) {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const [x, z] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

/** Even-odd test; points exactly on an edge may fall either way. */
export function insidePolygon(x: number, z: number, points: readonly P2[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, az] = points[j];
    const [bx, bz] = points[i];
    if (az > z !== bz > z && x < ax + ((bx - ax) * (z - az)) / (bz - az))
      inside = !inside;
  }
  return inside;
}

/** Unsigned distance from a point to the closed polyline. */
export function distanceToPolygon(x: number, z: number, points: readonly P2[]) {
  let best = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, az] = points[j];
    const [bx, bz] = points[i];
    const dx = bx - ax,
      dz = bz - az;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq
      ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq))
      : 0;
    const ex = x - ax - dx * t,
      ez = z - az - dz * t;
    const d = ex * ex + ez * ez;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/** Positive inside, negative outside. */
export const signedDistanceToPolygon = (
  x: number,
  z: number,
  points: readonly P2[],
) => (insidePolygon(x, z, points) ? 1 : -1) * distanceToPolygon(x, z, points);

/** Closest point on the closed polyline, with the index of the edge's start. */
export function nearestOnPolygon(x: number, z: number, points: readonly P2[]) {
  let best = Infinity,
    point: P2 = points[0],
    index = 0;
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[(i + 1) % points.length];
    const dx = bx - ax,
      dz = bz - az;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq
      ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq))
      : 0;
    const px = ax + dx * t,
      pz = az + dz * t;
    const d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < best) {
      best = d;
      point = [px, pz];
      index = i;
    }
  }
  return { point, index, distance: Math.sqrt(best) };
}

/** Keep every original corner and distribute `count` samples by edge length. */
export function resampleCorners(points: readonly P2[], count: number): P2[] {
  const n = points.length;
  const lengths = points.map(([x, z], i) => {
    const [nx, nz] = points[(i + 1) % n];
    return Math.hypot(nx - x, nz - z);
  });
  const total = lengths.reduce((a, b) => a + b, 0);
  const ideal = lengths.map((length) => (length / total) * count);
  const segments = ideal.map((value) => Math.max(1, Math.floor(value)));
  let missing = count - segments.reduce((a, b) => a + b, 0);
  const order = ideal
    .map((value, i) => [value - Math.floor(value), i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; missing > 0; k = (k + 1) % order.length, missing--)
    segments[order[k][1]]++;
  for (
    let k = order.length - 1;
    missing < 0;
    k = (k + order.length - 1) % order.length
  ) {
    const i = order[k][1];
    if (segments[i] > 1) {
      segments[i]--;
      missing++;
    }
  }
  const out: P2[] = [];
  points.forEach(([x, z], i) => {
    const [nx, nz] = points[(i + 1) % n];
    for (let s = 0; s < segments[i]; s++) {
      const t = s / segments[i];
      out.push([x + (nx - x) * t, z + (nz - z) * t]);
    }
  });
  return out;
}

/** Even arc-length samples of a closed loop, beginning at its first point. */
export function resampleLoop(points: readonly P2[], count: number): P2[] {
  const n = points.length;
  const lengths = points.map(([x, z], i) => {
    const [nx, nz] = points[(i + 1) % n];
    return Math.hypot(nx - x, nz - z);
  });
  const total = lengths.reduce((a, b) => a + b, 0);
  const out: P2[] = [];
  let edge = 0,
    start = 0;
  for (let s = 0; s < count; s++) {
    const target = (s / count) * total;
    while (edge < n - 1 && start + lengths[edge] < target)
      start += lengths[edge++];
    const [x, z] = points[edge];
    const [nx, nz] = points[(edge + 1) % n];
    const t = lengths[edge] ? (target - start) / lengths[edge] : 0;
    out.push([x + (nx - x) * t, z + (nz - z) * t]);
  }
  return out;
}

/** Mitred offset; positive grows a counter-clockwise loop. */
export function offsetLoop(points: readonly P2[], distance: number): P2[] {
  const n = points.length;
  const normal = (a: P2, b: P2): P2 => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
  };
  return points.map((point, i) => {
    const a = normal(points[(i + n - 1) % n], point);
    const b = normal(point, points[(i + 1) % n]);
    const scale = distance / Math.max(0.35, 1 + a[0] * b[0] + a[1] * b[1]);
    return [point[0] + (a[0] + b[0]) * scale, point[1] + (a[1] + b[1]) * scale];
  });
}

/** Taubin smoothing: rounds corners and notches without shrinking the loop. */
export function smoothLoop(points: readonly P2[], iterations: number): P2[] {
  let current: P2[] = points.map(([x, z]) => [x, z]);
  const n = current.length;
  for (let k = 0; k < iterations * 2; k++) {
    const factor = k % 2 ? -0.53 : 0.5;
    current = current.map(([x, z], i) => {
      const [px, pz] = current[(i + n - 1) % n];
      const [nx, nz] = current[(i + 1) % n];
      return [
        x + factor * ((px + nx) / 2 - x),
        z + factor * ((pz + nz) / 2 - z),
      ];
    });
  }
  return current;
}

/** Unit outward normal at each vertex of a counter-clockwise loop. */
export function loopNormals(points: readonly P2[]): P2[] {
  const n = points.length;
  return points.map((_, i) => {
    const [px, pz] = points[(i + n - 1) % n];
    const [nx, nz] = points[(i + 1) % n];
    const length = Math.hypot(nx - px, nz - pz) || 1;
    return [(nz - pz) / length, -(nx - px) / length];
  });
}

export type LoopTable = {
  /** The loop, closed: the last point repeats the first. */
  points: readonly P2[];
  distances: readonly number[];
  length: number;
};

/** Cumulative arc lengths of a closed loop, for constant-speed travel. */
export function arcLengthTable(loop: readonly P2[]): LoopTable {
  const first = loop[0],
    last = loop[loop.length - 1];
  const points =
    first[0] === last[0] && first[1] === last[1] ? loop : [...loop, first];
  const distances = [0];
  for (let i = 1; i < points.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(
          points[i][0] - points[i - 1][0],
          points[i][1] - points[i - 1][1],
        ),
    );
  return { points, distances, length: distances[distances.length - 1] };
}

/** Position and heading (atan2(dx, dz)) a fraction of a lap around the loop.
 * `offset` trails behind, in turns: coaches share their locomotive's route. */
export function poseOnLoop(table: LoopTable, turns: number, offset = 0) {
  const { points, distances, length } = table;
  const distance = ((((turns - offset) % 1) + 1) % 1) * length;
  let low = 0,
    high = distances.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (distances[middle] <= distance) low = middle;
    else high = middle;
  }
  const [ax, az] = points[low];
  const [bx, bz] = points[high];
  const span = distances[high] - distances[low];
  const t = span ? (distance - distances[low]) / span : 0;
  return {
    x: ax + (bx - ax) * t,
    z: az + (bz - az) * t,
    heading: Math.atan2(bx - ax, bz - az),
  };
}

/** True when every vertex is visible from `center`: the polar angle around it
 * never reverses, so scaling the loop about that point cannot fold it. */
export function starShapedAbout(points: readonly P2[], center: P2) {
  const n = points.length;
  const direction = Math.sign(signedArea(points)) || 1;
  for (let i = 0; i < n; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[(i + 1) % n];
    const cross =
      (ax - center[0]) * (bz - center[1]) - (bx - center[0]) * (az - center[1]);
    if (cross * direction < -1e-9) return false;
  }
  return true;
}

/** Tightest circumscribed-circle radius over consecutive vertex triples. */
export function minCurveRadius(points: readonly P2[], stride = 1) {
  const n = points.length;
  let tightest = Infinity;
  for (let i = 0; i < n; i++) {
    const a = points[(i + n - stride) % n],
      b = points[i],
      c = points[(i + stride) % n];
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const area2 = Math.abs(
      (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]),
    );
    if (area2 > 1e-12)
      tightest = Math.min(tightest, (ab * bc * ca) / (2 * area2));
  }
  return tightest;
}

/** Push each vertex outward along its normal by `amount(i, point)`. */
export function displaceLoop(
  points: readonly P2[],
  amount: (index: number, point: P2) => number,
): P2[] {
  const normals = loopNormals(points);
  return points.map(([x, z], i) => {
    const d = amount(i, [x, z]);
    return [x + normals[i][0] * d, z + normals[i][1] * d];
  });
}

/** Closed uniform Catmull-Rom spline through every control point. */
export function splineLoop(control: readonly P2[], perSegment = 16): P2[] {
  const n = control.length;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = control[(i + n - 1) % n],
      b = control[i],
      c = control[(i + 1) % n],
      d = control[(i + 2) % n];
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment;
      const axis = (j: 0 | 1) =>
        0.5 *
        (2 * b[j] +
          (-a[j] + c[j]) * t +
          (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t * t +
          (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t * t * t);
      out.push([axis(0), axis(1)]);
    }
  }
  return out;
}

/** Distance along a ray to its first crossing of the closed polyline, or
 * Infinity. `direction` need not be normalised; the result is in its units. */
export function rayToPolygon(origin: P2, direction: P2, points: readonly P2[]) {
  let nearest = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, az] = points[j];
    const ex = points[i][0] - ax,
      ez = points[i][1] - az;
    const cross = direction[0] * ez - direction[1] * ex;
    if (Math.abs(cross) < 1e-12) continue;
    const ox = ax - origin[0],
      oz = az - origin[1];
    const t = (ox * ez - oz * ex) / cross;
    const u = (ox * direction[1] - oz * direction[0]) / cross;
    if (t >= 0 && u >= 0 && u <= 1 && t < nearest) nearest = t;
  }
  return nearest;
}

/** Deterministic integer hash in [0, 1): art never draws random numbers. */
export function hash01(...values: number[]) {
  let h = 2166136261;
  for (const value of values) h = Math.imul(h ^ (value | 0), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Scale a loop about a point: never folds, whatever the loop's shape. */
export const scaleLoop = (points: readonly P2[], about: P2, factor: number) =>
  points.map(
    ([x, z]): P2 => [
      about[0] + (x - about[0]) * factor,
      about[1] + (z - about[1]) * factor,
    ],
  );
