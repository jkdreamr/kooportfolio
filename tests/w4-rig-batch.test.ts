import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createGait,
  seatPose,
  stepGait,
  FULL_STRIDE_SPEED,
} from "../src/game/world/character/locomotion";
import { Baker } from "../src/game/world/StaticBatch";
import {
  KINDS,
  NEAR_RIG,
  PARTS,
  PARTS_PER_KIND_LOD,
  PART_SLOT,
  nearRig,
  rigGeometries,
  solveJoints,
} from "../src/game/world/character/rig";
import { SURFACE_KIND_INDEX, sculptedMaterial } from "../src/game/world/Surface";

describe("locomotion driver", () => {
  it("eases into and out of a walk instead of snapping", () => {
    const gait = createGait(3);
    stepGait(gait, 1 / 60, FULL_STRIDE_SPEED, 0, 0);
    const first = gait.pose.walk;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.4);
    for (let i = 0; i < 120; i++) stepGait(gait, 1 / 60, FULL_STRIDE_SPEED, 0, 0);
    expect(gait.pose.walk).toBeGreaterThan(0.95);
    stepGait(gait, 1 / 60, 0, 0, 0);
    expect(gait.pose.walk).toBeGreaterThan(0.6);
    for (let i = 0; i < 120; i++) stepGait(gait, 1 / 60, 0, 0, 0);
    expect(gait.pose.walk).toBeLessThan(0.05);
  });

  it("swings legs and arms in opposition while walking", () => {
    const gait = createGait(1);
    let opposed = 0;
    for (let i = 0; i < 200; i++) {
      const p = stepGait(gait, 1 / 60, FULL_STRIDE_SPEED, 0, 0);
      if (i > 60 && Math.abs(p.hipL) > 0.2) {
        expect(Math.sign(p.hipL)).toBe(-Math.sign(p.hipR));
        // Left arm swings with the right leg.
        expect(Math.sign(p.armL)).toBe(Math.sign(p.hipR));
        opposed++;
      }
    }
    expect(opposed).toBeGreaterThan(10);
  });

  it("banks into turns and leans when accelerating", () => {
    const gait = createGait(2);
    let heading = 0;
    for (let i = 0; i < 60; i++) {
      heading += 0.06;
      stepGait(gait, 1 / 60, FULL_STRIDE_SPEED, 0, heading);
    }
    expect(Math.abs(gait.pose.bank)).toBeGreaterThan(0.05);
    const still = createGait(4);
    stepGait(still, 1 / 60, 0, 0, 0);
    const lean0 = still.pose.lean;
    for (let i = 0; i < 6; i++) stepGait(still, 1 / 60, FULL_STRIDE_SPEED, 0, 0);
    expect(still.pose.lean).toBeGreaterThan(lean0);
  });

  it("idles with breathing and blinks deterministically", () => {
    const a = createGait(9),
      b = createGait(9);
    let blinked = false;
    for (let i = 0; i < 600; i++) {
      stepGait(a, 1 / 60, 0, 0, 0);
      stepGait(b, 1 / 60, 0, 0, 0);
      if (a.pose.eyes < 0.5) blinked = true;
    }
    expect(blinked).toBe(true);
    expect(a.pose).toEqual(b.pose);
  });

  it("folds into a seated pose", () => {
    const gait = createGait(5);
    const pose = seatPose(stepGait(gait, 1 / 60, 0, 0, 0), 1);
    expect(pose.hipL).toBeCloseTo(Math.PI / 2);
    expect(pose.kneeR).toBeCloseTo(Math.PI / 2);
  });

  it("keeps the feet near the ground when standing", () => {
    const gait = createGait(6);
    for (let i = 0; i < 30; i++) stepGait(gait, 1 / 60, 0, 0, 0);
    const joints = solveJoints(gait.pose, new THREE.Matrix4());
    const ankle = new THREE.Vector3().setFromMatrixPosition(joints.ankleL);
    expect(ankle.y).toBeGreaterThan(0.02);
    expect(ankle.y).toBeLessThan(0.14);
    expect(PARTS.length).toBeGreaterThan(20);
  });
});

describe("StaticBatch baker", () => {
  const box = new THREE.BoxGeometry();
  const red = new THREE.MeshStandardMaterial({ color: "#c33" });
  const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 });

  function building() {
    const root = new THREE.Group();
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(box, red);
      m.position.set(i, 0, 0);
      root.add(m);
    }
    const pane = new THREE.Mesh(box, glass);
    root.add(pane);
    const live = new THREE.Group();
    live.userData.noBake = true;
    live.add(new THREE.Mesh(box, red));
    root.add(live);
    return { root, pane };
  }

  it("merges opaque meshes into one draw and leaves the rest alone", () => {
    const { root, pane } = building();
    const baker = new Baker(root, "test-a");
    baker.bake();
    expect(baker.meshes.length).toBe(1);
    expect(baker.entries.length).toBe(20);
    expect(pane.visible).toBe(true);
    const merged = baker.meshes[0].geometry;
    expect(merged.attributes.position.count).toBe(20 * box.attributes.position.count);
    expect(merged.attributes.color).toBeDefined();
    baker.dispose();
    expect(root.children.every((c) => c.visible)).toBe(true);
  });

  it("reuses the cached geometry for identical content", () => {
    const a = building(),
      b = building();
    const ba = new Baker(a.root, "test-b");
    const bb = new Baker(b.root, "test-b");
    ba.bake();
    bb.bake();
    expect(bb.meshes[0].geometry).toBe(ba.meshes[0].geometry);
    ba.dispose();
    bb.dispose();
  });

  it("un-bakes a piece that starts moving", () => {
    const { root } = building();
    const baker = new Baker(root, "test-c");
    baker.bake();
    const mover = baker.entries[3].object;
    mover.position.y = 2;
    root.updateMatrixWorld(true);
    for (let i = 0; i < 10; i++) {
      baker.tick();
      root.updateMatrixWorld(true);
    }
    expect(mover.visible).toBe(true);
    expect(baker.entries.length).toBe(19);
    baker.dispose();
  });
});

describe("StaticBatch baker: chunks, casters, kind, AO (PLAN2 §2, §1.2, §1.4)", () => {
  const box = new THREE.BoxGeometry();
  const stone = sculptedMaterial({ color: "#999999" }, "stone");
  const kindAttr = (mesh: THREE.Mesh) => mesh.geometry.attributes.bakeRM;

  it("splits a bake wider than 48 units into 32 m cells, and keeps small ones whole", () => {
    const root = new THREE.Group();
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(box, stone);
      m.position.set(i * 2.5, 0.5, (i % 4) * 20);
      m.castShadow = true;
      root.add(m);
    }
    const wide = new Baker(root, "test-chunk");
    wide.bake();
    expect(wide.meshes.length).toBeGreaterThan(1);
    const total = wide.meshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0);
    expect(total).toBe(40 * box.attributes.position.count);
    // Every cell stays within one 32 m cell (+ half a piece).
    for (const mesh of wide.meshes) {
      const b = mesh.geometry.boundingBox!;
      expect(b.max.x - b.min.x).toBeLessThanOrEqual(33);
      expect(b.max.z - b.min.z).toBeLessThanOrEqual(33);
    }
    wide.dispose();
    const off = new Baker(root, "test-chunk-off", { chunk: false });
    off.bake();
    expect(off.meshes.length).toBe(1);
    off.dispose();
  });

  it("draws only the shadow-casting prefix in the shadow pass", () => {
    const root = new THREE.Group();
    const big = new THREE.Mesh(box, stone);
    big.castShadow = true;
    root.add(big);
    const rivet = new THREE.Mesh(box, stone);
    rivet.scale.setScalar(0.1);
    rivet.position.set(0, 1, 0);
    rivet.castShadow = true;
    root.add(rivet);
    const quiet = new THREE.Mesh(box, stone);
    quiet.position.set(2, 0, 0);
    root.add(quiet);
    const knob = new THREE.Mesh(box, stone);
    knob.scale.setScalar(0.5);
    knob.position.set(-2, 0, 0);
    knob.castShadow = true;
    root.add(knob);
    big.scale.setScalar(1.2);
    const baker = new Baker(root, "test-cast", { tier: "high" });
    baker.bake();
    expect(baker.meshes.length).toBe(1);
    const mesh = baker.meshes[0];
    expect(mesh.castShadow).toBe(true);
    const geometry = mesh.geometry;
    const all = geometry.index!.count;
    expect(geometry.drawRange.count).toBe(Infinity);
    const shadow = (camera: THREE.OrthographicCamera) => {
      mesh.onBeforeShadow(null as never, null as never, null as never, camera, geometry, null as never, null as never);
      const drawn = geometry.drawRange.count;
      mesh.onAfterShadow(null as never, null as never, null as never, camera, geometry, null as never, null as never);
      expect(geometry.drawRange.count).toBe(Infinity);
      return drawn;
    };
    // Follow frustum: the big piece and the knob; the rivet and the
    // non-caster are left out. Island-wide frustum: the big piece only.
    expect(shadow(new THREE.OrthographicCamera(-26, 26, 24, -24))).toBe((all / 4) * 2);
    expect(shadow(new THREE.OrthographicCamera(-70, 70, 60, -60))).toBe(all / 4);
    // Bake output joins the reflection layer as well as the main one.
    expect(mesh.layers.isEnabled(0) && mesh.layers.isEnabled(1)).toBe(true);
    baker.dispose();
  });

  it("casts only big pieces and skips micro trim below high (medium tier)", () => {
    const root = new THREE.Group();
    const wall = new THREE.Mesh(box, stone);
    wall.scale.set(2.6, 2.6, 0.3);
    wall.castShadow = true;
    root.add(wall);
    const post = new THREE.Mesh(box, stone);
    post.scale.set(0.2, 1.9, 0.2);
    post.position.set(3, 0, 0);
    post.castShadow = true;
    root.add(post);
    const sill = new THREE.Mesh(box, stone);
    sill.scale.setScalar(0.4);
    sill.position.set(-3, 0, 0);
    sill.castShadow = true;
    root.add(sill);
    const rivet = new THREE.Mesh(box, stone);
    rivet.scale.setScalar(0.05);
    rivet.position.set(0, 2, 0);
    root.add(rivet);
    const medium = new Baker(root, "test-tier-medium", { tier: "medium" });
    medium.bake();
    const mesh = medium.meshes[0];
    const geometry = mesh.geometry;
    const piece = geometry.index!.count / 4;
    // Colour passes: everything but the rivet. Shadow: ≥1.6 follow, ≥2.4 wide.
    expect(geometry.drawRange.count).toBe(piece * 3);
    const shadow = (camera: THREE.OrthographicCamera) => {
      mesh.onBeforeShadow(null as never, null as never, null as never, camera, geometry, null as never, null as never);
      const drawn = geometry.drawRange.count;
      mesh.onAfterShadow(null as never, null as never, null as never, camera, geometry, null as never, null as never);
      expect(geometry.drawRange.count).toBe(piece * 3);
      return drawn;
    };
    expect(shadow(new THREE.OrthographicCamera(-26, 26, 24, -24))).toBe(piece * 2);
    expect(shadow(new THREE.OrthographicCamera(-70, 70, 60, -60))).toBe(piece);
    medium.dispose();
    // High keeps every piece in the colour passes.
    const high = new Baker(root, "test-tier-high", { tier: "high" });
    high.bake();
    expect(high.meshes[0].geometry.drawRange.count).toBe(Infinity);
    high.dispose();
  });

  it("lets an instanced mesh cast from its first `castCount` instances only", () => {
    const root = new THREE.Group();
    const roof = new THREE.InstancedMesh(box, stone, 5);
    for (let i = 0; i < 5; i++) roof.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i * 1.5, 0, 0));
    roof.castShadow = true;
    roof.userData.castCount = 2; // underlay boards cast, shingles do not
    root.add(roof);
    const baker = new Baker(root, "test-cast-count");
    baker.bake();
    const mesh = baker.meshes[0];
    const geometry = mesh.geometry;
    mesh.onBeforeShadow(null as never, null as never, null as never, new THREE.OrthographicCamera(-20, 20, 20, -20), geometry, null as never, null as never);
    expect(geometry.drawRange.count).toBe((geometry.index!.count / 5) * 2);
    baker.dispose();
  });

  it("writes the surface kind byte per vertex", () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(box, stone));
    const plain = new THREE.Mesh(box, sculptedMaterial({ color: "#d06a5a" }));
    plain.position.x = 3;
    root.add(plain);
    const baker = new Baker(root, "test-kind");
    baker.bake();
    const a = kindAttr(baker.meshes[0]);
    expect(a.itemSize).toBe(3);
    const kinds = new Set<number>();
    for (let i = 0; i < a.count; i++) kinds.add(Math.round(a.getZ(i) * 255));
    expect([...kinds].sort()).toEqual([0, SURFACE_KIND_INDEX.stone]);
    baker.dispose();
  });

  it("bakes contact AO only when asked: darker at the base and in creases", () => {
    const make = () => {
      const root = new THREE.Group();
      const footing = new THREE.Mesh(box, stone);
      footing.scale.set(4, 0.4, 4);
      footing.position.y = 0.2;
      root.add(footing);
      const wall = new THREE.Mesh(box, stone);
      wall.scale.set(2, 3, 2);
      wall.position.y = 0.4 + 1.5;
      root.add(wall);
      return root;
    };
    const lum = (baker: Baker) => {
      const g = baker.meshes[0].geometry;
      const pos = g.attributes.position, col = g.attributes.color, nor = g.attributes.normal;
      let low = 0, high = 0, nl = 0, nh = 0;
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(nor.getY(i)) > 0.5) continue; // side faces only
        const y = pos.getY(i), c = col.getX(i);
        if (Math.abs(y - 0.4) < 1e-3) { low += c; nl++; }
        if (Math.abs(y - 3.4) < 1e-3) { high += c; nh++; }
      }
      return [low / nl, high / nh];
    };
    const off = new Baker(make(), "test-ao-off");
    off.bake();
    const [offLow, offHigh] = lum(off);
    expect(offLow).toBeCloseTo(offHigh, 3);
    off.dispose();
    const on = new Baker(make(), "test-ao-on", { ao: true });
    on.bake();
    const [onLow, onHigh] = lum(on);
    expect(onLow).toBeLessThan(onHigh * 0.95);
    expect(onHigh).toBeCloseTo(offHigh, 2);
    on.dispose();
  });
});

describe("distant crowd rig (low LOD)", () => {
  const tris = (lod: "high" | "low") => {
    const g = rigGeometries(lod);
    return KINDS.reduce((sum, kind) => {
      const geo = g[kind];
      const n = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
      return sum + n * PARTS_PER_KIND_LOD[lod][kind];
    }, 0);
  };
  it("costs well under half the triangles of the full rig", () => {
    expect(tris("low")).toBeLessThan(tris("high") * 0.4);
  });
  it("maps every drawn part to a unique slot and skips only face/shoe detail", () => {
    for (const lod of ["high", "low"] as const) {
      const seen = new Set<string>();
      PARTS.forEach((part, i) => {
        const slot = PART_SLOT[lod][i];
        if (slot < 0) {
          expect(lod).toBe("low");
          expect(part.detail).toBe(true);
          return;
        }
        expect(slot).toBeLessThan(PARTS_PER_KIND_LOD[lod][part.kind]);
        const key = `${part.kind}:${slot}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      });
    }
  });
  it("picks the full rig by on-screen size, with hysteresis", () => {
    // Explore lens: 25 units is the edge.
    expect(nearRig(20, 42, NEAR_RIG.high, false)).toBe(true);
    expect(nearRig(26, 42, NEAR_RIG.high, false)).toBe(false);
    expect(nearRig(26, 42, NEAR_RIG.high, true)).toBe(true);
    // Telephoto diorama camera 73 units out: far, even though it zooms.
    expect(nearRig(73, 20, NEAR_RIG.high, false)).toBe(false);
    expect(nearRig(20, 42, NEAR_RIG.medium, false)).toBe(false);
  });
});
