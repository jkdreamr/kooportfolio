import * as THREE from "three";
import {
  TELEPHOTO_FOV,
  distanceToZoom,
  zoomToDistance,
} from "../../stage/contract";

/**
 * The two hub views as pure camera maths (no per-frame allocation).
 *
 * - diorama: the fixed three-quarter telephoto overview (fov 20) along
 *   ISLAND_CAMERA_OFFSET; its zoom is the old orthographic zoom.
 * - explore: a low third-person camera behind the player, on the same
 *   azimuth so movement input, click-to-walk and door prompts are unchanged.
 *
 * The blend between them is parametric (elevation, azimuth, target, fov and
 * log(distance·tan(fov/2)), i.e. the on-screen subject size), never a
 * position lerp: a position lerp between a far telephoto and a close wide
 * lens dolly-zooms and can dip under the ground.
 */
export interface ViewPose {
  /** Look-at point. */
  target: THREE.Vector3;
  /** Unit vector from the target to the camera. */
  direction: THREE.Vector3;
  distance: number;
  /** Vertical field of view, degrees. */
  fov: number;
}

export const makeViewPose = (): ViewPose => ({
  target: new THREE.Vector3(),
  direction: new THREE.Vector3(0, 0, 1),
  distance: 1,
  fov: TELEPHOTO_FOV,
});

export function copyViewPose(out: ViewPose, from: ViewPose) {
  out.target.copy(from.target);
  out.direction.copy(from.direction);
  out.distance = from.distance;
  out.fov = from.fov;
  return out;
}

/** Explore lens and boom (desktop / landscape). */
export const EXPLORE_FOV = 42;
/** Mobile portrait: wider lens, slightly longer boom. */
export const EXPLORE_FOV_PORTRAIT = 50;
export const EXPLORE_PORTRAIT_DISTANCE_SCALE = 1.1;
export const EXPLORE_ELEVATION = (12 * Math.PI) / 180;
/** Look point above the player's feet and its shift to screen-right, so the
 * character sits left of centre with the horizon in the upper third. */
export const EXPLORE_LOOK_HEIGHT = 1.4;
export const EXPLORE_LOOK_RIGHT = 0.8;
/** Boom safety limits. */
export const BOOM_MIN_DISTANCE = 2.2;
export const BOOM_MAX_ELEVATION = (30 * Math.PI) / 180;
/** Seconds for a full view toggle (reduced motion: 0.15). */
/** The explore boom follows its collision-safe length and pitch on a
 * critically damped spring that settles (to 1%) in this long: no velocity
 * jump when an obstacle appears, no cut when it goes. */
export const BOOM_SPRING_SECONDS = 0.25;
/** ωt at which a critically damped spring is within 1% of its target. */
const SPRING_SETTLE = 6.64;
export type Spring = { value: number; velocity: number };
/**
 * One step of a critically damped spring toward `target` (exact for constant
 * `target` over the step, so it is stable at any frame time).
 */
export function stepSpring(spring: Spring, target: number, dt: number, settle = BOOM_SPRING_SECONDS) {
  if (dt <= 0) return spring.value;
  const omega = SPRING_SETTLE / Math.max(1e-3, settle);
  const x = spring.value - target;
  const decay = Math.exp(-omega * dt);
  const k = spring.velocity + omega * x;
  spring.value = target + (x + k * dt) * decay;
  spring.velocity = (spring.velocity - omega * k * dt) * decay;
  return spring.value;
}

export const VIEW_BLEND_SECONDS = 0.9;
export const VIEW_BLEND_SECONDS_REDUCED = 0.15;

/** Lens and boom scale for a viewport. */
export function exploreLens(width: number, height: number) {
  const portrait = width < 700 && height > width;
  return portrait
    ? { fov: EXPLORE_FOV_PORTRAIT, distanceScale: EXPLORE_PORTRAIT_DISTANCE_SCALE }
    : { fov: EXPLORE_FOV, distanceScale: 1 };
}

/**
 * The diorama pose: exactly what `aimCamera` computes for a perspective
 * camera (target, normalised offset, zoomToDistance at the lens).
 */
export function dioramaPose(
  out: ViewPose,
  look: THREE.Vector3Like,
  offset: THREE.Vector3Like,
  zoom: number,
  viewportHeight: number,
  fov = TELEPHOTO_FOV,
) {
  out.target.set(look.x, look.y, look.z);
  out.direction.set(offset.x, offset.y, offset.z).normalize();
  out.distance = zoomToDistance(zoom, Math.max(1, viewportHeight), fov);
  out.fov = fov;
  return out;
}

/** Unit direction for an azimuth (atan2(x, z) of the horizontal offset) and
 * an elevation above the horizon. */
export function directionFor(
  out: THREE.Vector3,
  azimuth: number,
  elevation: number,
) {
  const flat = Math.cos(elevation);
  return out.set(
    Math.sin(azimuth) * flat,
    Math.sin(elevation),
    Math.cos(azimuth) * flat,
  );
}

export const azimuthOf = (offset: THREE.Vector3Like) =>
  Math.atan2(offset.x, offset.z);

/**
 * The explore pose behind `player` (feet position), looking along the
 * diorama azimuth of `offset`. `distance` is the boom length, `elevation`
 * the boom angle (EXPLORE_ELEVATION unless the boom is being kept clear).
 */
export function explorePose(
  out: ViewPose,
  player: THREE.Vector3Like,
  offset: THREE.Vector3Like,
  distance: number,
  fov: number,
  elevation = EXPLORE_ELEVATION,
) {
  const azimuth = azimuthOf(offset);
  // Screen-right of a camera looking along -direction (horizontal).
  const rightX = Math.cos(azimuth),
    rightZ = -Math.sin(azimuth);
  out.target.set(
    player.x + rightX * EXPLORE_LOOK_RIGHT,
    player.y + EXPLORE_LOOK_HEIGHT,
    player.z + rightZ * EXPLORE_LOOK_RIGHT,
  );
  directionFor(out.direction, azimuth, elevation);
  out.distance = distance;
  out.fov = fov;
  return out;
}

const halfTan = (fov: number) => Math.tan((fov * Math.PI) / 360);
const shortest = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/**
 * Parametric mix of two poses. b = 0 returns `a` exactly (bit-identical),
 * b = 1 returns `b` exactly. In between: elevation, azimuth, target and fov
 * interpolate linearly and the framed height (distance·tan(fov/2)) log-
 * linearly, so on-screen subject size changes monotonically.
 */
export function mixView(out: ViewPose, a: ViewPose, b: ViewPose, t: number) {
  if (t <= 0) return copyViewPose(out, a);
  if (t >= 1) return copyViewPose(out, b);
  const elevationA = Math.asin(THREE.MathUtils.clamp(a.direction.y, -1, 1)),
    elevationB = Math.asin(THREE.MathUtils.clamp(b.direction.y, -1, 1));
  const azimuthA = Math.atan2(a.direction.x, a.direction.z),
    azimuthB = Math.atan2(b.direction.x, b.direction.z);
  const fov = a.fov + (b.fov - a.fov) * t;
  const sizeA = Math.log(a.distance * halfTan(a.fov)),
    sizeB = Math.log(b.distance * halfTan(b.fov));
  out.target.lerpVectors(a.target, b.target, t);
  directionFor(
    out.direction,
    azimuthA + shortest(azimuthA, azimuthB) * t,
    elevationA + (elevationB - elevationA) * t,
  );
  out.distance = Math.exp(sizeA + (sizeB - sizeA) * t) / halfTan(fov);
  out.fov = fov;
  return out;
}

/** Smootherstep, the blend curve of a view toggle. */
export function easeView(progress: number) {
  const x = Math.min(1, Math.max(0, progress));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Advance a toggle's raw progress (0 = diorama, 1 = explore) toward
 * `toward` (0 or 1). Toggling mid-blend just reverses from where it is.
 */
export function stepViewProgress(
  progress: number,
  toward: number,
  delta: number,
  seconds: number,
) {
  const step = delta / Math.max(1e-3, seconds);
  return toward > progress
    ? Math.min(toward, progress + step)
    : Math.max(toward, progress - step);
}

/** Candidate boom fractions, longest first. */
const BOOM_STEPS = [1, 0.85, 0.7, 0.55, 0.42, 0.3, 0.18, 0] as const;
/** Elevations tried at the shortest boom, lowest first. */
const BOOM_RISE_STEPS = [0.25, 0.5, 0.75, 1] as const;
/** One boom sample every this many metres (thin props are not skipped). */
const BOOM_SAMPLE_SPACING = 0.4;
const boomDirection = new THREE.Vector3();

/** Tall props and footprints the boom must stay out of, for the current
 * world ([cx, cz, halfX, halfZ, topY]); the engine sets it per world, on top
 * of whatever the caller's `blocked` test knows. */
let boomObstacles: readonly (readonly [number, number, number, number, number])[] = [];
export function setBoomObstacles(list: typeof boomObstacles) {
  boomObstacles = list;
}
export function obstacleAt(
  list: typeof boomObstacles,
  x: number,
  z: number,
  y: number,
) {
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (y < o[4] && Math.abs(x - o[0]) < o[2] && Math.abs(z - o[1]) < o[3]) return true;
  }
  return false;
}

function boomClear(
  target: THREE.Vector3Like,
  azimuth: number,
  length: number,
  elevation: number,
  blocked: (x: number, z: number, y: number) => boolean,
) {
  directionFor(boomDirection, azimuth, elevation);
  const samples = Math.max(5, Math.ceil(length / BOOM_SAMPLE_SPACING));
  for (let i = 1; i <= samples; i++) {
    const s = (length * i) / samples;
    const x = target.x + boomDirection.x * s;
    const z = target.z + boomDirection.z * s;
    const y = target.y + boomDirection.y * s;
    if (blocked(x, z, y) || obstacleAt(boomObstacles, x, z, y)) return false;
  }
  return true;
}

/**
 * Longest clear boom for the explore camera. `blocked(x, z, y)` reports a
 * solid (building footprint, raised relief, tree) at a sample point; the
 * world's tall props (setBoomObstacles) are tested too. A blocked boom first
 * comes closer at the same angle (never under BOOM_MIN_DISTANCE) and only
 * then rises (up to BOOM_MAX_ELEVATION), so the frame stays a low
 * over-the-shoulder view wherever it can. Writes `out` and returns it.
 */
export function clearBoom(
  out: { distance: number; elevation: number },
  target: THREE.Vector3Like,
  azimuth: number,
  distance: number,
  blocked: (x: number, z: number, y: number) => boolean,
) {
  // Called every frame: while nothing that decides the answer has moved (a
  // player standing still), reuse it instead of sampling the world again.
  // Re-checked every BOOM_MEMO_FRAMES calls anyway, so solids that appear
  // under a still camera (trees registered late) are picked up within ~0.5 s.
  const memo = boomMemo;
  if (
    ++memo.age < BOOM_MEMO_FRAMES &&
    memo.blocked === blocked &&
    memo.obstacles === boomObstacles &&
    memo.azimuth === azimuth &&
    memo.distance === distance &&
    Math.abs(memo.x - target.x) < 1e-4 &&
    Math.abs(memo.y - target.y) < 1e-4 &&
    Math.abs(memo.z - target.z) < 1e-4
  ) {
    out.distance = memo.outDistance;
    out.elevation = memo.outElevation;
    return out;
  }
  searchBoom(out, target, azimuth, distance, blocked);
  memo.age = 0;
  memo.blocked = blocked;
  memo.obstacles = boomObstacles;
  memo.azimuth = azimuth;
  memo.distance = distance;
  memo.x = target.x;
  memo.y = target.y;
  memo.z = target.z;
  memo.outDistance = out.distance;
  memo.outElevation = out.elevation;
  return out;
}
const BOOM_MEMO_FRAMES = 30;
const boomMemo = {
  age: 0,
  blocked: null as ((x: number, z: number, y: number) => boolean) | null,
  obstacles: boomObstacles,
  azimuth: NaN,
  distance: NaN,
  x: NaN,
  y: NaN,
  z: NaN,
  outDistance: 0,
  outElevation: 0,
};
/** Forget the cached boom (tests; the world's solids changed under it). */
export function resetBoomMemo() {
  boomMemo.blocked = null;
}

function searchBoom(
  out: { distance: number; elevation: number },
  target: THREE.Vector3Like,
  azimuth: number,
  distance: number,
  blocked: (x: number, z: number, y: number) => boolean,
) {
  const span = Math.max(0, distance - BOOM_MIN_DISTANCE);
  for (let step = 0; step < BOOM_STEPS.length; step++) {
    const length = BOOM_MIN_DISTANCE + span * BOOM_STEPS[step];
    if (boomClear(target, azimuth, length, EXPLORE_ELEVATION, blocked)) {
      out.distance = length;
      out.elevation = EXPLORE_ELEVATION;
      return out;
    }
  }
  out.distance = BOOM_MIN_DISTANCE;
  for (const rise of BOOM_RISE_STEPS) {
    const elevation = EXPLORE_ELEVATION + (BOOM_MAX_ELEVATION - EXPLORE_ELEVATION) * rise;
    out.elevation = elevation;
    if (boomClear(target, azimuth, BOOM_MIN_DISTANCE, elevation, blocked)) return out;
  }
  // Last resort (backed against a tall wall): stop short of whatever is in
  // the way, rather than put the lens inside it.
  directionFor(boomDirection, azimuth, BOOM_MAX_ELEVATION);
  let reach = BOOM_LAST_RESORT;
  for (let s = 0.1; s <= BOOM_MIN_DISTANCE; s += 0.1) {
    const x = target.x + boomDirection.x * s;
    const z = target.z + boomDirection.z * s;
    const y = target.y + boomDirection.y * s;
    if (blocked(x, z, y) || obstacleAt(boomObstacles, x, z, y)) break;
    reach = Math.max(BOOM_LAST_RESORT, s - 0.2);
  }
  out.distance = reach;
  return out;
}
/** Shortest boom of all, only when even the minimum boom is inside a wall. */
export const BOOM_LAST_RESORT = 0.6;

/**
 * Write a pose to a perspective camera, recording the equivalent old ortho
 * zoom (`userData.viewZoom`) and distance so the marker, the engine and
 * `rig.readPose` keep working in either view.
 */
export function applyViewPose(
  camera: THREE.PerspectiveCamera,
  pose: ViewPose,
  viewportHeight: number,
) {
  const { target, direction, distance } = pose;
  camera.position.set(
    target.x + direction.x * distance,
    target.y + direction.y * distance,
    target.z + direction.z * distance,
  );
  camera.lookAt(target.x, target.y, target.z);
  camera.userData.viewZoom = distanceToZoom(
    distance,
    Math.max(1, viewportHeight),
    pose.fov,
  );
  camera.userData.viewDistance = distance;
  const near = Math.max(0.1, distance * 0.04);
  const far = distance + 700;
  if (camera.fov !== pose.fov || camera.near !== near || camera.far !== far) {
    camera.fov = pose.fov;
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }
}

/**
 * Tree crowns (and the trunks under them) as a static spatial grid for the
 * explore boom: built once per crown-set change, queried allocation-free.
 * A crown is a sphere of radius `r` round (x, y, z); its trunk a column of
 * radius TRUNK_RADIUS from the ground up to the crown centre.
 */
export interface TreeGrid {
  cell: number;
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  /** Per cell: first index into `items` (length cols·rows + 1). */
  start: Int32Array;
  /** Crown indices, grouped by cell. */
  items: Int32Array;
  /** x, y, z, r per crown. */
  data: Float32Array;
}
/** Clearance kept round a crown and a trunk (camera near plane + leaf cards). */
export const TREE_MARGIN = 0.7;
/** With half the margin added, a trunk blocks a 0.9 m circle. */
export const TRUNK_RADIUS = 0.55;
const TREE_CELL = 4;

export function emptyTreeGrid(): TreeGrid {
  return {
    cell: TREE_CELL,
    minX: 0,
    minZ: 0,
    cols: 0,
    rows: 0,
    start: new Int32Array(1),
    items: new Int32Array(0),
    data: new Float32Array(0),
  };
}

/** Bin crowns ([x, y, z, radius] each) into a grid. Not for per-frame use. */
export function buildTreeGrid(
  crowns: readonly (readonly [number, number, number, number])[],
  cell = TREE_CELL,
): TreeGrid {
  const grid = emptyTreeGrid();
  grid.cell = cell;
  if (!crowns.length) return grid;
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity;
  const reachOf = (r: number) => r + TREE_MARGIN;
  for (const [x, , z, r] of crowns) {
    const reach = reachOf(r);
    minX = Math.min(minX, x - reach);
    minZ = Math.min(minZ, z - reach);
    maxX = Math.max(maxX, x + reach);
    maxZ = Math.max(maxZ, z + reach);
  }
  const cols = Math.max(1, Math.ceil((maxX - minX) / cell));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / cell));
  const cellsOf = (x: number, z: number, r: number) => {
    const reach = reachOf(r);
    return [
      Math.max(0, Math.floor((x - reach - minX) / cell)),
      Math.min(cols - 1, Math.floor((x + reach - minX) / cell)),
      Math.max(0, Math.floor((z - reach - minZ) / cell)),
      Math.min(rows - 1, Math.floor((z + reach - minZ) / cell)),
    ] as const;
  };
  const counts = new Int32Array(cols * rows + 1);
  for (const [x, , z, r] of crowns) {
    const [c0, c1, r0, r1] = cellsOf(x, z, r);
    for (let row = r0; row <= r1; row++)
      for (let col = c0; col <= c1; col++) counts[row * cols + col + 1]++;
  }
  for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1];
  const items = new Int32Array(counts[counts.length - 1]);
  const fill = counts.slice(0, -1);
  const data = new Float32Array(crowns.length * 4);
  crowns.forEach(([x, y, z, r], i) => {
    data.set([x, y, z, r], i * 4);
    const [c0, c1, r0, r1] = cellsOf(x, z, r);
    for (let row = r0; row <= r1; row++)
      for (let col = c0; col <= c1; col++) items[fill[row * cols + col]++] = i;
  });
  Object.assign(grid, { minX, minZ, cols, rows, start: counts, items, data });
  return grid;
}

/**
 * Is (x, y, z) inside a crown or a trunk (with TREE_MARGIN)? Crowns whose
 * footprint covers (skipX, skipZ), i.e. the tree the player stands under,
 * are ignored: the boom leaves that crown behind the player.
 */
export function treeBlocked(
  grid: TreeGrid,
  x: number,
  z: number,
  y: number,
  skipX: number,
  skipZ: number,
) {
  if (!grid.cols) return false;
  const col = Math.floor((x - grid.minX) / grid.cell),
    row = Math.floor((z - grid.minZ) / grid.cell);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
  const cellIndex = row * grid.cols + col;
  const { data, items } = grid;
  for (let i = grid.start[cellIndex]; i < grid.start[cellIndex + 1]; i++) {
    const o = items[i] * 4;
    const cx = data[o],
      cy = data[o + 1],
      cz = data[o + 2],
      reach = data[o + 3] + TREE_MARGIN;
    const sx = skipX - cx,
      sz = skipZ - cz;
    if (sx * sx + sz * sz < reach * reach) continue;
    const dx = x - cx,
      dy = y - cy,
      dz = z - cz;
    const flat = dx * dx + dz * dz;
    if (flat + dy * dy < reach * reach) return true;
    const trunk = TRUNK_RADIUS + TREE_MARGIN * 0.5;
    if (dy < 0 && flat < trunk * trunk) return true;
  }
  return false;
}
