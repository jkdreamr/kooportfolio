import { it } from "vitest";
import { readFileSync } from "node:fs";
import { Cast } from "../src/game/world/character/sculpt/runtime";
it("dbg", () => {
  const buf = readFileSync("public/characters/cast-v1.bin");
  const cast = new Cast(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  for (const id of Object.keys(cast.manifest.chars)) {
    const m = cast.triangles(id, "mid"), h = cast.triangles(id, "hero");
    if (m > 2450 || h > 8950) { const c = cast.manifest.chars[id]; console.log("X", id, h, m, Object.entries(c.p).map(([k, v]) => `${k}:${cast.manifest.shapes[v![0]].i / 3}/${cast.manifest.shapes[v![1]].i / 3}`).join(" ")); }
  }
});
