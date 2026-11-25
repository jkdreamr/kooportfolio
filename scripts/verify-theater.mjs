#!/usr/bin/env node
// Verify theater shards against live YouTube.
//
//   npm run verify:theater                                   # all shards
//   npm run verify:theater -- --shard src/game/core/theater/korea-idol-web.ts
//   npm run verify:theater -- --shard a.ts --shard b.ts --only o2E2wLm_LlY
//
// Per film: embed page status (OK / GEO / AGE / EMBED_DISABLED / GONE),
// embed owner channelId === CHANNELS[film.channel], oEmbed 200 and
// landscape (width >= height, so no Shorts), duration window by kind, and
// duplicate IDs across all shards (always checked across every shard, even
// with --shard). Exits 1 on any non-exempt failure.

import { readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { KIND_LIMITS, embedClass, embedInfo, fmtSeconds, oembed } from "./theater-lib.mjs";

// Geo-blocked from this US egress; owner region unconfirmed. Their embed page
// carries no owner/duration, so channel and duration checks are skipped too.
export const GEO_EXEMPT = new Set(["o2E2wLm_LlY", "fLWBx37eKBM", "XcOWOLX1z14", "DViUDJuFPhQ", "XX3uta-AuEg"]);

const SHARD_DIR = resolve(import.meta.dirname, "../src/game/core/theater");

const { values: a } = parseArgs({
  options: {
    shard: { type: "string", multiple: true },
    only: { type: "string", multiple: true },
    quiet: { type: "boolean", short: "q", default: false },
  },
});

const allShards = readdirSync(SHARD_DIR)
  .filter((f) => f.endsWith(".ts") && f !== "types.ts" && !f.endsWith(".test.ts"))
  .map((f) => join(SHARD_DIR, f));
const targets = a.shard?.length ? a.shard.map((p) => resolve(p)) : allShards;

const loaded = new Map();
async function load(path) {
  if (!loaded.has(path)) {
    const m = await import(pathToFileURL(path).href);
    if (!m.FILMS || !m.CHANNELS) throw new Error(`${path} must export CHANNELS and FILMS`);
    loaded.set(path, m);
  }
  return loaded.get(path);
}

// Duplicate IDs across every shard (and within one).
const seen = new Map();
const dupes = new Map();
for (const path of new Set([...allShards, ...targets])) {
  const { FILMS } = await load(path);
  for (const f of FILMS) {
    const where = `${basename(path)}:${f.title} · ${f.episode}`;
    if (seen.has(f.id)) dupes.set(f.id, [...(dupes.get(f.id) ?? [seen.get(f.id)]), where]);
    else seen.set(f.id, where);
  }
}

const rows = [];
let failures = 0;
let exempt = 0;

for (const path of targets) {
  const { CHANNELS, FILMS } = await load(path);
  const shard = basename(path);
  for (const [name, id] of Object.entries(CHANNELS)) {
    if (!/^UC[\w-]{22}$/.test(id)) {
      rows.push({ shard, id: "-", film: `CHANNELS["${name}"]`, embed: "-", secs: "-", problems: [`bad channel ID ${id}`] });
      failures++;
    }
  }
  for (const f of FILMS) {
    if (a.only?.length && !a.only.includes(f.id)) continue;
    const problems = [];
    if (!/^[\w-]{11}$/.test(f.id)) problems.push("bad video ID");
    if (dupes.has(f.id)) problems.push(`DUPLICATE: ${dupes.get(f.id).join(" | ")}`);
    const wantChannel = CHANNELS[f.channel];
    if (!wantChannel) problems.push(`channel "${f.channel}" not in CHANNELS`);
    const limits = KIND_LIMITS[f.kind];
    if (!limits) problems.push(`unknown kind "${f.kind}"`);

    const e = await embedInfo(f.id);
    const cls = embedClass(e);
    const isExempt = GEO_EXEMPT.has(f.id) && cls === "GEO";
    if (cls !== "OK" && !isExempt) problems.push(`${cls}: ${e.reason ?? e.status}`);
    if (cls === "OK") {
      if (wantChannel && e.channelId !== wantChannel) {
        problems.push(`owner ${e.channelId ?? "?"} (${e.channel ?? "?"}) ≠ ${wantChannel}`);
      }
      if (limits && (e.seconds == null || e.seconds < limits[0] || e.seconds > limits[1])) {
        problems.push(`${f.kind} duration ${fmtSeconds(e.seconds)} outside ${limits[0]}–${limits[1] === Infinity ? "∞" : limits[1]} s`);
      }
    }
    const o = await oembed(f.id);
    if (o.status !== 200) problems.push(`oEmbed ${o.status}`);
    else if (!o.landscape) problems.push(`portrait ${o.width}x${o.height} (Short)`);

    if (problems.length) failures++;
    else if (isExempt) exempt++;
    rows.push({
      shard,
      id: f.id,
      film: `${f.title} · ${f.episode}`,
      embed: isExempt ? "GEO*" : cls,
      secs: fmtSeconds(e.seconds),
      problems,
    });
    if (!a.quiet) {
      const r = rows.at(-1);
      process.stderr.write(`${r.problems.length ? "✗" : "✓"} ${r.id} ${r.embed} ${r.film}${r.problems.length ? `  — ${r.problems.join("; ")}` : ""}\n`);
    }
  }
}

const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
console.log(`\n${cut("shard", 24)} ${cut("id", 11)} ${cut("embed", 14)} ${"dur".padStart(8)}  ${cut("film", 48)} result`);
for (const r of rows) {
  console.log(
    `${cut(r.shard, 24)} ${cut(r.id, 11)} ${cut(r.embed, 14)} ${r.secs.padStart(8)}  ${cut(r.film, 48)} ${r.problems.length ? `FAIL ${r.problems.join("; ")}` : "ok"}`,
  );
}
console.log(`\n${rows.length} checked · ${rows.length - failures} ok (${exempt} geo-exempt*) · ${failures} failing`);
process.exit(failures ? 1 : 0);
