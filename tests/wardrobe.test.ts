import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { villagers } from "../src/game/core/npcs";
import { CAST, outfitFor } from "../src/game/world/character/cast";
import {
  DEFAULT_PALETTE,
  FAR_KINDS,
  KINDS,
  lookTriangles,
  writeLook,
  type Kind,
} from "../src/game/world/character/rig";
import { compileOutfit, lookFor, lookFromPalette } from "../src/game/world/character/wardrobe";
import { createGait, stepGait, FULL_STRIDE_SPEED } from "../src/game/world/character/locomotion";

describe("wardrobe and cast (F3)", () => {
  it("dresses every villager from a cast entry that follows who they are", () => {
    const missing = villagers.filter((v) => !CAST[v.id]).map((v) => v.id);
    expect(missing).toEqual([]);
    for (const v of villagers) expect(CAST[v.id].why.length).toBeGreaterThan(20);
  });

  it("keeps the near rig at about 2.5k triangles and the far rig under 1k", () => {
    let total = 0;
    for (const v of villagers) {
      const look = lookFor(v);
      const high = lookTriangles(look, "high");
      total += high;
      expect(high, v.id).toBeLessThanOrEqual(2800);
      expect(lookTriangles(look, "low"), v.id).toBeLessThanOrEqual(1000);
      expect(lookTriangles(look, "low", true), v.id).toBeLessThan(lookTriangles(look, "low"));
    }
    expect(total / villagers.length).toBeLessThanOrEqual(2550);
  });

  it("gives the far rig the outfit's silhouette: hats, skirts and colours carry over", () => {
    const docent = lookFor(villagers.find((v) => v.id === "hall-docent")!);
    // Gat brim + crown and the durumagi panels exist in the far rig.
    expect(docent.count.low.brim).toBe(1);
    expect(docent.count.low.crown).toBe(1);
    expect(docent.count.low.skirt).toBeGreaterThanOrEqual(2);
    const grandmother = lookFor(villagers.find((v) => v.id === "hanok-grandmother")!);
    expect(grandmother.count.low.skirt).toBe(2);
    // Same part colours at both LODs (far parts are a subset).
    for (const look of [docent, grandmother])
      look.parts.forEach((part, i) => {
        if (look.slot.low[i] >= 0) expect(FAR_KINDS.has(part.kind)).toBe(true);
      });
  });

  it("outfits differ by role (lab coat, jersey, hanbok, chef)", () => {
    const o = (id: string) => outfitFor(villagers.find((v) => v.id === id)!);
    expect(o("researcher").outer?.kind).toBe("labcoat");
    expect(o("hooper").top.kind).toBe("jersey");
    expect(o("hanok-grandmother").bottom.kind).toBe("chima");
    expect(o("hall-docent").head?.kind).toBe("gat");
    expect(o("cook").head?.kind).toBe("chef");
    expect(o("rower").top.color.toLowerCase()).toBe("#8c1515");
    expect(o("student").extras?.some((e) => e.kind === "backpack")).toBe(true);
  });

  it("writes every drawn part exactly once per LOD, and flares skirts with the stride", () => {
    const look = lookFor(villagers.find((v) => v.id === "hanok-grandmother")!);
    for (const lod of ["high", "low"] as const) {
      const seen: Record<Kind, number> = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>;
      writeLook(createGait(1).pose, new THREE.Matrix4(), look, lod, (kind) => seen[kind]++);
      expect(seen).toEqual(look.count[lod]);
    }
    const hemWidth = (walking: boolean) => {
      const gait = createGait(2);
      let widest = 0;
      for (let i = 0; i < 90; i++) {
        stepGait(gait, 1 / 60, walking ? FULL_STRIDE_SPEED : 0, 0, 0);
        writeLook(gait.pose, new THREE.Matrix4(), look, "high", (kind, m) => {
          if (kind !== "skirt") return;
          widest = Math.max(widest, new THREE.Vector3().setFromMatrixScale(m).z);
        });
      }
      return widest;
    };
    expect(hemWidth(true)).toBeGreaterThan(hemWidth(false) * 1.1);
  });

  it("keeps the palette look (player) customisable: colour and hat", () => {
    const hat = lookFromPalette({ ...DEFAULT_PALETTE, shirt: "#123456" });
    const bare = lookFromPalette({ ...DEFAULT_PALETTE, hasHat: false });
    expect(hat.count.high.brim).toBe(1);
    expect(bare.count.high.brim).toBe(0);
    expect(hat.parts.some((p) => p.kind === "torso" && p.color === "#123456")).toBe(true);
    expect(lookFromPalette({ ...DEFAULT_PALETTE, shirt: "#123456" })).toBe(hat);
    expect(lookTriangles(hat, "high")).toBeLessThanOrEqual(2600);
  });

  it("compiles deterministically", () => {
    const v = villagers[0];
    expect(JSON.stringify(compileOutfit(outfitFor(v)).parts)).toBe(
      JSON.stringify(compileOutfit(outfitFor(v)).parts),
    );
  });
});
