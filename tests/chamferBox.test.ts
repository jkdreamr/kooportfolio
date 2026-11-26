import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { chamferBoxGeometry, chamferBoxSized, chamferBoxSizedShared } from "../src/game/world/chamferBox";

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

describe("sized chamfer box (<Box> geometry)", () => {
  const size = [3, 0.4, 1.2] as const;
  const g = chamferBoxSized(size, 0.088);
  it("is a closed 44-triangle box of the given size", () => {
    expect(g.index!.count / 3).toBe(44);
    g.computeBoundingBox();
    g.boundingBox!.min.toArray().forEach((x, i) => expect(x).toBeCloseTo([-1.5, -0.2, -0.6][i], 6));
    g.boundingBox!.max.toArray().forEach((x, i) => expect(x).toBeCloseTo([1.5, 0.2, 0.6][i], 6));
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
  it("keeps an even, absolute bevel and outward winding", () => {
    const pos = g.attributes.position;
    // Top face corners sit `radius` in from every side edge.
    const xs = new Set<number>();
    for (let v = 0; v < pos.count; v++)
      if (Math.abs(pos.getY(v) - 0.2) < 1e-6) xs.add(+pos.getX(v).toFixed(4));
    expect([...xs].sort((a, b) => a - b)).toEqual([-1.412, 1.412]);
    const ix = g.index!.array;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < ix.length; t += 3) {
      a.fromBufferAttribute(pos, ix[t]); b.fromBufferAttribute(pos, ix[t + 1]); c.fromBufferAttribute(pos, ix[t + 2]);
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      expect(n.dot(a.clone().add(b).add(c))).toBeGreaterThan(0);
    }
  });
  it("matches the unit chamfer box exactly at size 1", () => {
    const unit = chamferBoxGeometry(0.1), sized = chamferBoxSized([1, 1, 1], 0.1);
    expect(Array.from(sized.attributes.position.array)).toEqual(Array.from(unit.attributes.position.array));
    expect(Array.from(sized.index!.array)).toEqual(Array.from(unit.index!.array));
  });
  it("caches shared geometry per size and radius", () => {
    expect(chamferBoxSizedShared([2, 1, 1], 0.1)).toBe(chamferBoxSizedShared([2, 1, 1], 0.1));
    expect(chamferBoxSizedShared([2, 1, 1], 0.1)).not.toBe(chamferBoxSizedShared([2, 1, 1], 0.12));
  });
});
