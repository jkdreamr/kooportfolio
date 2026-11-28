// Shared helpers for the launch-readiness scripts in scripts/qa/
// (smoke.mjs, soak.mjs, site-audit.mjs, loadperf.mjs). Node only.
//
// Everything here runs against a PRODUCTION build made with the QA handles:
//   node scripts/gzip-cast.mjs && VITE_QA=1 npx vite build \
//     && node scripts/prerender.mjs && node scripts/flatten-dist.mjs
// and never against the Vite dev server.
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { chromium } from "@playwright/test";

/* ------------------------------------------------------------------ args */

/** `--name=value` and `--flag` from argv, over `SMOKE_NAME`-style env. */
export function args(prefix = "QA") {
  const out = {};
  for (const raw of process.argv.slice(2)) {
    const m = /^--([a-z0-9-]+)(?:=(.*))?$/i.exec(raw);
    if (m) out[m[1]] = m[2] ?? true;
  }
  return (name, fallback) =>
    out[name] ?? process.env[`${prefix}_${name.toUpperCase().replace(/-/g, "_")}`] ?? fallback;
}

/* ---------------------------------------------------------------- server */

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".jpg": "image/jpeg",
  ".m4a": "audio/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain",
  ".bin": "application/octet-stream",
  ".gz": "application/gzip",
};

/**
 * A static server for `dir`. With `serve` (a path to the team's serve.cjs)
 * that script is spawned; otherwise an equivalent built-in server is used:
 * a file if it exists, `<dir>/index.html` for a folder, the root index.html
 * for anything else (SPA fallback), and a JSON 404 for `/api/*`.
 * `gzip: true` compresses text responses (level 9) the way a CDN would, so
 * transfer sizes mean something; it always uses the built-in server.
 * Returns `{ base, close }`.
 */
export async function serve({ dir, port = 0, serve: script, gzip = false } = {}) {
  const zipped = new Map();
  const root = path.resolve(dir);
  if (!existsSync(path.join(root, "index.html")))
    throw new Error(`serve: no index.html in ${root}; build first (see the top of scripts/qa/smoke.mjs)`);
  if (script && !gzip && existsSync(script) && port) {
    const child = spawn(process.execPath, [script, root, String(port)], { stdio: "ignore" });
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 50; i++) {
      if (await ping(base)) return { base, close: () => child.kill() };
      await sleep(100);
    }
    child.kill();
    throw new Error(`serve: ${script} did not answer on ${port}`);
  }
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (url.startsWith("/api/")) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end("{}");
    }
    let file = path.join(root, url);
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end();
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      const index = path.join(file, "index.html");
      file = existsSync(index) ? index : path.join(root, "index.html");
    }
    const type = TYPES[path.extname(file)] ?? "application/octet-stream";
    if (gzip && /^text\/|json|svg/.test(type) && /gzip/.test(String(req.headers["accept-encoding"]))) {
      if (!zipped.has(file)) zipped.set(file, gzipSync(readFileSync(file), { level: 9 }));
      res.writeHead(200, { "content-type": type, "content-encoding": "gzip", "content-length": zipped.get(file).length });
      return res.end(zipped.get(file));
    }
    res.writeHead(200, { "content-type": type, "content-length": statSync(file).size });
    createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

const ping = (base) =>
  new Promise((resolve) => {
    const req = http.get(base, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
  });

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* --------------------------------------------------------------- browser */

const CONTAINER_CHROMIUM = "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";

/** Chromium with software WebGL (SwiftShader), as the team's recipe has it. */
export function launch(extra = []) {
  const executablePath =
    process.env.PW_CHROMIUM || (existsSync(CONTAINER_CHROMIUM) ? CONTAINER_CHROMIUM : undefined);
  return chromium.launch({
    executablePath,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--enable-precise-memory-info",
      "--disable-gpu-watchdog",
      // The photo booth asks for a camera: give it a synthetic one.
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      ...extra,
    ],
  });
}

export const DESKTOP = { viewport: { width: 1440, height: 900 } };
export const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

/* ------------------------------------------------------------------ gate */

/** Console text that real devices do not show, or that is harmless (the
 * same three notices tests/http/console-gate.ts allows). */
export const CONSOLE_ALLOW = [
  /GPU stall due to ReadPixels/,
  /KHR_parallel_shader_compile/,
  /Automatic fallback to software WebGL|SwiftShader/i,
];

/** The API is a separate Worker; on a static host its health probe is a
 * 404 by design (src/shared/api.ts). Nothing else may fail. */
const isApiProbe = (url) => {
  try {
    return new URL(url).pathname.startsWith("/api/");
  } catch {
    return false;
  }
};

/** Runs in the page before anything else: counts WebGL contexts, context
 * losses and unhandled rejections on `window.__gate`. */
function gateProbe() {
  const G = (window.__gate = { contexts: 0, lost: 0, restored: 0, rejections: [] });
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const known = this.__gateSeen;
    const context = getContext.call(this, type, ...rest);
    if (context && /webgl/.test(String(type)) && !known) {
      this.__gateSeen = true;
      G.contexts++;
      this.addEventListener("webglcontextlost", () => G.lost++);
      this.addEventListener("webglcontextrestored", () => G.restored++);
    }
    return context;
  };
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    G.rejections.push(String(reason?.stack || reason?.message || reason).slice(0, 400));
  });
  try {
    sessionStorage.setItem("stage-qa", "1");
  } catch {
    /* storage may be blocked */
  }
}

/**
 * A browser context with the failure gate armed. Requests to other origins
 * never leave the machine: they are answered with an empty 200 and listed in
 * `gate.external` (the container cannot reach the internet, and a smoke run
 * must not depend on SoundCloud being up).
 *
 * `gate.problems()` is everything that must fail a run: console errors and
 * warnings (outside CONSOLE_ALLOW), page errors, unhandled rejections,
 * failed requests and HTTP ≥ 400 (outside the `/api/` probe), and any WebGL
 * context loss the script did not ask for.
 */
export async function gatedContext(browser, base, options = {}, { seed, expectContextLoss = false } = {}) {
  const context = await browser.newContext(options);
  const origin = new URL(base).origin;
  const gate = {
    errors: [],
    external: new Set(),
    aborted: [],
    probes: new Set(),
    requests: [],
    expectContextLoss,
    /** Mark a point in time; `problems(mark)` lists only what came after. */
    mark: () => gate.errors.length,
    problems: (from = 0) => [...new Set(gate.errors.slice(from))],
  };
  await context.addInitScript(gateProbe);
  if (seed)
    await context.addInitScript((save) => {
      if (sessionStorage.getItem("qa-seeded")) return;
      localStorage.setItem("joshua-exe-save-v1", JSON.stringify(save));
      sessionStorage.setItem("qa-seeded", "1");
    }, seed);
  await context.route(
    (url) => url.origin !== origin && /^https?:$/.test(url.protocol),
    (route) => {
      gate.external.add(route.request().url().split("?")[0]);
      const type = route.request().resourceType();
      return route.fulfill({
        status: 200,
        contentType: type === "document" ? "text/html" : "text/plain",
        headers: { "access-control-allow-origin": "*" },
        body: type === "document" ? "<!doctype html><title>stub</title>" : "",
      });
    },
  );
  context.on("page", (page) => watch(page, gate, origin));
  return { context, gate };
}

function watch(page, gate, origin) {
  const where = () => {
    try {
      return new URL(page.url()).pathname;
    } catch {
      return "?";
    }
  };
  page.on("console", (message) => {
    const type = message.type();
    if (type !== "error" && type !== "warning") return;
    const text = message.text();
    if (CONSOLE_ALLOW.some((rule) => rule.test(text))) return;
    const source = message.location()?.url ?? "";
    if (/Failed to load resource/.test(text) && isApiProbe(source)) return gate.probes.add(source);
    gate.errors.push(`[${where()}] console.${type}: ${text.slice(0, 300)}${source ? ` (${source.replace(origin, "")})` : ""}`);
  });
  page.on("pageerror", (error) =>
    gate.errors.push(`[${where()}] pageerror: ${String(error.stack || error.message).slice(0, 400)}`),
  );
  page.on("crash", () => gate.errors.push(`[${where()}] the page crashed`));
  page.on("request", (request) => gate.requests.push(request.url()));
  page.on("requestfailed", (request) => {
    const url = request.url();
    const reason = request.failure()?.errorText ?? "failed";
    if (isApiProbe(url)) return gate.probes.add(url);
    // The browser cancelling its own request (leaving the page, a media
    // element seeking) is not a failure; it is listed, not failed.
    if (/ERR_ABORTED/.test(reason)) return gate.aborted.push(`${reason} ${url.replace(origin, "")}`);
    gate.errors.push(`[${where()}] request failed: ${url.replace(origin, "")} ${reason}`);
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const url = response.url();
    if (isApiProbe(url)) return gate.probes.add(url);
    gate.errors.push(`[${where()}] HTTP ${response.status()}: ${url.replace(origin, "")}`);
  });
}

/** Moves what the in-page probe saw (rejections, context losses) into the
 * gate. Call before leaving a page and at the end of a run. */
export async function drain(page, gate) {
  const seen = await page
    .evaluate(() => {
      const G = window.__gate;
      if (!G) return null;
      const out = { contexts: G.contexts, lost: G.lost, restored: G.restored, rejections: G.rejections.splice(0) };
      return out;
    })
    .catch(() => null);
  if (!seen) return null;
  const where = new URL(page.url()).pathname;
  for (const text of seen.rejections) gate.errors.push(`[${where}] unhandled rejection: ${text}`);
  const counted = (gate.lostCounted ??= new WeakMap());
  const before = counted.get(page) ?? 0;
  if (seen.lost > before && !gate.expectContextLoss)
    gate.errors.push(`[${where}] WebGL context lost ${seen.lost - before}×`);
  counted.set(page, seen.lost);
  return seen;
}

/* ------------------------------------------------------------ game hooks */

/** One line of the game's state, from the `window.__qa` handles. */
export const gameState = (page) =>
  page.evaluate(() => {
    const q = window.__qa;
    const stage = q?.useStage?.getState();
    const game = q?.game?.getState();
    return {
      mode: stage?.mode,
      ready: stage?.ready,
      hud: stage?.hudRevealed,
      tier: stage?.tier,
      path: location.pathname,
      world: game?.world,
      scene: game?.scene,
      presented: q?.usePresented?.getState().scene,
      panel: game?.panel,
      paused: game?.paused,
      near: game?.near,
      traveling: game?.traveling,
      activity: q?.useGameMode?.getState().active?.id ?? null,
      view: q?.useWorldView?.getState().view,
      position: q?.runtime ? [+q.runtime.x.toFixed(2), +q.runtime.z.toFixed(2)] : null,
    };
  });

/** Renderer counters: frame time (mean and worst of the last `n` frames),
 * draw calls, triangles, GPU resources, JS heap. */
export const gamePerf = (page, n = 30) =>
  page.evaluate((n) => {
    const f = window.__joshuaPerf;
    const gl = window.__qa?.gl;
    if (!f) return null;
    const frames = f.frames.slice(-n);
    const sorted = [...frames].sort((a, b) => a - b);
    const memory = performance.memory;
    return {
      frames: f.frames.length,
      ms: frames.length ? +(frames.reduce((a, b) => a + b, 0) / frames.length).toFixed(1) : null,
      p95: sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))].toFixed(1) : null,
      calls: f.calls,
      triangles: f.triangles,
      geometries: gl?.info.memory.geometries ?? f.geometries,
      textures: gl?.info.memory.textures ?? f.textures,
      programs: gl?.info.programs?.length ?? f.programs,
      linksAfterReady: f.linksAfterReady,
      tier: f.tier,
      dpr: f.dpr,
      heapMB: memory ? +(memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      dom: document.getElementsByTagName("*").length,
    };
  }, n);

/** Waits until the playable world is up: stage mode "game", HUD revealed,
 * the QA handles present. Software WebGL needs a minute or more. */
export async function waitForGame(page, timeout = 900000) {
  await page.waitForFunction(
    () => {
      const q = window.__qa;
      return !!q?.walkTo && !!q.game && q.useStage.getState().mode === "game" && q.useStage.getState().hudRevealed;
    },
    null,
    { timeout, polling: 250 },
  );
  await waitForScene(page, "hub", timeout);
}

/** Waits for `.game-shell[data-scene-ready=<scene>]`: the scene is on screen
 * and the HUD is interactive (Hud.tsx `useSceneFocus`). */
export const waitForScene = (page, scene, timeout = 300000) =>
  page.waitForSelector(`.game-shell[data-scene-ready="${scene}"]`, { state: "attached", timeout });

/** Waits for `count` more rendered frames (the world really drew). */
export async function waitFrames(page, count = 2, timeout = 300000) {
  const start = await page.evaluate(() => window.__qa?.gl?.info.render.frame ?? 0);
  await page.waitForFunction(
    ([start, count]) => (window.__qa?.gl?.info.render.frame ?? 0) >= start + count,
    [start, count],
    { timeout, polling: 100 },
  );
}

export const waitForState = (page, predicate, arg, timeout = 300000) =>
  page.waitForFunction(predicate, arg, { timeout, polling: 200 });

/* ---------------------------------------------------------------- report */

export function reporter(outDir) {
  mkdirSync(outDir, { recursive: true });
  const rows = [];
  const started = Date.now();
  const stamp = () => `${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s`;
  /**
   * Runs one check. `fn` returns a short detail string (or nothing); a throw
   * fails the row. `gate`: when given, anything it recorded during the step
   * fails the row too.
   */
  async function step(group, name, fn, { gate, page } = {}) {
    const mark = gate?.mark() ?? 0;
    const t0 = Date.now();
    let ok = true;
    let detail = "";
    try {
      detail = (await fn()) ?? "";
    } catch (error) {
      ok = false;
      detail = String(error?.message ?? error).split("\n")[0].slice(0, 220);
    }
    if (gate) {
      if (page) await drain(page, gate);
      const problems = gate.problems(mark);
      if (problems.length) {
        ok = false;
        detail = `${detail ? `${detail}; ` : ""}${problems.length} problem(s): ${problems[0].slice(0, 200)}`;
      }
    }
    const row = { group, name, ok, ms: Date.now() - t0, detail: String(detail) };
    rows.push(row);
    console.log(`${stamp()} ${ok ? "PASS" : "FAIL"} ${group} › ${name}${detail ? ` — ${detail}` : ""}`);
    return ok;
  }
  function table() {
    const width = Math.min(46, Math.max(...rows.map((r) => `${r.group} › ${r.name}`.length)));
    const lines = rows.map(
      (r) =>
        `${r.ok ? "PASS" : "FAIL"}  ${`${r.group} › ${r.name}`.padEnd(width)}  ${(r.ms / 1000).toFixed(1).padStart(6)}s  ${r.detail}`,
    );
    const failed = rows.filter((r) => !r.ok).length;
    return [
      "",
      `RESULT  ${"check".padEnd(width)}  ${"time".padStart(7)}  detail`,
      ...lines,
      "",
      `${rows.length - failed}/${rows.length} passed, ${failed} failed, ${((Date.now() - started) / 1000).toFixed(0)} s`,
    ].join("\n");
  }
  return { rows, step, table, outDir, failed: () => rows.filter((r) => !r.ok).length };
}

/** A screenshot that tolerates multi-second software frames. */
export const shot = (page, file, options = {}) =>
  page.screenshot({ path: file, timeout: 300000, animations: "allow", ...options });
