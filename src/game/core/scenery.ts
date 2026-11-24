// Deterministic tree trunks are shared by scenery and collision/pathfinding.
export const forest = Array.from({ length: 160 }, (_, i) => {
  const a = i * 2.399963,
    r = 0.72 + ((i * 23) % 19) / 100;
  return {
    x: Math.cos(a) * 69 * r,
    z: Math.sin(a) * 57 * r,
    height: 3.2 + (i % 5) * 0.6,
  };
}).filter(
  ({ x, z }) =>
    !(
      (x > 12 && x < 35 && z > 10 && z < 30) ||
      (x > -50 && x < -34 && z > -27 && z < -12) ||
      (x > -48 && x < -35 && z > 13 && z < 26) ||
      (Math.abs(x) < 7 && z > -52 && z < -38) ||
      (x > 36 && x < 50 && z > -28 && z < -13)
    ),
);
