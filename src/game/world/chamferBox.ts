import * as THREE from "three";

/**
 * A unit box with chamfered edges whose normals blend across each chamfer
 * exactly as across a rounded edge (every vertex carries its own face's
 * normal), so under light it reads like `RoundedBoxGeometry(1, 1, 1, 1, r)`
 * at 44 triangles instead of 108. Made for the thousands of small instanced
 * pieces (shingles, planks, stones) where the bevel is a few millimetres on
 * screen and only its shading matters.
 */
export function chamferBoxGeometry(radius = 0.1) {
  const h = 0.5,
    i = h - radius;
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    index: number[] = [];
  // Each face: its 4 inset corners (normal = face normal). Vertex ids are
  // looked up by (face axis/sign, corner signs) so strips and corners reuse
  // them.
  const ids = new Map<string, number>();
  const axes = [0, 1, 2] as const;
  for (const axis of axes)
    for (const sign of [1, -1]) {
      const u = (axis + 1) % 3,
        v = (axis + 2) % 3;
      for (const su of [-1, 1])
        for (const sv of [-1, 1]) {
          const p = [0, 0, 0],
            n = [0, 0, 0];
          p[axis] = sign * h;
          p[u] = su * i;
          p[v] = sv * i;
          n[axis] = sign;
          ids.set(`${axis}${sign}|${u}${su}|${v}${sv}`, positions.length / 3);
          positions.push(...p);
          normals.push(...n);
          uvs.push((su + 1) / 2, (sv + 1) / 2);
        }
    }
  const id = (axis: number, sign: number, a: number, sa: number, b: number, sb: number) => {
    const u = (axis + 1) % 3;
    return u === a
      ? ids.get(`${axis}${sign}|${a}${sa}|${b}${sb}`)!
      : ids.get(`${axis}${sign}|${b}${sb}|${a}${sa}`)!;
  };
  const p = (k: number) => new THREE.Vector3(positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]);
  // Emit a triangle/quad wound so its geometric normal points outward.
  const tri = (a: number, b: number, c: number) => {
    const pa = p(a),
      n = p(b).sub(pa).cross(p(c).sub(pa));
    const centre = pa.clone().add(p(b)).add(p(c));
    if (n.dot(centre) < 0) index.push(a, c, b);
    else index.push(a, b, c);
  };
  const quad = (a: number, b: number, c: number, d: number) => {
    tri(a, b, c);
    tri(a, c, d);
  };
  // Faces.
  for (const axis of axes)
    for (const sign of [1, -1]) {
      const u = (axis + 1) % 3,
        v = (axis + 2) % 3;
      quad(
        id(axis, sign, u, -1, v, -1),
        id(axis, sign, u, 1, v, -1),
        id(axis, sign, u, 1, v, 1),
        id(axis, sign, u, -1, v, 1),
      );
    }
  // Edge strips: between face (a, sa) and face (b, sb), along axis c.
  for (const a of axes)
    for (const b of axes) {
      if (b <= a) continue;
      const c = 3 - a - b;
      for (const sa of [1, -1])
        for (const sb of [1, -1])
          quad(
            id(a, sa, b, sb, c, -1),
            id(a, sa, b, sb, c, 1),
            id(b, sb, a, sa, c, 1),
            id(b, sb, a, sa, c, -1),
          );
    }
  // Corners.
  for (const sx of [1, -1])
    for (const sy of [1, -1])
      for (const sz of [1, -1])
        tri(id(0, sx, 1, sy, 2, sz), id(1, sy, 0, sx, 2, sz), id(2, sz, 0, sx, 1, sy));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
