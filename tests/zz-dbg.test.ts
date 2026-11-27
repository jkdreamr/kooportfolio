import { it } from "vitest";
import { villagers } from "../src/game/core/npcs";
import { outfitFor } from "../src/game/world/character/cast";
import { buildFigure } from "../src/game/world/character/sculpt/figure";
import { evalOps, pieceBounds, pad, type Hit } from "../src/game/world/character/sculpt/sdf";
import { surfaceNets, decimate, type RawMesh } from "../src/game/world/character/sculpt/mesher";
const vol = (m: RawMesh) => { let v = 0; for (let t = 0; t < m.tri.length; t += 3) { const a = m.tri[t] * 3, b = m.tri[t + 1] * 3, c = m.tri[t + 2] * 3; const P = m.pos; v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]); } return v / 6; };
it("dbg", () => {
  const fig = buildFigure(outfitFor(villagers.find((v) => v.id === "rower")!));
  const ops = fig.pieces.chest!.ops;
  const f = (x: number, y: number, z: number) => evalOps(ops, [x, y, z], null);
  for (const h of [0.0084, 0.0056]) {
    const bb = pad(pieceBounds({ ops }), h * 4);
    const raw = surfaceNets(f, bb.min, bb.max, h);
    const hit: Hit = { d: 0, m: null };
    const slots = new Int32Array(raw.pos.length / 3);
    for (let i = 0; i < slots.length; i++) { evalOps(ops, [raw.pos[i * 3], raw.pos[i * 3 + 1], raw.pos[i * 3 + 2]], hit); slots[i] = hit.m!.slot; }
    const [d] = decimate(raw, [1050], () => 1, slots);
    console.log(h, raw.tri.length / 3, raw.pos.length / 3, vol(raw).toFixed(5), d.tri.length / 3, vol(d).toFixed(5), bb.min, bb.max);
  }
}, 300000);
