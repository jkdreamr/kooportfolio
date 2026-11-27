// Writes public/characters/*.bin.gz next to each baked cast file so the game
// can fetch the small compressed copy (see sculpt/runtime.ts). Runs before
// `vite build`, which copies public/ into the output. No network, no deps.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync, constants } from "node:zlib";

const dir = new URL("../public/characters/", import.meta.url).pathname;
let files = [];
try {
  files = readdirSync(dir).filter((f) => f.endsWith(".bin"));
} catch {
  /* no baked cast */
}
for (const f of files) {
  const raw = readFileSync(join(dir, f));
  const gz = gzipSync(raw, { level: constants.Z_BEST_COMPRESSION });
  writeFileSync(join(dir, `${f}.gz`), gz);
  console.log(`gzip-cast: ${f} ${raw.length} -> ${gz.length} bytes`);
}
