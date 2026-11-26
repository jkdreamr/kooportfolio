import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { chamferBoxGeometry } from "../src/game/world/chamferBox";

describe("chamfer box (low-poly rounded piece)", () => {
  const g = chamferBoxGeometry(0.1);
  it("is a closed unit box at 44 triangles", () => {
    expect(g.index!.count / 3).toBe(44);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.toArray()).toEqual([-0.5, -0.5, -0.5]);
    expect(g.boundingBox!.max.toArray()).toEqual([0.5, 0.5, 0.5]);
    // Closed: every edge is shared by exactly two triangles.
    const edges = new Map<string, number>();
    const ix = g.index!.array;
    for (let t = 0; t < ix.length; t += 3)
      for (let e = 0; e < 3; e++) {
        const a = ix[t + e], b = ix[t + ((e + 1) % 3)];
        const k = a < b ? `${a}-${b}` : `${b}-${a}`;
        edges.set(k, (edges.get(k) ?? 0) + 1);
      }
    expect([...edges.values()].every((n) => n === 2)).toBe(true);
  });
  it("winds every triangle outward and keeps per-face normals (smooth bevel shading)", () => {
    const pos = g.attributes.position, nor = g.attributes.normal, ix = g.index!.array;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < ix.length; t += 3) {
      a.fromBufferAttribute(pos, ix[t]); b.fromBufferAttribute(pos, ix[t + 1]); c.fromBufferAttribute(pos, ix[t + 2]);
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      expect(n.dot(a.clone().add(b).add(c))).toBeGreaterThan(0);
    }
    for (let v = 0; v < nor.count; v++)
      expect(new THREE.Vector3().fromBufferAttribute(nor, v).length()).toBeCloseTo(1);
    expect(Object.keys(g.attributes).sort()).toEqual(["normal", "position", "uv"]);
  });
});
