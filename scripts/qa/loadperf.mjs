#!/usr/bin/env node
// Load performance on a slow connection: "/" and "/play" over CDP network
// throttling ("Slow 4G": 1.6 Mbit/s down, 750 kbit/s up, 150 ms round trip),
// cold cache, served gzip-compressed (level 9) as a CDN would.
//
//   npm run qa:loadperf [-- --dist=dist/client] [--out=<dir>] [--runs=3]
//
// Reports, median of the runs:
//   /       FCP, LCP, LCP − FCP, CLS, TBT (long tasks − 50 ms until the
//           page is quiet), requests and transfer bytes
//   /play   the same, plus two marks: "loading mark" (first paint of the
//           JOSHUA.EXE mark) and "interactive world" (HUD revealed), with
//           the bytes transferred by each
// against the budgets of PLAN_FINAL §0.2 / A2 / A10:
//   portfolio ≤ 95 KB and 3 requests, no engine before intent, CLS ≤ 0.02,
//   LCP − FCP ≤ 50 ms; /play critical-path JS ≤ 730 KB gzip.
//
// Read the numbers for what they are: the network is throttled, the CPU is
// whatever this machine has, and WebGL is software (SwiftShader). Transfer
// sizes, request counts, CLS and the portfolio's paint times are faithful.
// /play's time to an interactive world and its TBT are dominated by
// software rendering and are NOT what a phone with a GPU sees.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { args, launch, serve } from "./lib.mjs";

const arg = args("QA");
const OUT = path.resolve(String(arg("out", "test-results/qa/loadperf")));
const RUNS = Number(arg("runs", 3));
mkdirSync(OUT, { recursive: true });
const server = await serve({ dir: String(arg("dist", "dist/client")), port: Number(arg("port", 0)), gzip: true });
const BASE = server.base;
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const KB = 1024;

function observe() {
  const M = (window.__m = { fcp: null, lcp: null, cls: 0, long: [], mark: null });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.name === "first-contentful-paint") M.fcp = e.startTime;
  }).observe({ type: "paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) M.lcp = { at: e.startTime, size: e.size, el: e.element?.tagName ?? e.url ?? "?" };
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) M.cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) M.long.push([e.startTime, e.duration]);
  }).observe({ type: "longtask", buffered: true });
}

async function run(route, { play }) {
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await context.addInitScript(observe);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
    const requests = new Map();
    let bytes = 0;
    cdp.on("Network.requestWillBeSent", (e) => requests.set(e.requestId, { url: e.request.url.replace(BASE, ""), bytes: 0 }));
    cdp.on("Network.loadingFinished", (e) => {
      const r = requests.get(e.requestId);
      if (r) r.bytes = e.encodedDataLength;
      bytes += e.encodedDataLength;
    });
    const t0 = Date.now();
    await page.goto(BASE + route, { waitUntil: "load", timeout: 300000 });
    const marks = {};
    if (play) {
      // The loading mark is CSS on <body>; its paint is the page's FCP.
      await page.waitForFunction(() => window.__m.fcp !== null, null, { timeout: 300000 });
      marks.loadingMark = { ms: Math.round(await page.evaluate(() => window.__m.fcp)), bytes };
      await page.waitForFunction(() => document.querySelector(".game-shell")?.dataset.hud === "revealed", null, { timeout: 900000, polling: 250 });
      marks.interactiveWorld = { ms: Date.now() - t0, bytes };
      await page.waitForTimeout(3000);
    } else await page.waitForTimeout(5000);
    const m = await page.evaluate(() => window.__m);
    const end = play ? marks.interactiveWorld.ms : Infinity;
    const tbt = m.long.filter(([start]) => start >= m.fcp && start <= end).reduce((sum, [, d]) => sum + Math.max(0, d - 50), 0);
    const list = [...requests.values()];
    const js = list.filter((r) => /\.js$/.test(r.url)).reduce((sum, r) => sum + r.bytes, 0);
    return { fcp: m.fcp, lcp: m.lcp?.at, lcpEl: m.lcp?.el, cls: m.cls, tbt, requests: list.length, bytes, js, marks, list, engine: list.filter((r) => /engine|three\.core|cast/.test(r.url)).map((r) => r.url) };
  } finally {
    await browser.close();
  }
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const result = {};
for (const [route, play] of [["/", false], ["/about", false], ["/work", false], ["/contact", false], ["/play", true]]) {
  const runs = [];
  for (let i = 0; i < (play ? Math.min(RUNS, 2) : RUNS); i++) runs.push(await run(route, { play }));
  const pick = (f) => median(runs.map(f));
  result[route] = {
    fcp: Math.round(pick((r) => r.fcp)),
    lcp: Math.round(pick((r) => r.lcp)),
    lcpMinusFcp: Math.round(pick((r) => r.lcp - r.fcp)),
    lcpElement: runs[0].lcpEl,
    cls: +pick((r) => r.cls).toFixed(4),
    tbt: Math.round(pick((r) => r.tbt)),
    requests: pick((r) => r.requests),
    transferKB: +(pick((r) => r.bytes) / KB).toFixed(1),
    jsKB: +(pick((r) => r.js) / KB).toFixed(1),
    engineRequests: runs[0].engine,
    ...(play
      ? {
          loadingMarkMs: pick((r) => r.marks.loadingMark.ms),
          loadingMarkKB: +(pick((r) => r.marks.loadingMark.bytes) / KB).toFixed(1),
          interactiveMs: pick((r) => r.marks.interactiveWorld.ms),
          interactiveKB: +(pick((r) => r.marks.interactiveWorld.bytes) / KB).toFixed(1),
        }
      : {}),
    requestList: runs[0].list,
  };
  console.log(`${route}: ${JSON.stringify({ ...result[route], requestList: undefined })}`);
}
server.close();

const checks = [];
const check = (name, value, budget, ok) => checks.push({ name, value, budget, ok });
for (const route of ["/", "/about", "/work", "/contact"]) {
  const r = result[route];
  check(`${route} transfer`, `${r.transferKB} KB`, "≤ 95 KB", r.transferKB <= 95);
  check(`${route} requests`, r.requests, "≤ 3", r.requests <= 3);
  check(`${route} engine before intent`, r.engineRequests.length, "0", r.engineRequests.length === 0);
  check(`${route} CLS`, r.cls, "≤ 0.02", r.cls <= 0.02);
  check(`${route} LCP − FCP`, `${r.lcpMinusFcp} ms`, "≤ 50 ms", r.lcpMinusFcp <= 50);
}
const p = result["/play"];
check("/play CLS", p.cls, "≤ 0.02", p.cls <= 0.02);
check("/play critical-path JS (gzip)", `${p.jsKB} KB`, "≤ 730 KB", p.jsKB <= 730);
const lines = [
  `loadperf: Slow 4G (1.6 Mbit/s, 150 ms RTT), 390×844 DPR 3, gzip, cold cache, median of ${RUNS}`,
  "",
  "route      FCP     LCP     LCP−FCP  CLS     TBT      req  transfer",
  ...Object.entries(result).map(([route, r]) => `${route.padEnd(10)} ${`${r.fcp} ms`.padEnd(7)} ${`${r.lcp} ms`.padEnd(7)} ${`${r.lcpMinusFcp} ms`.padEnd(8)} ${String(r.cls).padEnd(7)} ${`${r.tbt} ms`.padEnd(8)} ${String(r.requests).padEnd(4)} ${r.transferKB} KB`),
  "",
  `/play marks: loading mark at ${p.loadingMarkMs} ms (${p.loadingMarkKB} KB), interactive world at ${(p.interactiveMs / 1000).toFixed(1)} s (${p.interactiveKB} KB; software WebGL, see the note in the script)`,
  "",
  ...checks.map((c) => `${c.ok ? "PASS" : "FAIL"}  ${c.name.padEnd(34)} ${String(c.value).padEnd(10)} budget ${c.budget}`),
];
console.log(`\n${lines.join("\n")}`);
writeFileSync(path.join(OUT, "loadperf.json"), JSON.stringify({ result, checks }, null, 1));
writeFileSync(path.join(OUT, "loadperf.txt"), `${lines.join("\n")}\n`);
process.exit(checks.some((c) => !c.ok) ? 1 : 0);
