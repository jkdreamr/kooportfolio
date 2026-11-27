import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { villagers } from "../src/game/core/npcs";
import { outfitFor } from "../src/game/world/character/cast";
import { mix, shade } from "../src/game/world/character/outfit";
import { buildFigure, outfitPalette } from "../src/game/world/character/sculpt/figure";
import { evalOps, pieceBounds } from "../src/game/world/character/sculpt/sdf";
import { eyes, headSkin, mouth, type AttrMesh } from "../src/game/world/character/sculpt/head";
import { decimate, surfaceNets } from "../src/game/world/character/sculpt/mesher";
import { Cast, PIECES } from "../src/game/world/character/sculpt/runtime";

const castFile = "public/characters/cast-v1.bin";

describe("sculpted characters (F3)", () => {
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

  it("meshes an SDF and decimates it to budget", () => {
    const sphere = (x: number, y: number, z: number) => Math.hypot(x, y, z) - 0.2;
    const raw = surfaceNets(sphere, [-0.25, -0.25, -0.25], [0.25, 0.25, 0.25], 0.01);
    expect(raw.tri.length / 3).toBeGreaterThan(2000);
    const [low] = decimate(raw, [300], () => 1);
    expect(low.tri.length / 3).toBeLessThanOrEqual(300);
    for (let i = 0; i < low.pos.length; i += 3) expect(Math.abs(Math.hypot(low.pos[i], low.pos[i + 1], low.pos[i + 2]) - 0.2)).toBeLessThan(0.02);
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
      expect(cast.triangles(id, "hero"), id).toBeLessThanOrEqual(9500);
      expect(cast.triangles(id, "mid"), id).toBeLessThanOrEqual(5100);
      expect(Object.keys(cast.manifest.chars[id].p).every((p) => PIECES.includes(p as never))).toBe(true);
    }
    expect(hero / ids.length).toBeLessThanOrEqual(8000);
    expect(mid / ids.length).toBeLessThanOrEqual(2500);
    // Payload: ≤1.5 MB gzipped.
    expect(gzipSync(buf).length).toBeLessThanOrEqual(1.5 * 1024 * 1024);
  });
});
