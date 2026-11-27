// Bundle budget gate, run after `npm run build` (not part of it, so nobody's
// build breaks mid-change): `node scripts/check-budgets.mjs [distDir]`.
// Fails (exit 1) when, gzip level 9:
//   - the engine chunk is over 540 KB,
//   - the entry chunk is over 90 KB,
//   - all CSS together is over 42 KB,
//   - or a portfolio route's HTML loads the engine (script, link or preload).
// Prints one table either way.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const KB = 1024;
const BUDGET = { engine: 540 * KB, entry: 90 * KB, css: 42 * KB };
const arg = process.argv[2];
const root = arg ?? (existsSync("dist/client/index.html") ? "dist/client" : "dist");
const assets = join(root, "assets");
if (!existsSync(assets)) {
  console.error(`check-budgets: no build at ${root} (run npm run build first)`);
  process.exit(2);
}
const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length;
const files = readdirSync(assets);
const rows = [];
let failed = false;
const row = (name, bytes, budget, note = "") => {
  const ok = budget === null || bytes <= budget;
  if (!ok) failed = true;
  rows.push([name, bytes === null ? "-" : `${(bytes / KB).toFixed(1)} KB`, budget === null ? "-" : `${(budget / KB).toFixed(0)} KB`, ok ? "ok" : "OVER", note]);
};

const engine = files.filter((f) => /^engine-[\w-]+\.js$/.test(f));
if (engine.length !== 1) {
  failed = true;
  rows.push(["engine chunk", "-", "-", "MISSING", `found ${engine.length}`]);
} else row("engine chunk (gzip)", gz(join(assets, engine[0])), BUDGET.engine, engine[0]);

const home = readFileSync(join(root, "index.html"), "utf8");
const entry = home.match(/<script type="module"[^>]*src="\/assets\/([^"]+\.js)"/)?.[1];
if (!entry) {
  failed = true;
  rows.push(["entry chunk", "-", "-", "MISSING", "no module script in index.html"]);
} else row("entry chunk (gzip)", gz(join(assets, entry)), BUDGET.entry, entry);

const css = files.filter((f) => f.endsWith(".css"));
row("all CSS (gzip)", css.reduce((sum, f) => sum + gz(join(assets, f)), 0), BUDGET.css, css.join(", "));

// Portfolio routes may mention the engine's file names inside the /play
// preload list of the inline script, but must never load them.
const loads = /<(?:script|link)\b[^>]*(?:src|href)="[^"]*\/assets\/(?:engine|three\.core|paperBridge)-[^"]*"/;
for (const route of ["index.html", "about/index.html", "work/index.html", "contact/index.html"]) {
  const file = join(root, route);
  if (!existsSync(file)) {
    failed = true;
    rows.push([`/${route.replace(/index\.html$/, "")}`, "-", "-", "MISSING", "not prerendered"]);
    continue;
  }
  const html = readFileSync(file, "utf8");
  const bad = loads.test(html);
  if (bad) failed = true;
  rows.push([`/${route.replace(/index\.html$/, "")} HTML`, `${(gz(file) / KB).toFixed(1)} KB`, "-", bad ? "LOADS ENGINE" : "ok", bad ? html.match(loads)[0] : "no engine"]);
}

const widths = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => r[i].length), 6));
for (const r of [["item", "size", "budget", "status", "note"], ...rows])
  console.log(r.slice(0, 4).map((c, i) => c.padEnd(widths[i])).join("  ") + "  " + r[4]);
if (failed) {
  console.error("check-budgets: FAILED");
  process.exit(1);
}
console.log("check-budgets: all within budget");
