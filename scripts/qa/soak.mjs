#!/usr/bin/env node
// Soak test: a long session in /play that cycles every world, room and game,
// then the lifecycle events a real device throws at a WebGL page.
//
//   npm run qa:soak [-- --minutes=10] [--cycles=9] [--only=soak|lifecycle]
//                   [--base=<url> | --dist=dist/client] [--out=<dir>]
//                   [--game=960x600]
// It runs for --minutes and until --cycles cycles are done (nine = three
// visits to each world, the least that growth can be judged on), capped at
// six times --minutes on a machine too slow to get there.
//
// Needs a production build with the QA handles (see scripts/qa/smoke.mjs).
//
// PART 1, the soak (default 10 minutes). Each cycle: travel to the next
// world, enter two of its rooms (rotating through all of them), start a
// game in each from its launcher, leave, return to the hub, toggle the
// view. At the hub, after a forced garbage collection, it samples:
//   JS heap (CDP Runtime.getHeapUsage), DOM nodes and JS event listeners
//   (CDP Memory.getDOMCounters), three.js geometries / textures / shader
//   programs (renderer.info through window.__qa.gl), draw calls, and the
//   frame times since the last sample.
// Growth is judged per world, hub against hub (worlds differ in content,
// so only like is compared with like), ignoring each world's first visit
// (first visits compile and cache). A counter is FLAGGED when it rose on
// every later visit and ended more than 10% (heap: 15% and 8 MB) above its
// first counted value.
//
// PART 2, lifecycle (each a PASS/FAIL row):
//   tab hide/show     the page reports hidden: the game pauses and saves;
//                     shown again and resumed, frames advance
//   resize            1440×900 → 844×390 → 390×844 → back: the canvas and
//                     the camera follow, no blank frame
//   orientation       a phone turned to landscape and back (touch, DPR 3)
//   context loss      WEBGL_lose_context.loseContext(): the canvas hides,
//                     the fallback card appears; restoreContext(): the
//                     world draws again with the same resources
//
// The run FAILS on any console error or warning, page error, unhandled
// rejection, failed request, unexpected context loss, a flagged counter, or
// a lifecycle row that does not hold. <out>/soak.json has every sample.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { PHONE, args, drain, gamePerf, gameState, gatedContext, launch, reporter, serve, shot, waitForGame, waitForScene, waitForState } from "./lib.mjs";

const arg = args("QA");
const MINUTES = Number(arg("minutes", 10));
const OUT = path.resolve(String(arg("out", "test-results/qa/soak")));
const [W, H] = String(arg("game", "960x600")).split("x").map(Number);
const CYCLES = Number(arg("cycles", 9));
const ONLY = String(arg("only", "soak,lifecycle")).split(",");
const report = reporter(OUT);
const { step } = report;

let server = null;
let BASE = arg("base");
if (!BASE) {
  server = await serve({ dir: String(arg("dist", "dist/client")), port: Number(arg("port", 0)), serve: arg("serve") });
  BASE = server.base;
}
console.log(`soak: ${BASE} → ${OUT}, ${MINUTES} min at ${W}×${H}`);

/** Rooms per world (every scene with a door), and how to reach the worlds. */
const ROOMS = {
  home: ["kitchen", "office", "go", "music", "writing", "theater", "stadium"],
  stanford: ["kappa", "gym", "boathouse", "basketball", "badminton", "skate", "math"],
  korea: ["cognition", "theater"],
};
const MODE = { home: { stanford: "train", korea: "plane" }, stanford: { home: "train", korea: "plane" }, korea: { home: "plane", stanford: "plane" } };

const frames = (page, n = 3) =>
  page.evaluate(
    (n) =>
      new Promise((resolve) => {
        const tick = () => (--n <= 0 ? resolve(true) : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );
const go = async (page, scene) => {
  const ok = await page.evaluate((scene) => {
    window.__qa.game.getState().go(scene);
    return window.__qa.game.getState().scene === scene;
  }, scene);
  if (!ok) throw new Error(`go("${scene}") refused`);
  await waitForState(page, (scene) => window.__qa.usePresented.getState().scene === scene, scene);
  if (scene === "hub") await waitForScene(page, "hub");
};

const samples = [];
const t0 = Date.now();
async function sample(page, cdp, label) {
  await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  const heap = await cdp.send("Runtime.getHeapUsage");
  const dom = await cdp.send("Memory.getDOMCounters");
  const frameStats = await page.evaluate(() => {
    const f = window.__joshuaPerf.frames;
    const from = window.__soakFrom ?? 0;
    // The buffer keeps the last 2400 frames; before it fills, new frames are the tail.
    const fresh = f.length < 2400 ? f.slice(from) : f.slice(-120);
    window.__soakFrom = f.length;
    const sorted = [...fresh].sort((a, b) => a - b);
    return {
      n: fresh.length,
      mean: fresh.length ? +(fresh.reduce((a, b) => a + b, 0) / fresh.length).toFixed(1) : null,
      p95: sorted.length ? +sorted[Math.floor(sorted.length * 0.95)].toFixed(1) : null,
      max: sorted.length ? +sorted[sorted.length - 1].toFixed(1) : null,
    };
  });
  const perf = await gamePerf(page);
  const state = await gameState(page);
  const s = {
    t: Math.round((Date.now() - t0) / 1000),
    label,
    world: state.world,
    scene: state.scene,
    view: state.view,
    heapMB: +(heap.usedSize / 1048576).toFixed(1),
    domNodes: dom.nodes,
    listeners: dom.jsEventListeners,
    geometries: perf.geometries,
    textures: perf.textures,
    programs: perf.programs,
    calls: perf.calls,
    triangles: perf.triangles,
    frameMs: frameStats.mean,
    frameP95: frameStats.p95,
    frameMax: frameStats.max,
    frames: frameStats.n,
  };
  samples.push(s);
  console.log(`  sample ${JSON.stringify(s)}`);
  return s;
}

/** Steady growth of one counter across a world's hub samples. */
function growth(list, key) {
  const values = list.map((s) => s[key]);
  if (values.length < 3) return { key, values, verdict: "too few visits" };
  const [, ...later] = values; // the first visit warms caches
  const rising = later.every((v, i) => i === 0 || v > later[i - 1]);
  const rise = later[later.length - 1] - later[0];
  const big = key === "heapMB" ? rise > 8 && rise / later[0] > 0.15 : rise / Math.max(1, later[0]) > 0.1;
  return { key, values, rise: +rise.toFixed(1), verdict: later.length >= 3 && rising && big ? "GROWS" : "stable" };
}

const browser = await launch();
let failedHard = 0;
try {
  if (ONLY.includes("soak")) {
    const { context, gate } = await gatedContext(browser, BASE, { viewport: { width: W, height: H } });
    context.setDefaultTimeout(300000);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await step("soak", "boot", async () => {
      await page.goto(`${BASE}/play`);
      await waitForGame(page);
      await frames(page, 3);
      await sample(page, cdp, "start");
    }, { gate, page });
    const rotation = { home: 0, stanford: 0, korea: 0 };
    let cycle = 0;
    const worlds = ["home", "stanford", "korea"];
    // At least --minutes, and long enough to judge growth (three visits to
    // each world) however slow the machine; never more than six times over.
    while ((Date.now() - t0 < MINUTES * 60000 || cycle < CYCLES) && Date.now() - t0 < MINUTES * 6 * 60000) {
      const target = worlds[cycle % 3];
      await step("soak", `cycle ${cycle + 1}: ${target}`, async () => {
        const here = (await gameState(page)).world;
        if (here !== target) {
          await page.evaluate(([to, mode]) => window.__qa.game.getState().travel(to, mode), [target, MODE[here][target]]);
          await waitForState(page, (to) => window.__qa.game.getState().world === to, target);
          await waitForScene(page, "hub");
          await frames(page, 2);
        }
        const done = [];
        for (let k = 0; k < 2; k++) {
          const rooms = ROOMS[target];
          const room = rooms[rotation[target]++ % rooms.length];
          await go(page, room);
          await frames(page, 2);
          const launcher = await page.evaluate((room) => window.__qa.launchers.launchersFor(room)[0]?.id ?? null, room);
          if (launcher) {
            await page.evaluate((room) => window.__qa.launchers.launchersFor(room)[0].start(), room);
            // Some launchers (a seat, a mini scene) start without a game
            // mode: they unregister instead. Either counts as started.
            await waitForState(
              page,
              ([room, id]) =>
                window.__qa.useGameMode.getState().active !== null ||
                !window.__qa.launchers.launchersFor(room).some((l) => l.id === id),
              [room, launcher],
              60000,
            );
            await frames(page, 2);
            await page.keyboard.press("Escape");
            await waitForState(
              page,
              ([room, id]) =>
                window.__qa.useGameMode.getState().active === null &&
                !window.__qa.game.getState().paused &&
                window.__qa.launchers.launchersFor(room).some((l) => l.id === id),
              [room, launcher],
              60000,
            );
          }
          done.push(launcher ? `${room}+${launcher}` : room);
          await go(page, "hub");
        }
        await page.keyboard.press("v");
        await frames(page, 2);
        await page.keyboard.press("v");
        await frames(page, 2);
        const s = await sample(page, cdp, `hub ${target}`);
        return `${done.join(", ")}; heap ${s.heapMB} MB, ${s.domNodes} nodes, geo ${s.geometries}, tex ${s.textures}, prog ${s.programs}, ${s.frameMs} ms/frame`;
      }, { gate, page });
      cycle++;
    }
    // Judge growth: hub samples of each world, in the diorama view.
    const verdicts = {};
    for (const world of worlds) {
      const list = samples.filter((s) => s.label === `hub ${world}`);
      verdicts[world] = ["heapMB", "domNodes", "listeners", "geometries", "textures", "programs"].map((key) => growth(list, key));
    }
    await step("soak", `growth over ${((Date.now() - t0) / 60000).toFixed(1)} min, ${cycle} cycles`, async () => {
      const grows = Object.entries(verdicts).flatMap(([world, list]) => list.filter((g) => g.verdict === "GROWS").map((g) => `${world} ${g.key} ${g.values.join("→")}`));
      const thin = Object.entries(verdicts).filter(([, list]) => list[0].verdict === "too few visits").map(([world]) => world);
      if (grows.length) throw new Error(`steady growth: ${grows.join("; ")}`);
      const first = samples[0];
      const last = samples[samples.length - 1];
      return `no counter grows steadily${thin.length ? ` (too few visits to judge: ${thin.join(", ")})` : ""}; heap ${first.heapMB}→${last.heapMB} MB, nodes ${first.domNodes}→${last.domNodes}, listeners ${first.listeners}→${last.listeners}`;
    });
    await drain(page, gate);
    writeFileSync(path.join(OUT, "soak.json"), JSON.stringify({ base: BASE, minutes: (Date.now() - t0) / 60000, viewport: [W, H], samples, verdicts, problems: gate.problems() }, null, 1));
    await context.close();
  }

  if (ONLY.includes("lifecycle")) {
    /* ------------------------------------------------ hide/show, resize */
    {
      const { context, gate } = await gatedContext(browser, BASE, { viewport: { width: W, height: H } });
      context.setDefaultTimeout(300000);
      const page = await context.newPage();
      await page.goto(`${BASE}/play`);
      await waitForGame(page);
      await frames(page, 3);
      await step("lifecycle", "tab hide / show", async () => {
        // Headless Chromium has no real tab strip: report the page hidden the
        // way the browser does (document.hidden + visibilitychange).
        const hidden = (value) =>
          page.evaluate((value) => {
            Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
            Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (value ? "hidden" : "visible") });
            document.dispatchEvent(new Event("visibilitychange"));
          }, value);
        const saved = () => page.evaluate(() => localStorage.getItem("joshua-exe-save-v1"));
        await page.evaluate(() => window.__qa.walkTo(window.__qa.runtime.x + 2, window.__qa.runtime.z));
        await frames(page, 3);
        await hidden(true);
        const during = await page.evaluate(() => ({ paused: window.__qa.game.getState().paused, active: window.__qa.runtime.active }));
        if (!during.paused || during.active) throw new Error(`hidden: paused=${during.paused} active=${during.active}`);
        const save = JSON.parse((await saved()) ?? "null");
        const at = (await gameState(page)).position;
        if (!save || Math.hypot(save.position[0] - at[0], save.position[1] - at[1]) > 0.05) throw new Error(`hidden: the save has ${save?.position}, the player is at ${at}`);
        await page.waitForTimeout(3000);
        await hidden(false);
        const back = await page.evaluate(() => ({ paused: window.__qa.game.getState().paused, active: window.__qa.runtime.active }));
        if (!back.active) throw new Error("shown again: the world stays inactive");
        // The game waits on its Paused card; the visitor resumes.
        await page.keyboard.press("Escape");
        await waitForState(page, () => !window.__qa.game.getState().paused, null, 60000);
        await frames(page, 3);
        const perf = await gamePerf(page);
        if (!(perf.calls > 10)) throw new Error("no draw calls after resuming");
        return `hidden → paused and saved at (${at}); shown → ${back.paused ? "Paused card" : "running"}, resumed, ${perf.calls} calls`;
      }, { gate, page });
      await step("lifecycle", "resize", async () => {
        const seen = [];
        for (const [w, h] of [[1440, 900], [844, 390], [390, 844], [W, H]]) {
          await page.setViewportSize({ width: w, height: h });
          await frames(page, 4);
          const fit = await page.evaluate(() => {
            const q = window.__qa;
            const canvas = q.gl.domElement;
            const box = canvas.getBoundingClientRect();
            return {
              css: [Math.round(box.width), Math.round(box.height)],
              buffer: [canvas.width, canvas.height],
              aspect: +q.camera.aspect.toFixed(3),
              sideways: document.documentElement.scrollWidth - window.innerWidth,
              calls: window.__joshuaPerf.calls,
            };
          });
          const want = +(w / h).toFixed(3);
          if (fit.css[0] !== w || fit.css[1] !== h) throw new Error(`${w}×${h}: canvas is ${fit.css.join("×")}`);
          if (Math.abs(fit.aspect - want) > 0.01) throw new Error(`${w}×${h}: camera aspect ${fit.aspect}, want ${want}`);
          if (Math.abs(fit.buffer[0] / fit.buffer[1] - want) > 0.02) throw new Error(`${w}×${h}: drawing buffer ${fit.buffer.join("×")}`);
          if (fit.sideways > 0) throw new Error(`${w}×${h}: scrolls sideways by ${fit.sideways}px`);
          if (!(fit.calls > 10)) throw new Error(`${w}×${h}: nothing drawn`);
          await shot(page, path.join(OUT, `resize-${w}x${h}.png`));
          seen.push(`${w}×${h} → buffer ${fit.buffer.join("×")}`);
        }
        return seen.join("; ");
      }, { gate, page });
      await drain(page, gate);
      await context.close();
    }
    /* ---------------------------------------------- orientation (phone) */
    {
      const { context, gate } = await gatedContext(browser, BASE, PHONE);
      context.setDefaultTimeout(300000);
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await page.goto(`${BASE}/play`);
      await waitForGame(page);
      await frames(page, 3);
      await step("lifecycle", "orientation change (phone)", async () => {
        const seen = [];
        for (const [w, h, type, angle] of [[844, 390, "landscapePrimary", 90], [390, 844, "portraitPrimary", 0]]) {
          await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 3, mobile: true, screenOrientation: { type, angle } });
          await frames(page, 4);
          const fit = await page.evaluate(() => {
            const q = window.__qa;
            const box = q.gl.domElement.getBoundingClientRect();
            const hud = [...document.querySelectorAll(".world-toolbar, .game-header, .joystick")].map((el) => el.getBoundingClientRect()).filter((b) => b.width);
            return {
              css: [Math.round(box.width), Math.round(box.height)],
              aspect: +q.camera.aspect.toFixed(3),
              inner: [innerWidth, innerHeight],
              offscreen: hud.filter((b) => b.right > innerWidth + 1 || b.bottom > innerHeight + 1 || b.left < -1 || b.top < -1).length,
              sideways: document.documentElement.scrollWidth - innerWidth,
            };
          });
          if (fit.css[0] !== w || fit.css[1] !== h) throw new Error(`${type}: canvas ${fit.css.join("×")} in ${fit.inner.join("×")}`);
          if (Math.abs(fit.aspect - w / h) > 0.01) throw new Error(`${type}: camera aspect ${fit.aspect}`);
          if (fit.offscreen) throw new Error(`${type}: ${fit.offscreen} HUD block(s) off screen`);
          if (fit.sideways > 0) throw new Error(`${type}: scrolls sideways by ${fit.sideways}px`);
          await shot(page, path.join(OUT, `orientation-${type}.png`));
          seen.push(`${type} ${w}×${h} ok`);
        }
        return seen.join("; ");
      }, { gate, page });
      await drain(page, gate);
      await context.close();
    }
    /* ------------------------------------------------------ context loss */
    {
      const { context, gate } = await gatedContext(browser, BASE, { viewport: { width: W, height: H } }, { expectContextLoss: true });
      context.setDefaultTimeout(300000);
      const page = await context.newPage();
      await page.goto(`${BASE}/play`);
      await waitForGame(page);
      await frames(page, 3);
      await step("lifecycle", "WebGL context loss and restore", async () => {
        const before = await gamePerf(page);
        await shot(page, path.join(OUT, "context-1-before.png"));
        await page.evaluate(() => {
          const gl = window.__qa.gl.getContext();
          window.__lose = gl.getExtension("WEBGL_lose_context");
          window.__lose.loseContext();
        });
        await waitForState(page, () => window.__gate.lost > 0, null, 60000);
        const hiddenCanvas = await page.evaluate(() => window.__qa.gl.domElement.style.visibility === "hidden");
        if (!hiddenCanvas) throw new Error("the lost canvas is still visible");
        // After 4 s without a restore the game admits it (Engine.tsx).
        await page.waitForTimeout(5000);
        const card = await page.evaluate(() => document.querySelector(".game-shell")?.innerText.slice(0, 2000) ?? "");
        await shot(page, path.join(OUT, "context-2-lost.png"));
        await page.evaluate(() => window.__lose.restoreContext());
        await waitForState(page, () => window.__gate.restored > 0, null, 60000);
        await frames(page, 6);
        await waitForState(page, () => window.__qa.gl.domElement.style.visibility !== "hidden", null, 120000);
        await frames(page, 4);
        const after = await gamePerf(page);
        const state = await gameState(page);
        await shot(page, path.join(OUT, "context-3-restored.png"));
        if (!(after.calls > 10 && after.triangles > 1000)) throw new Error(`after restore: ${after.calls} calls, ${after.triangles} triangles`);
        if (state.mode !== "game") throw new Error(`after restore: mode ${state.mode}`);
        const stillCard = await page.evaluate(() => !!document.querySelector(".world-fallback, .stage-unavailable"));
        if (stillCard) throw new Error("the fallback card is still up after the restore");
        return `lost: canvas hidden${/3D unavailable/i.test(card) ? ", fallback card shown" : ""}; restored: ${before.calls}→${after.calls} calls, ${before.triangles}→${after.triangles} tris, programs ${before.programs}→${after.programs}`;
      }, { gate, page });
      await drain(page, gate);
      await context.close();
    }
  }
} catch (error) {
  console.error(`soak: aborted: ${error?.stack ?? error}`);
  failedHard = 2;
} finally {
  await browser.close();
  server?.close();
}
const table = report.table();
console.log(table);
writeFileSync(path.join(OUT, "soak.txt"), `${table}\n`);
writeFileSync(path.join(OUT, "soak-rows.json"), JSON.stringify({ rows: report.rows, samples }, null, 1));
process.exit(failedHard || (report.failed() ? 1 : 0));
