// Offline character bake (no network, no runtime cost): bundles the sculpt
// with esbuild, runs it across worker threads, writes
// public/characters/cast-v1.bin.
//   node scripts/bake-characters.mjs [--out file] [--only id,id] [--workers n]
import { build } from "esbuild";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { tmpdir, availableParallelism } from "node:os";
import { join, dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

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
const url = pathToFileURL(entry).href;
const { castList, packParts } = await import(url);
const t0 = Date.now();
const ids = castList(only).map((c) => c.id);
const n = Math.max(1, Math.min(ids.length, +(opt("--workers") ?? availableParallelism())));
const groups = Array.from({ length: n }, (_, k) => ids.filter((_, i) => i % n === k));
const workerFile = join(dir, "worker.mjs");
writeFileSync(workerFile, `
import { parentPort, workerData } from "node:worker_threads";
const { bakePart } = await import(workerData.url);
const part = bakePart(workerData.ids, (s) => parentPort.postMessage({ log: s }));
parentPort.postMessage({ part });
`);
const { bakePart } = await import(url);
const parts = n === 1 ? [bakePart(ids)] : await Promise.all(groups.map((group) => new Promise((res, rej) => {
  const w = new Worker(workerFile, { workerData: { url, ids: group } });
  w.on("message", (m) => { if (m.log) console.log(m.log); else res(m.part); });
  w.on("error", rej);
})));
const r = packParts(parts);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, r.bytes);
console.log(`wrote ${out}: ${(r.bytes.length / 1024).toFixed(0)} KB raw, ${(gzipSync(r.bytes).length / 1024).toFixed(0)} KB gzip; ${r.shapes} shapes, ${r.vertices} vertices, ${r.triangles} triangles; ${((Date.now() - t0) / 1000).toFixed(0)} s with ${n} workers`);
process.exit(0);
