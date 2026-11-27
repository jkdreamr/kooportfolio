// Offline character bake (no network, no runtime cost): bundles the sculpt
// with esbuild, runs it, writes public/characters/cast-v1.bin.
//   node scripts/bake-characters.mjs [--out file] [--only id,id]
import { build } from "esbuild";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const out = resolve(opt("--out") ?? join(root, "public/characters/cast-v1.bin"));
const only = opt("--only")?.split(",");
const dir = mkdtempSync(join(tmpdir(), "bake-"));
const entry = join(dir, "bake.mjs");
await build({
  entryPoints: [join(root, "src/game/world/character/sculpt/bake.ts")],
  bundle: true, platform: "node", format: "esm", outfile: entry, logLevel: "warning",
  define: { "import.meta.env": "{}" },
});
const { bake } = await import(pathToFileURL(entry).href);
const t0 = Date.now();
const r = bake(console.log, only);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, r.bytes);
console.log(`wrote ${out}: ${(r.bytes.length / 1024).toFixed(0)} KB raw, ${(gzipSync(r.bytes).length / 1024).toFixed(0)} KB gzip; ${r.shapes} shapes, ${r.vertices} vertices, ${r.triangles} triangles; ${((Date.now() - t0) / 1000).toFixed(0)} s`);
