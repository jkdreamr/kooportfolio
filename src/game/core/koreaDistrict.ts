export const KOREA_SHORE = [
  [-56, -17.5],
  [-48.5, -24.5],
  [-39.5, -34.8],
  [-28, -45.5],
  [-21, -46],
  [-11, -45],
  [-10, -29.5],
  [50, -29.5],
  [53, -25],
  [53, 10],
  [56, 13.7],
  [65, 14.5],
  [71.5, 25],
  [71.5, 62],
  [66, 72.5],
  [51, 72.5],
  [48, 61],
  [42, 57.5],
  [-12, 57.5],
  [-34, 49.5],
  [-39, 44],
  [-40.2, 37.8],
  [-39.5, 35],
  [-38.5, 32.4],
  [-34, 30.5],
  [-31, 26],
  [-31, 19],
  [-41.5, 16.4],
  [-53.5, 15],
  [-56, 14.5],
] as const;

export const KOREA_MARKET = {
  stalls: [21, 32, 43],
  z: -19.6,
} as const;
export const KOREA_PICNIC = [37, 5] as const;
export const KOREA_RAMEN_COUNTER = [
  KOREA_MARKET.stalls[1],
  KOREA_MARKET.z + 2.2,
] as const;
export const KOREA_PICNIC_GUEST = [
  KOREA_PICNIC[0] + 3,
  KOREA_PICNIC[1] + 4,
] as const;

export function isOnKoreaLand(x: number, z: number, setback = 0) {
  let inside = false;
  for (let i = 0, j = KOREA_SHORE.length - 1; i < KOREA_SHORE.length; j = i++) {
    const [ax, az] = KOREA_SHORE[j];
    const [bx, bz] = KOREA_SHORE[i];
    const dx = bx - ax;
    const dz = bz - az;
    if (az > z !== bz > z && x < ax + (dx * (z - az)) / dz) inside = !inside;
    if (setback > 0) {
      const t = Math.max(
        0,
        Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)),
      );
      if ((x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2 < setback ** 2)
        return false;
    }
  }
  return inside;
}
