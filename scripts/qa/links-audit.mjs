// Links audit: every external URL in src/ and index.html, checked against
// the owner's own site repo (the source of truth for his links).
//
//   node scripts/qa/links-audit.mjs [--owner=/home/user/jkdreamr/josh] [--json=<file>]
//
// The container cannot reach the internet, so nothing is fetched. A URL is
// "ok" when it appears byte for byte in the owner's src/os/data.ts or
// src/os/apps/Notes.tsx (anywhere in his src/ is reported as "owner-other").
// Also reports: URLs that match only after normalising (www., trailing
// slash, case), http: links, and <a target="_blank"> without rel="noopener"
// or "noreferrer", or with target="_blank" on a same-site link.
// Exit code 1 if any link is a mismatch or has a rel/target problem.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { args } from "./lib.mjs";

const arg = args("LINKS");
const OWNER = arg("owner", "/home/user/jkdreamr/josh");
const URL_RE = /(?:https?:\/\/|mailto:)[^\s"'`<>)\\]+/g;

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) walk(file, out);
    else if (/\.(tsx?|mjs|js|html|css|json)$/.test(name)) out.push(file);
  }
  return out;
};
const urlsIn = (file) => {
  const found = [];
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      for (const match of line.matchAll(URL_RE)) {
        const url = match[0].replace(/[.,;:]+$/, "");
        // XML namespaces and template fragments are not links.
        if (/w3\.org|\$\{|\$$/.test(url) || /^https?:\/\/$/.test(url)) continue;
        found.push({ file, line: index + 1, url });
      }
    });
  return found;
};
const normal = (url) =>
  url
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/+$/, "");

const ours = [...walk("src"), "index.html"].flatMap(urlsIn);
const primary = ["src/os/data.ts", "src/os/apps/Notes.tsx"].map((f) => path.join(OWNER, f));
if (!primary.every(existsSync)) {
  console.error(`links-audit: owner repo not found at ${OWNER} (pass --owner=<path>)`);
  process.exit(2);
}
const ownerPrimary = new Set(primary.flatMap(urlsIn).map((u) => u.url));
const ownerAll = new Set(walk(path.join(OWNER, "src")).flatMap(urlsIn).map((u) => u.url));
const ownerNormal = new Map([...ownerAll].map((u) => [normal(u), u]));
const ownerEmail = /email:\s*'([^']+)'/.exec(readFileSync(primary[0], "utf8"))?.[1];

const rows = ours.map(({ file, line, url }) => {
  let status = "not-in-owner-repo";
  let note = "";
  if (url.startsWith("mailto:")) {
    status = url === `mailto:${ownerEmail}` ? "ok" : "mismatch";
    note = status === "ok" ? "" : `owner email is ${ownerEmail}`;
  } else if (ownerPrimary.has(url)) status = "ok";
  else if (ownerAll.has(url)) status = "owner-other";
  else if (ownerNormal.has(normal(url))) {
    status = "mismatch";
    note = `owner has ${ownerNormal.get(normal(url))}`;
  }
  if (url.startsWith("http://")) note += `${note ? "; " : ""}plain http`;
  return { where: `${file}:${line}`, url, status, note };
});

// The address the code builds (`mailto:${profile.email}`) never appears as a
// literal: check the one place it is defined.
const profile = readFileSync("src/content/profile.ts", "utf8");
const email = /email:\s*"([^"]+)"/.exec(profile)?.[1];
rows.push({
  where: "src/content/profile.ts (email)",
  url: `mailto:${email}`,
  status: email === ownerEmail ? "ok" : "mismatch",
  note: email === ownerEmail ? "" : `owner email is ${ownerEmail}`,
});

/* ----------------------------------------------------- <a> rel / target */
const anchors = [];
for (const file of walk("src").filter((f) => f.endsWith(".tsx"))) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/<a\b[^>]*?>/gs)) {
    const tag = match[0];
    const line = text.slice(0, match.index).split("\n").length;
    const blank = /target="_blank"/.test(tag);
    const rel = /rel="([^"]*)"/.exec(tag)?.[1] ?? "";
    const href = /href=(?:"([^"]*)"|\{([^}]*)\})/.exec(tag);
    const literal = href?.[1];
    const internal = literal ? literal.startsWith("/") || literal.startsWith("#") : false;
    const external = literal ? /^https?:/.test(literal) : !!href?.[2] && !/mailto/.test(href[2]);
    const problems = [];
    if (blank && !/noopener|noreferrer/.test(rel)) problems.push('target="_blank" without rel="noopener"');
    if (blank && internal) problems.push('same-site link opens a new tab (target="_blank")');
    if (!blank && external && literal) problems.push("external link replaces the page (no target)");
    if (problems.length) anchors.push({ where: `${file}:${line}`, href: literal ?? `{${href?.[2] ?? "?"}}`, problems });
  }
}

const bad = rows.filter((r) => r.status === "mismatch");
const unknown = rows.filter((r) => r.status === "not-in-owner-repo");
const width = Math.max(...rows.map((r) => r.where.length));
console.log(`links-audit: ${rows.length} URL occurrences in src/ and index.html, owner repo ${OWNER}\n`);
for (const r of rows)
  console.log(`${r.status.padEnd(18)} ${r.where.padEnd(width)}  ${r.url.length > 90 ? `${r.url.slice(0, 87)}...` : r.url}${r.note ? `   <- ${r.note}` : ""}`);
console.log(`\nanchors with rel/target problems: ${anchors.length}`);
for (const a of anchors) console.log(`  ${a.where}  href=${a.href}  ${a.problems.join("; ")}`);
console.log(
  `\n${rows.filter((r) => r.status === "ok").length} ok, ${rows.filter((r) => r.status === "owner-other").length} elsewhere in the owner repo, ${bad.length} mismatch, ${unknown.length} not in the owner repo`,
);
const json = arg("json");
if (json) writeFileSync(json, JSON.stringify({ rows, anchors }, null, 1));
process.exit(bad.length || anchors.length ? 1 : 0);
