export const doors = [
  { id: 'boathouse', name: 'The Boathouse', x: -7.2, z: 1.5, hint: 'A river. A crew. A little competition.' },
  { id: 'basketball', name: 'The Court', x: 7.1, z: 2.2, hint: 'Find your spot. Find your shot.' },
  { id: 'office', name: 'The Study', x: 0, z: -4.8, hint: 'A little more about Joshua.' },
] as const;
const obstacles = [ [-7.2, -1, 3.1, 2.05], [7.1, -1, 3.2, 2.5], [0, -7, 3, 1.7] ];
export function canWalk(x: number, z: number) {
  if (x < -13 || x > 13 || z < -10 || z > 8.2 || (x / 15) ** 2 + ((z + 1) / 13) ** 2 > 1) return false;
  return !obstacles.some(([cx, cz, w, d]) => Math.abs(x - cx) < w + .3 && Math.abs(z - cz) < d + .3);
}
export function moveWorld(x: number, z: number, dx: number, dz: number): [number, number] {
  // Small substeps prevent tunnelling even after a long frame.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .15));
  for (let i = 0; i < steps; i++) { if (canWalk(x + dx / steps, z)) x += dx / steps; if (canWalk(x, z + dz / steps)) z += dz / steps; }
  return [x, z];
}
export function findPath(start: [number, number], end: [number, number]): [number, number][] {
  const grid = .6, key = (x: number, z: number) => `${x},${z}`;
  const sx = Math.round(start[0] / grid), sz = Math.round(start[1] / grid), ex = Math.round(end[0] / grid), ez = Math.round(end[1] / grid);
  const open = [{ x: sx, z: sz, cost: 0, f: 0 }], seen = new Map<string, number>(), parents = new Map<string, string>();
  seen.set(key(sx, sz), 0);
  for (let n = 0; n < 2400 && open.length; n++) {
    open.sort((a, b) => a.f - b.f); const cur = open.shift()!, ck = key(cur.x, cur.z);
    if (Math.hypot(cur.x - ex, cur.z - ez) <= 1) {
      const out: [number, number][] = [[cur.x * grid, cur.z * grid]]; let k = ck;
      while (parents.has(k)) { k = parents.get(k)!; const [x, z] = k.split(',').map(Number); out.unshift([x * grid, z * grid]); }
      return out.slice(1);
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cur.x + dx, z = cur.z + dz, k = key(x, z), cost = cur.cost + 1;
      if (!canWalk(x * grid, z * grid) || (seen.get(k) ?? Infinity) <= cost) continue;
      seen.set(k, cost); parents.set(k, ck); open.push({ x, z, cost, f: cost + Math.abs(x - ex) + Math.abs(z - ez) });
    }
  }
  return [];
}
