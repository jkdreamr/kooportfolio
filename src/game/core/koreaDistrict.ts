export const KOREA_SHORE = [
  [-53, -30],
  [-40, -40],
  [-17, -47],
  [27, -42],
  [48, -34],
  [57, -22],
  [64, -7],
  [69, 12],
  [73, 34],
  [73, 55],
  [70, 70],
  [63, 77],
  [50, 76],
  [27, 65],
  [-12, 59],
  [-39, 51],
  [-54, 39],
  [-58, 24],
  [-59, 1],
  [-58, -17],
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
