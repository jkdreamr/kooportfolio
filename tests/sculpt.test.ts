import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { villagers } from "../src/game/core/npcs";
import { outfitFor } from "../src/game/world/character/cast";
import { mix, shade } from "../src/game/world/character/outfit";
import { buildFigure, outfitPalette } from "../src/game/world/character/sculpt/figure";
import { evalOps, pieceBounds } from "../src/game/world/character/sculpt/sdf";
import { eyes, headSkin, mouth, type AttrMesh } from "../src/game/world/character/sculpt/head";
import { cutByLabel, decimate, surfaceNets } from "../src/game/world/character/sculpt/mesher";
import { Cast, PIECES } from "../src/game/world/character/sculpt/runtime";
import { hairMesh } from "../src/game/world/character/sculpt/hair";

const castFile = "public/characters/cast-v1.bin";

describe("sculpted characters (F3/F5/F6)", () => {
  it("builds a figure and a full palette for every villager", () => {
    for (const v of villagers) {
      const o = outfitFor(v);
      const fig = buildFigure(o);
      expect(fig.pieces.chest, v.id).toBeDefined();
      expect(fig.pieces.head, v.id).toBeDefined();
      for (const piece of Object.values(fig.pieces)) {
        if (!piece || !piece.ops.length) continue;
        const b = pieceBounds(piece);
        const c: [number, number, number] = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
        expect(Number.isFinite(evalOps(piece.ops, c, null))).toBe(true);
      }
      const pal = outfitPalette(o, mix, shade);
      expect(pal).toHaveLength(32);
      for (const hex of pal.slice(0, 24)) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("makes a closed, outward-facing, mirrored analytic face", () => {
    const HC: [number, number, number] = [0, 0.33, 0.01];
    const skin = headSkin(HC, 20, 24, () => ({ slotB: 0, mix: 0 }));
    // Closed: every edge is shared by exactly two triangles.
    const edges = new Map<string, number>();
    for (let t = 0; t < skin.tri.length; t += 3)
      for (let c = 0; c < 3; c++) {
        const a = skin.tri[t + c], b = skin.tri[t + ((c + 1) % 3)];
        const k = a < b ? `${a},${b}` : `${b},${a}`;
        edges.set(k, (edges.get(k) ?? 0) + 1);
      }
    expect([...edges.values()].every((n) => n === 2)).toBe(true);
    // Normals point away from the head centre.
    for (let i = 0; i < skin.pos.length; i += 3) {
      const d = [skin.pos[i] - HC[0], skin.pos[i + 1] - HC[1], skin.pos[i + 2] - HC[2]];
      expect(d[0] * skin.nrm[i] + d[1] * skin.nrm[i + 1] + d[2] * skin.nrm[i + 2]).toBeGreaterThan(0);
    }
    // Eyes: exact mirror images, level.
    const e: AttrMesh = eyes(HC, { cx: 0.17, cy: -0.065, rx: 0.088, ry: 0.1, iris: [0.05, 0.03] }, false, true);
    const half = e.pos.length / 2;
    for (let i = 0; i < half; i += 3) {
      expect(e.pos[i]).toBeCloseTo(-e.pos[half + i], 6);
      expect(e.pos[i + 1]).toBeCloseTo(e.pos[half + i + 1], 6);
      expect(e.pos[i + 2]).toBeCloseTo(e.pos[half + i + 2], 6);
    }
    // The mouth is a flush decal (within 3 mm of the skin), never a lump.
    const m = mouth(HC, "smile", true);
    for (let i = 0; i < m.pos.length; i += 3) {
      const r = Math.hypot(m.pos[i] - HC[0], m.pos[i + 1] - HC[1], m.pos[i + 2] - HC[2]);
      expect(r).toBeLessThan(0.42);
    }
  });

  it("sculpts hair for every villager that sits under its hat", () => {
    for (const v of villagers) {
      const o = outfitFor(v);
      const fig = buildFigure(o);
      if (o.head?.kind === "headscarf") continue;
      expect(fig.hairPlan, v.id).toBeDefined();
      const { mesh } = hairMesh(fig.hairPlan!, true, fig.hatDist);
      // (Under a beanie or helmet only the band below the brim shows.)
      expect(mesh.tri.length / 3, v.id).toBeGreaterThan(150);
      // Hair hidden inside a hat is culled (only clump ends stay tucked in).
      let deep = 0;
      for (let i = 0; i < mesh.pos.length; i += 3) if (fig.hatDist([mesh.pos[i], mesh.pos[i + 1], mesh.pos[i + 2]]) < -0.03) deep++;
      expect(deep / (mesh.pos.length / 3), v.id).toBeLessThan(0.35);
    }
  });

  it("meshes an SDF and decimates it to budget", () => {
    const sphere = (x: number, y: number, z: number) => Math.hypot(x, y, z) - 0.2;
    const raw = surfaceNets(sphere, [-0.25, -0.25, -0.25], [0.25, 0.25, 0.25], 0.01);
    expect(raw.tri.length / 3).toBeGreaterThan(2000);
    const [low] = decimate(raw, [300], () => 1);
    expect(low.tri.length / 3).toBeLessThanOrEqual(300);
    for (let i = 0; i < low.pos.length; i += 3) expect(Math.abs(Math.hypot(low.pos[i], low.pos[i + 1], low.pos[i + 2]) - 0.2)).toBeLessThan(0.02);
  });

  it("keeps colour borders crisp: faces carry one label and the border stays a clean line", () => {
    const sphere = (x: number, y: number, z: number) => Math.hypot(x, y, z) - 0.2;
    const raw = surfaceNets(sphere, [-0.25, -0.25, -0.25], [0.25, 0.25, 0.25], 0.01);
    // Two materials split by the plane y = 0.03.
    const labelAt = (_x: number, y: number) => (y > 0.03 ? 1 : 0);
    // As the bake does: decimate, then cut exactly along the border.
    const [dec] = decimate(raw, [400], () => 1);
    const vlab = new Int32Array(dec.pos.length / 3);
    for (let i = 0; i < vlab.length; i++) vlab[i] = labelAt(dec.pos[i * 3], dec.pos[i * 3 + 1]);
    const low = cutByLabel(dec, vlab, labelAt);
    expect(low.tri.length / 3).toBeLessThanOrEqual(520);
    expect(low.lab.length).toBe(low.tri.length / 3);
    // Every border vertex (shared by both labels) lies on the border plane.
    const seen = new Map<number, Set<number>>();
    for (let t = 0; t < low.lab.length; t++)
      for (let c = 0; c < 3; c++) {
        const v = low.tri[t * 3 + c];
        if (!seen.has(v)) seen.set(v, new Set());
        seen.get(v)!.add(low.lab[t]);
      }
    let border = 0;
    for (const [v, ls] of seen) {
      if (ls.size < 2) continue;
      border++;
      expect(Math.abs(low.pos[v * 3 + 1] - 0.03)).toBeLessThan(0.004);
    }
    expect(border).toBeGreaterThan(8);
    // Each face is entirely on its own side.
    for (let t = 0; t < low.lab.length; t++) {
      const cy = (low.pos[low.tri[t * 3] * 3 + 1] + low.pos[low.tri[t * 3 + 1] * 3 + 1] + low.pos[low.tri[t * 3 + 2] * 3 + 1]) / 3;
      expect(cy > 0.03 ? 1 : 0).toBe(low.lab[t]);
    }
  });

  it("paints straps and garment openings as a few crisp shader shapes", () => {
    for (const v of villagers) {
      const o = outfitFor(v);
      const fig = buildFigure(o);
      expect(fig.paint.length, v.id).toBeLessThanOrEqual(28);
      for (const q of fig.paint) for (const x of [...q.a, ...q.b, q.r]) expect(Number.isFinite(x)).toBe(true);
      // Vests and open jackets show the shirt through a painted V.
      if (o.outer && ["vest", "jacket", "blazer", "labcoat", "cardigan"].includes(o.outer.kind)) expect(fig.paint.some((q) => q.t === 1), v.id).toBe(true);
      // Hanging styles are one closed mass (no gaps between locks).
      if (["bob", "long", "layered"].includes(fig.hairPlan ? o.hair.style : "")) expect(fig.hairPlan!.hood, v.id).toBeDefined();
    }
  });

  it.skipIf(!existsSync(castFile))("ships a baked cast within budget for every villager and the player", () => {
    const buf = readFileSync(castFile);
    const cast = new Cast(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    let hero = 0, mid = 0;
    const ids = ["player:hat", "player:bare", ...villagers.map((v) => v.id)];
    for (const id of ids) {
      expect(cast.has(id), id).toBe(true);
      hero += cast.triangles(id, "hero");
      mid += cast.triangles(id, "mid");
      expect(cast.triangles(id, "hero"), id).toBeLessThanOrEqual(9000);
      expect(cast.triangles(id, "mid"), id).toBeLessThanOrEqual(2500);
      expect(Object.keys(cast.manifest.chars[id].p).every((p) => PIECES.includes(p as never))).toBe(true);
    }
    expect(hero / ids.length).toBeLessThanOrEqual(9000);
    expect(mid / ids.length).toBeLessThanOrEqual(2500);
    // Worst case on high: 5 hero + 10 mid villagers + the hero player ≤ 80k.
    const maxHero = Math.max(...ids.map((id) => cast.triangles(id, "hero")));
    const maxMid = Math.max(...ids.map((id) => cast.triangles(id, "mid")));
    expect(5 * maxHero + 10 * maxMid + maxHero).toBeLessThanOrEqual(80000);
    // Payload: ≤2.0 MB gzipped.
    expect(gzipSync(buf).length).toBeLessThanOrEqual(2.0 * 1024 * 1024);
  });
});
