// Deterministic tree trunks are shared by scenery and collision/pathfinding.
export const forest = Array.from({ length: 100 }, (_, i) => {
  const a = i * 2.399963,
    r = 0.72 + ((i * 23) % 19) / 100;
  return {
    x: Math.cos(a) * 49 * r,
    z: Math.sin(a) * 41 * r,
    height: 3.2 + (i % 5) * 0.6,
  };
});
