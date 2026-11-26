#!/usr/bin/env node
// Harvest embed-safe candidates for a theater shard.
//
//   NODE_USE_ENV_PROXY=1 node scripts/harvest-theater.mjs --channel @BlueyOfficialChannel --match "Full Episode" --min 360
//   NODE_USE_ENV_PROXY=1 node scripts/harvest-theater.mjs --playlist PLxxxx --channel-id UCxxxx
//   NODE_USE_ENV_PROXY=1 node scripts/harvest-theater.mjs --search "pixar official trailer" --channel-id UC_IRYSp4auq7hKLvziWVH6w --max 330
//
// Options:
//   --channel @handle | UC…   uploads tab (also --tab shorts|streams; default videos)
//   --playlist PL…            first 100 videos of a playlist
//   --search "query"          first page of search results
//   --match <regex>           keep titles matching (case-insensitive)
//   --exclude <regex>         drop titles matching (case-insensitive)
//   --channel-id UC…          require this owner (checked against the embed page)
//   --min <sec> --max <sec>   duration window (listing duration, then embed duration)
//   --limit <n>               embed-check at most n candidates (default 40)
//   --json                    print JSON instead of paste rows
//
// Prints the channel header, then `["id","title"],` rows for embed-OK
// candidates, then a reject list with reasons. Every printed OK row passed the
// embed page + oEmbed checks that verify-theater.mjs runs.

import { parseArgs } from "node:util";
import {
  embedClass,
  embedInfo,
  fmtSeconds,
  listVideos,
  oembed,
  playlistVideos,
  search,
} from "./theater-lib.mjs";

const { values: a } = parseArgs({
  options: {
    channel: { type: "string" },
    tab: { type: "string", default: "videos" },
    playlist: { type: "string" },
    search: { type: "string" },
    match: { type: "string" },
    exclude: { type: "string" },
    "channel-id": { type: "string" },
    min: { type: "string" },
    max: { type: "string" },
    limit: { type: "string", default: "40" },
    json: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (a.help || (!a.channel && !a.playlist && !a.search)) {
  console.error('usage: harvest-theater.mjs (--channel @h | --playlist PL… | --search "q") [--match re] [--exclude re] [--channel-id UC…] [--min s] [--max s] [--limit n] [--json]');
  process.exit(a.help ? 0 : 2);
}

const match = a.match ? new RegExp(a.match, "i") : null;
const exclude = a.exclude ? new RegExp(a.exclude, "i") : null;
const min = a.min ? Number(a.min) : null;
const max = a.max ? Number(a.max) : null;
const limit = Number(a.limit);
const note = (line) => (a.json ? console.error : console.log)(line);
let wantChannel = a["channel-id"] ?? null;

let videos = [];
if (a.channel) {
  const { channel, videos: v } = await listVideos(a.channel, a.tab);
  note(`# Channel: ${channel.title}  ${channel.id}  ${channel.subscribers ?? "? subscribers"}  ${channel.verified ? "✓ verified" : "(no verified badge found)"}`);
  if (channel.url) note(`#   ${channel.url}`);
  wantChannel ??= channel.id;
  videos = v;
} else if (a.playlist) {
  const pl = await playlistVideos(a.playlist);
  note(`# Playlist: ${pl.title}  by ${pl.owner ?? "?"}  ${pl.ownerId ?? ""}  (${pl.videos.length} videos)`);
  videos = pl.videos;
} else {
  videos = await search(a.search);
  note(`# Search: ${a.search}  (${videos.length} results)`);
  const owners = new Map();
  for (const v of videos) if (v.channelId) owners.set(v.channelId, v.channel);
  for (const [id, name] of owners) note(`#   owner ${id}  ${name}`);
}
if (wantChannel) note(`# Requiring owner ${wantChannel}`);

const ok = [];
const rejects = [];
const reject = (v, why) => rejects.push({ id: v.id, title: v.title, seconds: v.seconds, why });
const inWindow = (s) => s == null || ((min == null || s >= min) && (max == null || s <= max));

const candidates = [];
for (const v of videos) {
  if (match && !match.test(v.title)) continue;
  if (exclude && exclude.test(v.title)) continue;
  if (!inWindow(v.seconds)) {
    reject(v, `duration ${fmtSeconds(v.seconds)} outside window`);
    continue;
  }
  if (wantChannel && v.channelId && v.channelId !== wantChannel) {
    reject(v, `listed owner ${v.channelId} (${v.channel})`);
    continue;
  }
  candidates.push(v);
}
if (candidates.length > limit) {
  note(`# ${candidates.length} candidates; checking first ${limit} (raise --limit for more)`);
}

for (const v of candidates.slice(0, limit)) {
  const e = await embedInfo(v.id);
  const cls = embedClass(e);
  if (cls !== "OK") {
    reject(v, `${cls}: ${e.reason ?? e.status}`);
    continue;
  }
  if (wantChannel && e.channelId !== wantChannel) {
    reject(v, `embed owner ${e.channelId ?? "?"} (${e.channel ?? "?"})`);
    continue;
  }
  if (!inWindow(e.seconds)) {
    reject(v, `embed duration ${fmtSeconds(e.seconds)} outside window`);
    continue;
  }
  const o = await oembed(v.id);
  if (o.status !== 200) {
    reject(v, `oEmbed ${o.status}`);
    continue;
  }
  if (!o.landscape) {
    reject(v, `portrait ${o.width}x${o.height} (Short)`);
    continue;
  }
  ok.push({ id: v.id, title: e.title || v.title, seconds: e.seconds, channelId: e.channelId, channel: e.channel });
}

if (a.json) {
  console.log(JSON.stringify({ ok, rejects }, null, 2));
} else {
  console.log(`\n# OK (${ok.length})  [id, title]  // duration · owner`);
  for (const v of ok) {
    console.log(`${JSON.stringify([v.id, v.title])},  // ${fmtSeconds(v.seconds)} · ${v.channel} ${v.channelId}`);
  }
  console.log(`\n# Rejected (${rejects.length})`);
  for (const r of rejects) console.log(`#   ${r.id}  ${fmtSeconds(r.seconds).padStart(7)}  ${r.why}  — ${r.title}`);
}
