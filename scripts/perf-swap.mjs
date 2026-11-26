#!/usr/bin/env node
// Engine soak: program links, long tasks, WebGL contexts, heap and GPU memory
// across repeated hub ⇄ interior scene swaps on the dev server.
//
//   node scripts/perf-swap.mjs [baseUrl=http://127.0.0.1:5173] [swaps=20] [out.json]
//
// Runs in Chromium (SwiftShader in CI containers): read CPU-side numbers —
// linkProgram calls, long tasks, draw calls — not real-GPU frame rates.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:5173";
const swaps = Number(process.argv[3] ?? 20);
const out = process.argv[4];
const executablePath =
  process.env.CHROME ??
  "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";

const browser = await chromium.launch({
  executablePath,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--enable-precise-memory-info",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 200));
});
await page.addInitScript(() => {
  localStorage.setItem(
    "joshua-exe-save-v1",
    JSON.stringify({
      version: 1,
      revision: 0,
      coins: 0,
      xp: 0,
      position: [0, 5],
      world: "home",
      upgrades: { boathouse: 1, garden: 1 },
      color: "#6f8670",
      hat: true,
      bestRace: null,
      bestBasket: 0,
      memories: [],
      rewards: [],
    }),
  );
  const probe = (window.__perfProbe = {
    contexts: 0,
    links: 0,
    compiles: 0,
    longTasks: [],
    lost: 0,
  });
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const known = this.__probed;
    const result = getContext.call(this, type, ...rest);
    if (result && /webgl/.test(type) && !known) {
      this.__probed = true;
      probe.contexts++;
      this.addEventListener("webglcontextlost", () => probe.lost++);
    }
    return result;
  };
  for (const Ctx of [
    window.WebGL2RenderingContext,
    window.WebGLRenderingContext,
  ]) {
    if (!Ctx) continue;
    const link = Ctx.prototype.linkProgram;
    Ctx.prototype.linkProgram = function (program) {
      probe.links++;
      return link.call(this, program);
    };
    const compile = Ctx.prototype.compileShader;
    Ctx.prototype.compileShader = function (shader) {
      probe.compiles++;
      return compile.call(this, shader);
    };
  }
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      probe.longTasks.push([
        Math.round(entry.startTime),
        Math.round(entry.duration),
      ]);
  }).observe({ type: "longtask", buffered: true });
});

const t0 = Date.now();
await page.goto(`${base}/play`, { waitUntil: "load" });
await page.waitForSelector("canvas", { timeout: 120000 });
// Ready: the engine's flag when present, else frames flowing for 3 s.
await page
  .waitForFunction(
    async () => {
      try {
        const { useStage } = await import("/src/stage/contract.ts");
        return useStage.getState().ready;
      } catch {
        return (window.__joshuaPerf?.frames.length ?? 0) > 20;
      }
    },
    null,
    { timeout: 180000, polling: 500 },
  )
  .catch(() => {});
await page.waitForTimeout(4000);
const readyMs = Date.now() - t0;

const snapshot = () =>
  page.evaluate(() => {
    const p = window.__perfProbe;
    const j = window.__joshuaPerf;
    const heap = performance.memory?.usedJSHeapSize ?? 0;
    return {
      t: Math.round(performance.now()),
      links: p.links,
      compiles: p.compiles,
      contexts: p.contexts,
      lost: p.lost,
      longTasks: p.longTasks.length,
      heapMB: +(heap / 1048576).toFixed(1),
      calls: j?.calls ?? 0,
      tris: j?.triangles ?? 0,
      geometries: j?.geometries ?? 0,
      textures: j?.textures ?? 0,
      programs: j?.programs ?? null,
    };
  });

const ready = await snapshot();
const interiors = ["boathouse", "office", "kitchen", "gym", "kappa", "cognition"];
const rows = [];
for (let i = 0; i < swaps; i++) {
  const target = interiors[i % interiors.length];
  for (const scene of [target, "hub"]) {
    const before = await snapshot();
    await page.evaluate(async (scene) => {
      const { useGame } = await import("/src/game/core/store.ts");
      useGame.getState().go(scene);
    }, scene);
    await page.waitForTimeout(2500);
    const after = await snapshot();
    const lt = await page.evaluate(
      (since) => window.__perfProbe.longTasks.filter(([s]) => s >= since),
      before.t,
    );
    rows.push({
      swap: i,
      scene,
      links: after.links - before.links,
      longest: Math.max(0, ...lt.map(([, d]) => d)),
      longTasks: lt.length,
      geometries: after.geometries,
      textures: after.textures,
      heapMB: after.heapMB,
      calls: after.calls,
      tris: after.tris,
    });
  }
}
const end = await snapshot();
const hubRows = rows.filter((r) => r.scene === "hub");
const summary = {
  base,
  readyMs,
  atReady: ready,
  atEnd: end,
  linksAfterReady: end.links - ready.links,
  linksPerHubReturn: hubRows.map((r) => r.links),
  linksPerInteriorEntry: rows.filter((r) => r.scene !== "hub").map((r) => r.links),
  longestTaskMsAfterReady: Math.max(0, ...rows.map((r) => r.longest)),
  longTasksOver50AfterReady: rows.reduce((n, r) => n + r.longTasks, 0),
  geometriesFirstLastHub: [hubRows[0]?.geometries, hubRows.at(-1)?.geometries],
  texturesFirstLastHub: [hubRows[0]?.textures, hubRows.at(-1)?.textures],
  heapFirstLastHubMB: [hubRows[0]?.heapMB, hubRows.at(-1)?.heapMB],
  hubCallsTris: [hubRows.at(-1)?.calls, hubRows.at(-1)?.tris],
  errors: [...new Set(errors)].slice(0, 10),
};
console.log(JSON.stringify(summary, null, 2));
if (out) writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
await browser.close();
