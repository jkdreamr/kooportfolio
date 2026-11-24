/** Stanford's occupied parcels and transport approaches, not the old village lawn. */
export const STANFORD_SHORE = [
  [-84, 14],
  [-16, 14],
  [-8, 8],
  [-8, -24],
  [-29, -27],
  [-29, -45],
  [-12, -47],
  [3, -34],
  [5, -4],
  [12, 6],
  [45, 6],
  [50, 11],
  [50, 39],
  [65, 42],
  [70, 50],
  [70, 63],
  [63, 74],
  [49, 80],
  [-5, 80],
  [-43, 78],
  [-45, 67],
  [-44, 48],
  [-34, 35],
  [-37, 30],
  [-54, 29],
  [-84, 30],
] as const;

/** The same avatar clearance applies to movement and persisted positions. */
export const STANFORD_SHORE_CLEARANCE = 0.45;

/** Rendering, movement and old-save migration share this coastline. */
export function onStanfordLand(x: number, z: number, inset = 0) {
  let inside = false;
  for (
    let i = 0, j = STANFORD_SHORE.length - 1;
    i < STANFORD_SHORE.length;
    j = i++
  ) {
    const [ax, az] = STANFORD_SHORE[j],
      [bx, bz] = STANFORD_SHORE[i];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax)
      inside = !inside;
    if (inset > 0) {
      const dx = bx - ax,
        dz = bz - az;
      const t = Math.max(
        0,
        Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)),
      );
      if (Math.hypot(x - ax - t * dx, z - az - t * dz) < inset) return false;
    }
  }
  return inside;
}
