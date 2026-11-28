#!/usr/bin/env node
// Smoke suite: the whole site in a real browser, against a production build.
//
// WHAT IT DOES
//   site   Every portfolio route (/, /about, /work, /contact), the static
//          404 page and an unknown path, at 1440×900 and at 390×844 (touch,
//          DPR 3): status, title, one <h1>, heading order, no sideways
//          scroll, the request budget (≤ 3 requests, no engine before
//          intent), then the nav links by real clicks.
//   play   Enters the game from "/" through the Play link, walks (path and
//          keyboard), toggles the view, opens every HUD panel (Settings,
//          the Josh links hub, Listen, Places, Travel, You, Controls,
//          Pause), then in EVERY world visits every place in the Places
//          list by standing at it and pressing E: each room is entered
//          through its real door, each of its games is started from its
//          "Play …" launcher and left with Escape, landmarks (telescope,
//          bulletin, photo booth, station, airport) are opened and closed.
//          Scenes with no door of their own (rowing, the secret room) are
//          entered through the store. Worlds are reached through the Travel
//          map. Finally returns to the portfolio.
//   phone  Direct /play at 390×844 touch DPR 3: boots, drives the joystick,
//          opens Settings and the links hub by tap, enters one room and
//          starts its game.
//
// A check FAILS on: a console error or warning (three software-GL notices
// are allowed, as in tests/http/console-gate.ts), a page error, an
// unhandled rejection, a failed request or HTTP ≥ 400 (the `/api/` health
// probe is a 404 on a static host by design and is allowed), a WebGL
// context loss, or any step that does not reach its expected state.
// Requests to other origins (SoundCloud, Spotify, YouTube) are stubbed and
// listed: the run never depends on the internet.
//
// HOW TO RUN
//   1. Build with the QA handles (window.__qa), never the dev server:
//        npm run qa:build
//      (= node scripts/gzip-cast.mjs && VITE_QA=1 vite build
//         && node scripts/prerender.mjs && node scripts/flatten-dist.mjs)
//   2. npm run qa:smoke                 (everything, about 10–25 min on
//                                        software WebGL, by machine load)
//      npm run qa:smoke -- --quick      (site + boot + panels + one room per
//                                        world; a few minutes)
//      npm run qa:smoke -- --only=site  (site | play | phone, comma list)
//
// OPTIONS (flag, or env QA_<NAME>)
//   --base=<url>       test a server that is already running
//   --dist=<dir>       build to serve (default dist/client)
//   --port=<n>         port for the suite's own server (default: a free one)
//   --serve=<file>     static server script to spawn (`node <file> <dir>
//                      <port>`, e.g. the team's serve.cjs); needs --port.
//                      Default: an equivalent built-in server.
//   --out=<dir>        screenshots and smoke.json (default test-results/qa/smoke)
//   --game=<WxH>       desktop game viewport (default 1440x900; 960x600 is
//                      about a third faster on software WebGL)
//   --quick, --only=…  see above
//   --worlds=<list>    worlds the play tour visits (default
//                      home,stanford,korea; others are skipped, travel
//                      still goes through the Travel map)
//   PW_CHROMIUM        Chromium binary (default: the container's, else
//                      Playwright's own)
//
// OUTPUT
//   A PASS/FAIL line per check as it runs, the table at the end, exit code
//   1 if anything failed. <out>/smoke.json has the rows, every problem,
//   the stubbed external hosts and renderer counters per world.
import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  DESKTOP,
  PHONE,
  args,
  drain,
  gamePerf,
  gameState,
  gatedContext,
  launch,
  reporter,
  serve,
  shot,
  waitForGame,
  waitForScene,
  waitForState,
} from "./lib.mjs";

const arg = args("QA");
const QUICK = !!arg("quick", false);
const WORLDS = String(arg("worlds", "home,stanford,korea")).split(",");
const ONLY = String(arg("only", "site,play,phone")).split(",");
const OUT = path.resolve(String(arg("out", "test-results/qa/smoke")));
const [GAME_W, GAME_H] = String(arg("game", "1440x900")).split("x").map(Number);
const report = reporter(OUT);
const { step } = report;
const summary = { worlds: {}, games: [], external: [], aborted: [], probes: [], problems: [] };
/** The rooms each world must let you into (core/worlds.ts, the scenes with
 * a door). A new room is reported, a missing one fails the run. */
const ROOMS = {
  home: ["theater", "go", "writing", "stadium", "office", "kitchen", "music"],
  stanford: ["skate", "badminton", "boathouse", "basketball", "kappa", "gym", "math"],
  korea: ["theater", "cognition"],
};

let server = null;
let BASE = arg("base");
if (!BASE) {
  server = await serve({ dir: String(arg("dist", "dist/client")), port: Number(arg("port", 0)), serve: arg("serve") });
  BASE = server.base;
}
console.log(`smoke: ${BASE} → ${OUT}${QUICK ? " (quick)" : ""}`);

/* ----------------------------------------------------------------- site */

const ROUTES = [
  { path: "/", title: "Joshua Koo", h1: "joshua koo" },
  { path: "/about", title: "About — Joshua Koo", h1: "joshua koo", h2: "A little about me." },
  { path: "/work", title: "Work — Joshua Koo", h1: "joshua koo", h2: "Things in motion." },
  { path: "/contact", title: "Contact — Joshua Koo", h1: "joshua koo", h2: "Good things start with hello." },
  // The page a static host serves for a missing path (vercel.json has no
  // catch-all rewrite, so Vercel answers with this file and a 404 status).
  { path: "/404.html", title: "Nothing here — Joshua Koo", h1: "Nothing here.", static: true },
  // An unknown path as the local server answers it (the app shell).
  { path: "/no-such-page-smoke", unknown: true },
];

async function siteRun(browser, label, options) {
  const { context, gate } = await gatedContext(browser, BASE, options);
  context.setDefaultTimeout(60000);
  const page = await context.newPage();
  for (const route of ROUTES) {
    await step(
      `site ${label}`,
      route.path,
      async () => {
        const from = gate.requests.length;
        const response = await page.goto(BASE + route.path, { waitUntil: "load" });
        const status = response?.status() ?? 0;
        if (status !== 200 && !(route.unknown && status === 404)) throw new Error(`HTTP ${status}`);
        // Hydration, and the request count once the page has settled.
        if (!route.static)
          await page.waitForFunction(() => document.querySelector(".portfolio")?.hasAttribute("data-armed"));
        await page.waitForTimeout(600);
        const facts = await page.evaluate(() => {
          const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(
            (h) => !h.closest(".stage-root") && h.getClientRects().length,
          );
          const levels = headings.map((h) => +h.tagName[1]);
          const h1 = headings.filter((h) => h.tagName === "H1");
          return {
            title: document.title,
            lang: document.documentElement.lang,
            h1: h1.map((h) => h.getAttribute("aria-label") ?? h.textContent.trim()),
            h2: headings.filter((h) => h.tagName === "H2").map((h) => h.textContent.trim()),
            skips: levels.some((level, i) => i > 0 && level > levels[i - 1] + 1),
            sideways: document.documentElement.scrollWidth - window.innerWidth,
            description: document.querySelector('meta[name="description"]')?.content ?? "",
            imagesWithoutAlt: [...document.images].filter((img) => !img.hasAttribute("alt")).length,
            scripts: document.scripts.length,
          };
        });
        const requests = gate.requests.slice(from);
        const wrong = [];
        if (route.title && facts.title !== route.title) wrong.push(`title "${facts.title}"`);
        if (facts.lang !== "en") wrong.push(`lang "${facts.lang}"`);
        if (facts.h1.length !== 1) wrong.push(`${facts.h1.length} h1`);
        if (route.h1 && facts.h1[0] !== route.h1) wrong.push(`h1 "${facts.h1[0]}"`);
        if (route.h2 && !facts.h2.includes(route.h2)) wrong.push(`no h2 "${route.h2}"`);
        if (facts.skips) wrong.push("heading level skipped");
        if (facts.sideways > 0) wrong.push(`scrolls sideways by ${facts.sideways}px`);
        if (!facts.description) wrong.push("no meta description");
        if (facts.imagesWithoutAlt) wrong.push(`${facts.imagesWithoutAlt} img without alt`);
        if (route.static && facts.scripts) wrong.push(`${facts.scripts} script(s) on the static 404`);
        // PLAN_FINAL §0.2: a portfolio page is three requests, and never the
        // engine, three.js or the cast before the visitor shows intent.
        if (requests.length > 3) wrong.push(`${requests.length} requests (budget 3): ${requests.map((u) => u.replace(BASE, "")).join(" ")}`);
        await shot(page, path.join(OUT, `site-${label}-${route.path.replace(/\W+/g, "_") || "home"}.png`), { fullPage: true });
        if (wrong.length) throw new Error(wrong.join("; "));
        return `${status}, ${requests.length} request(s)${route.unknown ? `, shows "${facts.h1[0]}"` : ""}`;
      },
      { gate, page },
    );
  }
  await step(
    `site ${label}`,
    "nav links",
    async () => {
      await page.goto(`${BASE}/`);
      const tap = (locator) => (options.hasTouch ? locator.tap() : locator.click());
      for (const [name, target, heading] of [
        ["About", "/about", "A little about me."],
        ["Work", "/work", "Things in motion."],
        ["Contact", "/contact", "Good things start with hello."],
      ]) {
        await tap(page.locator(".portfolio-nav").getByRole("link", { name, exact: true }));
        await page.waitForURL(BASE + target);
        await page.getByRole("heading", { name: heading }).waitFor();
        const current = await page.locator('.portfolio-nav [aria-current="page"]').textContent();
        if (current.trim() !== name) throw new Error(`aria-current on "${current.trim()}", not "${name}"`);
      }
      await tap(page.locator(".wordmark"));
      await page.waitForURL(`${BASE}/`);
      return "About → Work → Contact → home";
    },
    { gate, page },
  );
  await drain(page, gate);
  collect(gate);
  await context.close();
}

/* ----------------------------------------------------------------- game */

/** el.click() in the page: a real React click without Playwright's
 * two-animation-frame stability wait (seconds each on software WebGL). */
const domClick = (page, selector, text) =>
  page.evaluate(
    ([selector, text]) => {
      const el = [...document.querySelectorAll(selector)].find(
        (node) => node.getClientRects().length && (!text || node.textContent.trim().includes(text)),
      );
      if (!el) return false;
      el.click();
      return true;
    },
    [selector, text ?? ""],
  );

/** Resolves after the game has drawn `n` more animation frames. */
const frames = (page, n = 3) =>
  page.evaluate(
    (n) =>
      new Promise((resolve) => {
        const tick = () => (--n <= 0 ? resolve(true) : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );

const setGame = (page, patch) => page.evaluate((patch) => window.__qa.game.setState(patch), patch);
const panelIs = (page, panel) => waitForState(page, (panel) => window.__qa.game.getState().panel === panel, panel, 120000);
const dialog = (page, name) => page.getByRole("dialog", { name, exact: true });

async function openPanel(page, toolbarLabel, title, panel) {
  if (!(await domClick(page, ".world-toolbar button", toolbarLabel))) throw new Error(`no "${toolbarLabel}" in the toolbar`);
  await panelIs(page, panel);
  await dialog(page, title).waitFor({ state: "attached" });
}
async function closePanel(page) {
  await page.keyboard.press("Escape");
  await panelIs(page, "none");
}

/** The Places list of the current world, with each entry's door position
 * (read from the walk the entry starts; the player is put back). */
async function places(page) {
  const start = await page.evaluate(() => [window.__qa.runtime.x, window.__qa.runtime.z]);
  await setGame(page, { panel: "places" });
  await page.locator(".places-list button").first().waitFor({ state: "attached" });
  const names = await page.locator(".places-list button").evaluateAll((els) => els.map((el) => el.textContent.trim()));
  const out = [];
  for (const name of names) {
    await setGame(page, { panel: "places" });
    await page.locator(".places-list button").first().waitFor({ state: "attached" });
    const at = await page.evaluate((name) => {
      const button = [...document.querySelectorAll(".places-list button")].find((el) => el.textContent.trim() === name);
      const r = window.__qa.runtime;
      r.path = [];
      r.target = null;
      button.click();
      const end = r.path.length ? r.path[r.path.length - 1] : r.target;
      r.path = [];
      r.target = null;
      return end ? [end[0], end[1]] : null;
    }, name);
    out.push({ name, at });
  }
  await page.evaluate(([x, z]) => {
    const q = window.__qa;
    q.runtime.path = [];
    q.runtime.target = null;
    q.runtime.x = x;
    q.runtime.z = z;
    q.game.setState({ panel: "none" });
  }, start);
  return out;
}

/** Text of the in-world cards and prompts currently on screen. */
const onScreenCards = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".stage-canvas button, .context-action.visible strong")]
      .filter((el) => el.getClientRects().length)
      .map((el) => el.textContent.trim())
      .slice(0, 6),
  );

/** Stands the player at a spot and waits for the "press E" prompt there. */
async function standAt(page, [x, z]) {
  await page.evaluate(
    ([x, z]) => {
      const q = window.__qa;
      q.runtime.path = [];
      q.runtime.target = null;
      q.runtime.x = x;
      q.runtime.z = z;
      q.game.setState({ near: "" });
    },
    [x, z],
  );
  await frames(page, 3);
  await waitForState(page, () => window.__qa.game.getState().near !== "", null, 60000).catch(() => {});
  return (await gameState(page)).near;
}

const launcherList = (page, scene) =>
  page.evaluate((scene) => window.__qa.launchers.launchersFor(scene).map((l) => ({ id: l.id, label: l.label })), scene);

/** Starts each game the room offers from its "Play …" button, then leaves it
 * with Escape. A launcher is registered only while its game can start
 * (core/launchers.ts), so "started" is: a game mode is active, or the
 * launcher has left the registry (the cinema seat is not a game mode).
 * Returns the launcher ids that started. */
async function playLaunchers(page, scene, world, shots) {
  let launchers = await launcherList(page, scene);
  if (!launchers.length) {
    // Rooms with a machine (gym, beat lab, math lab) offer their game only
    // near it; the machine stands at the room's centre.
    await page.evaluate(() => {
      const r = window.__qa.runtime;
      r.path = [];
      r.target = null;
      r.x = 0;
      r.z = -2;
    });
    await frames(page, 3);
    launchers = await launcherList(page, scene);
  }
  const played = [];
  for (const launcher of launchers) {
    await step(
      `play ${world}`,
      `${scene} › ${launcher.label}`,
      async () => {
        if (!(await domClick(page, ".game-shell button", launcher.label)))
          throw new Error(`launcher "${launcher.label}" is registered but has no button on screen`);
        const started = await waitForState(
          page,
          ([scene, id]) => {
            const q = window.__qa;
            const active = q.useGameMode.getState().active;
            if (active) return `game mode "${active.id}"`;
            return q.launchers.launchersFor(scene).some((l) => l.id === id) ? false : "started (no game mode)";
          },
          [scene, launcher.id],
          120000,
        ).then((handle) => handle.jsonValue());
        await frames(page, 3);
        if (shots) await shot(page, path.join(OUT, `play-${world}-${scene}-${launcher.id}.png`));
        await page.keyboard.press("Escape");
        const left = await waitForState(
          page,
          () => window.__qa.useGameMode.getState().active === null && !window.__qa.game.getState().paused,
          null,
          60000,
        ).then(
          () => true,
          () => false,
        );
        if (!left) {
          await page.evaluate(() => {
            window.dispatchEvent(new Event("interior-game-close"));
            window.__qa.useGameMode.setState({ active: null });
            window.__qa.game.setState({ paused: false });
          });
          throw new Error(`${started}, but Escape did not leave it`);
        }
        played.push(launcher.id);
        return started;
      },
      { gate: page.__gate, page },
    );
  }
  return played;
}

async function backToHub(page) {
  const state = await gameState(page);
  if (state.scene === "hub" && state.presented === "hub") return;
  if (state.paused || state.panel !== "none") await setGame(page, { paused: false, panel: "none" });
  if (!(await domClick(page, ".back-link"))) await page.evaluate(() => window.__qa.game.getState().go("hub"));
  await waitForScene(page, "hub");
}

/** Puts the game back in the hub whatever a failed step left behind. */
async function recover(page) {
  await page
    .evaluate(() => {
      const q = window.__qa;
      window.dispatchEvent(new Event("interior-game-close"));
      q.useGameMode.setState({ active: null });
      q.game.setState({ paused: false, panel: "none", result: null });
      if (q.game.getState().scene !== "hub") q.game.getState().go("hub");
    })
    .catch(() => {});
  await waitForScene(page, "hub").catch(() => {});
}

async function visitWorld(page, gate, world, { quick }) {
  const group = `play ${world}`;
  let list = [];
  await step(
    group,
    "arrive",
    async () => {
      await waitForScene(page, "hub");
      await frames(page, 3);
      const perf = await gamePerf(page);
      summary.worlds[world] = perf;
      if (!(perf.calls > 10 && perf.triangles > 1000)) throw new Error(`nothing drawn: ${perf.calls} calls, ${perf.triangles} triangles`);
      await shot(page, path.join(OUT, `play-${world}-hub.png`));
      list = await places(page);
      if (!list.length) throw new Error("the Places list is empty");
      return `${perf.calls} calls, ${perf.triangles} tris, ${perf.ms} ms/frame, tier ${perf.tier}; places: ${list.map((p) => p.name).join(", ")}`;
    },
    { gate, page },
  );
  let rooms = 0;
  const enteredRooms = [];
  for (const place of list) {
    let entered = null;
    const ok = await step(
      group,
      place.name,
      async () => {
        if (!place.at) throw new Error("no walkable spot for this place");
        const near = await standAt(page, place.at);
        if (!near) {
          // A sight to walk to (a landmark, the campus), or a place that
          // answers with its own card when you stand there (station,
          // airport departures). Rooms are counted separately below, so a
          // door that lost its prompt still fails the run.
          await frames(page, 3);
          const cards = await onScreenCards(page);
          await shot(page, path.join(OUT, `play-${world}-at-${place.name.replace(/\W+/g, "_")}.png`));
          return `no E prompt (a sight or a proximity card); on screen: ${cards.join(" | ") || "nothing"}`;
        }
        const before = await gameState(page);
        if (quick && rooms >= 1 && !["stargazing", "bulletin", "read"].includes(near)) return `prompt "${near}" (not opened: --quick)`;
        await page.keyboard.press("e");
        // Something must happen: a room, a panel, a dialog or a journey UI.
        const what = await waitForState(
          page,
          (before) => {
            const q = window.__qa;
            const g = q.game.getState();
            if (g.scene !== before.scene) return `scene:${g.scene}`;
            if (g.panel !== "none") return `panel:${g.panel}`;
            if (q.useGameMode.getState().active) return `mode:${q.useGameMode.getState().active.id}`;
            if (g.traveling) return "traveling";
            return false;
          },
          before,
          45000,
        ).then(
          (handle) => handle.jsonValue(),
          () => null,
        );
        if (!what) {
          // Proximity-only landmarks (station, airport) show their own card
          // instead of answering E: the prompt and the card are the check.
          const cards = await onScreenCards(page);
          await shot(page, path.join(OUT, `play-${world}-at-${near}.png`));
          return `prompt "${near}", on screen: ${cards.join(" | ") || "nothing"}`;
        }
        const [kind, id] = what.split(":");
        if (kind === "scene") {
          await waitForScene(page, id);
          await frames(page, 3);
          await shot(page, path.join(OUT, `play-${world}-${id}.png`));
          entered = id;
          rooms++;
          const perf = await gamePerf(page);
          return `room "${id}" through its door, ${perf.calls} calls, ${perf.triangles} tris`;
        }
        if (kind === "panel") {
          await frames(page, 2);
          await shot(page, path.join(OUT, `play-${world}-panel-${id}.png`));
          await closePanel(page);
          return `panel "${id}"`;
        }
        if (kind === "mode") {
          await frames(page, 2);
          await shot(page, path.join(OUT, `play-${world}-mode-${id}.png`));
          if (!(await domClick(page, '[aria-label="Close photo booth"]'))) await page.keyboard.press("Escape");
          await waitForState(page, () => window.__qa.useGameMode.getState().active === null, null, 60000);
          return `game mode "${id}"`;
        }
        return what;
      },
      { gate, page },
    );
    if (entered) {
      enteredRooms.push(entered);
      const played = await playLaunchers(page, entered, world, true);
      summary.games.push(...played.map((id) => `${world}/${entered}/${id}`));
      // The boathouse is the way into the regatta.
      if (entered === "boathouse" && !quick) await sceneByStore(page, gate, world, "rowing");
      await step(group, `${entered} › exit`, async () => void (await backToHub(page)), { gate, page });
    }
    if (!ok || !entered) await recover(page);
  }
  if (!quick)
    await step(group, "every room has a working door", async () => {
      const missing = ROOMS[world].filter((room) => !enteredRooms.includes(room));
      const extra = enteredRooms.filter((room) => !ROOMS[world].includes(room));
      if (missing.length) throw new Error(`not entered through a door: ${missing.join(", ")}`);
      return `${enteredRooms.length} rooms: ${enteredRooms.join(", ")}${extra.length ? ` (new, add to ROOMS: ${extra.join(", ")})` : ""}`;
    });
  if (world === "stanford" && !quick) {
    await sceneByStore(page, gate, world, "secret");
    await recover(page);
  }
}

/** Scenes without a door in the Places list. */
async function sceneByStore(page, gate, world, scene) {
  await step(
    `play ${world}`,
    `${scene} (no door: entered through the store)`,
    async () => {
      await page.evaluate((scene) => window.__qa.game.getState().go(scene), scene);
      const state = await gameState(page);
      if (state.scene !== scene) throw new Error(`go("${scene}") was refused`);
      await waitForState(page, (scene) => window.__qa.usePresented.getState().scene === scene, scene);
      await frames(page, 3);
      await shot(page, path.join(OUT, `play-${world}-${scene}.png`));
      const perf = await gamePerf(page);
      return `${perf.calls} calls, ${perf.triangles} tris`;
    },
    { gate, page },
  );
}

async function travel(page, gate, to) {
  return step(
    "play travel",
    `to ${to} by the Travel map`,
    async () => {
      await backToHub(page);
      await openPanel(page, "Travel", "Travel", "travel");
      await shot(page, path.join(OUT, `play-travel-map-to-${to}.png`));
      if (!(await domClick(page, `.island-map-stop--${to}`))) throw new Error(`no stop for ${to} on the map`);
      const t0 = Date.now();
      await waitForState(
        page,
        (to) => {
          const g = window.__qa.game.getState();
          return g.world === to && !g.traveling && g.scene === "hub";
        },
        to,
        900000,
      ).catch(async (error) => {
        const g = await page.evaluate(() => {
          const s = window.__qa.game.getState();
          return { world: s.world, scene: s.scene, traveling: s.traveling, panel: s.panel, paused: s.paused };
        });
        await shot(page, path.join(OUT, `play-travel-stuck-to-${to}.png`)).catch(() => {});
        throw new Error(`${error.message.split("\n")[0]}; state ${JSON.stringify(g)}`);
      });
      await waitForScene(page, "hub");
      return `journey ${((Date.now() - t0) / 1000).toFixed(0)} s`;
    },
    { gate, page },
  );
}

async function hudPanels(page, gate) {
  const group = "play hud";
  await step(
    group,
    "Settings",
    async () => {
      await openPanel(page, "Settings", "Settings", "settings");
      const panel = dialog(page, "Settings");
      const before = await page.evaluate(() => window.__qa.game.getState().sound);
      // Sound switch, both levels, the quality row.
      await panel.locator(".sound-settings button").first().evaluate((el) => el.click());
      await waitForState(page, (muted) => window.__qa.game.getState().sound.muted !== muted, before.muted, 30000);
      await panel.locator(".sound-settings button").first().evaluate((el) => el.click());
      const sliders = await panel.locator('input[type="range"]').count();
      if (sliders !== 2) throw new Error(`${sliders} sliders, expected Music and Effects`);
      const rows = await panel.locator(".setting-row").evaluateAll((els) => els.map((el) => el.textContent.trim()));
      if (!rows.some((row) => /Visual quality/.test(row))) throw new Error("no Visual quality row");
      await shot(page, path.join(OUT, "play-hud-settings.png"));
      await closePanel(page);
      return `sound switch toggles, 2 sliders, rows: ${rows.join(" | ")}`;
    },
    { gate, page },
  );
  await step(
    group,
    "Josh (links hub)",
    async () => {
      await openPanel(page, "Josh", "Joshua Koo", "memories");
      const links = await dialog(page, "Joshua Koo")
        .locator("a")
        .evaluateAll((els) => els.map((el) => ({ href: el.getAttribute("href"), target: el.target, rel: el.rel, text: el.textContent.trim() })));
      const external = links.filter((link) => /^https?:/.test(link.href));
      const bad = external.filter((link) => link.target !== "_blank" || !/noopener|noreferrer/.test(link.rel));
      if (external.length < 10) throw new Error(`only ${external.length} links in the hub`);
      if (bad.length) throw new Error(`${bad.length} external link(s) without target/rel: ${bad[0].href}`);
      if (!links.some((link) => link.href?.startsWith("mailto:"))) throw new Error("no email link");
      const hosts = new Set(external.map((link) => new URL(link.href).hostname));
      await shot(page, path.join(OUT, "play-hud-links.png"));
      // "Listen here" opens the embedded players (stubbed here).
      if (!(await domClick(page, ".josh-listen"))) throw new Error('no "Listen here"');
      await dialog(page, "Listen").waitFor({ state: "attached" });
      const tabs = await page.getByRole("tab").count();
      await frames(page, 2);
      await shot(page, path.join(OUT, "play-hud-listen.png"));
      if (!(await domClick(page, '.listen-modal [aria-label="Close dialog"]'))) throw new Error("Listen has no close button");
      await dialog(page, "Listen").waitFor({ state: "detached" });
      if (tabs < 3) throw new Error(`${tabs} Listen tabs`);
      return `${external.length} external links on ${hosts.size} hosts, all target=_blank + rel; Listen: ${tabs} tabs`;
    },
    { gate, page },
  );
  for (const [label, title, panel] of [
    ["Places", "Places", "places"],
    ["Travel", "Travel", "travel"],
    ["You", null, "avatar"],
  ])
    await step(
      group,
      label,
      async () => {
        if (!(await domClick(page, ".world-toolbar button", label))) throw new Error("not in the toolbar");
        await panelIs(page, panel);
        const name = await page.locator('.game-modal[role="dialog"]').last().getAttribute("aria-label");
        if (title && name !== title) throw new Error(`dialog is "${name}"`);
        const controls = await page.locator('.game-modal[role="dialog"]').last().locator("button, a, input").count();
        await shot(page, path.join(OUT, `play-hud-${panel}.png`));
        await closePanel(page);
        return `dialog "${name}", ${controls} controls`;
      },
      { gate, page },
    );
  await step(
    group,
    "Controls and Pause",
    async () => {
      if (!(await domClick(page, ".game-footer button"))) throw new Error("no Controls button");
      await panelIs(page, "help");
      await closePanel(page);
      if (!(await domClick(page, '[aria-label="Pause game"]'))) throw new Error("no Pause button");
      await waitForState(page, () => window.__qa.game.getState().paused, null, 60000);
      await dialog(page, "Paused").waitFor({ state: "attached" });
      if (!(await domClick(page, ".game-modal .primary-button"))) throw new Error('no "Keep playing"');
      await waitForState(page, () => !window.__qa.game.getState().paused, null, 60000);
      return "Controls opens and closes; Pause → Keep playing";
    },
    { gate, page },
  );
}

async function playRun(browser) {
  const { context, gate } = await gatedContext(browser, BASE, { viewport: { width: GAME_W, height: GAME_H }, permissions: ["camera"] });
  context.setDefaultTimeout(300000);
  const page = await context.newPage();
  page.__gate = gate;
  const booted = await step(
    "play",
    "enter from / by the Play link",
    async () => {
      await page.goto(`${BASE}/`);
      await page.waitForFunction(() => document.querySelector(".portfolio")?.hasAttribute("data-armed"));
      const t0 = Date.now();
      await page.locator(".portfolio-nav").getByRole("link", { name: /^(Play|Continue)$/ }).click();
      await waitForGame(page);
      const state = await gameState(page);
      if (state.path !== "/play") throw new Error(`path is ${state.path}`);
      return `playable in ${((Date.now() - t0) / 1000).toFixed(0)} s, tier ${state.tier}, world ${state.world}, view ${state.view}`;
    },
    { gate, page },
  );
  // A problem during boot fails that row; the tour goes on if the world is up.
  if (!booted && !(await gameState(page).then((s) => s.mode === "game" && s.hud, () => false))) {
    await shot(page, path.join(OUT, "play-boot-failed.png")).catch(() => {});
    collect(gate);
    return context.close();
  }
  await step(
    "play",
    "walk (path, then keyboard)",
    async () => {
      const a = (await gameState(page)).position;
      await page.evaluate(([x, z]) => window.__qa.walkTo(x + 3, z + 2), a);
      await waitForState(page, ([x, z]) => Math.hypot(window.__qa.runtime.x - x, window.__qa.runtime.z - z) > 0.3, a, 180000);
      await page.evaluate(() => {
        window.__qa.runtime.path = [];
        window.__qa.runtime.target = null;
      });
      await frames(page, 2);
      const b = (await gameState(page)).position;
      await page.keyboard.down("d");
      const moved = await waitForState(page, ([x, z]) => Math.hypot(window.__qa.runtime.x - x, window.__qa.runtime.z - z) > 0.3, b, 180000).then(
        () => true,
        () => false,
      );
      await page.keyboard.up("d");
      if (!moved) throw new Error("holding D did not move the player");
      const c = (await gameState(page)).position;
      return `(${a}) → (${b}) by path → (${c}) by keyboard`;
    },
    { gate, page },
  );
  await step(
    "play",
    "view toggle (V)",
    async () => {
      const before = (await gameState(page)).view;
      await page.keyboard.press("v");
      await waitForState(page, (before) => window.__qa.useWorldView.getState().view !== before, before, 120000);
      await frames(page, 4);
      const after = (await gameState(page)).view;
      await shot(page, path.join(OUT, `play-view-${after}.png`));
      await page.keyboard.press("v");
      await waitForState(page, (before) => window.__qa.useWorldView.getState().view === before, before, 120000);
      return `${before} → ${after} → ${before}`;
    },
    { gate, page },
  );
  await hudPanels(page, gate);
  const first = (await gameState(page)).world;
  const order = [first, ...["home", "stanford", "korea"].filter((world) => world !== first)].filter((world) => WORLDS.includes(world));
  for (const world of order) {
    if ((await gameState(page)).world !== world && !(await travel(page, gate, world))) {
      await recover(page);
      continue;
    }
    await visitWorld(page, gate, world, { quick: QUICK });
  }
  await step(
    "play",
    "back to the portfolio",
    async () => {
      await backToHub(page);
      const href = await page.locator(".world-toolbar a").first().getAttribute("href");
      await page.locator(".world-toolbar a").first().evaluate((el) => el.click());
      await page.waitForURL((url) => !url.pathname.startsWith("/play"), { timeout: 120000 });
      await page.locator(".portfolio h1").waitFor();
      return `Portfolio link → ${new URL(page.url()).pathname} (href ${href})`;
    },
    { gate, page },
  );
  await drain(page, gate);
  collect(gate);
  await context.close();
}

async function phoneRun(browser) {
  const { context, gate } = await gatedContext(browser, BASE, { ...PHONE, permissions: ["camera"] });
  context.setDefaultTimeout(300000);
  const page = await context.newPage();
  page.__gate = gate;
  const booted = await step(
    "phone",
    "direct /play at 390×844, DPR 3",
    async () => {
      const t0 = Date.now();
      await page.goto(`${BASE}/play`);
      await waitForGame(page);
      await frames(page, 3);
      const perf = await gamePerf(page);
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await shot(page, path.join(OUT, "phone-hub.png"));
      if (sideways > 0) throw new Error(`the HUD scrolls sideways by ${sideways}px`);
      return `playable in ${((Date.now() - t0) / 1000).toFixed(0)} s, tier ${perf.tier}, dpr ${perf.dpr}, ${perf.calls} calls`;
    },
    { gate, page },
  );
  if (!booted && !(await gameState(page).then((s) => s.mode === "game" && s.hud, () => false))) {
    await shot(page, path.join(OUT, "phone-boot-failed.png")).catch(() => {});
    collect(gate);
    return context.close();
  }
  await step(
    "phone",
    "joystick",
    async () => {
      const pad = page.locator('[aria-label="Touch movement joystick"]');
      const box = await pad.boundingBox();
      if (!box) throw new Error("no joystick on a touch screen");
      const cdp = await context.newCDPSession(page);
      const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
      const a = (await gameState(page)).position;
      const touch = (type, x, y) =>
        cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
      await touch("touchStart", cx, cy);
      await touch("touchMove", cx + box.width * 0.4, cy);
      const moved = await waitForState(page, ([x, z]) => Math.hypot(window.__qa.runtime.x - x, window.__qa.runtime.z - z) > 0.3, a, 180000).then(
        () => true,
        () => false,
      );
      await touch("touchEnd", 0, 0);
      if (!moved) throw new Error("dragging the joystick did not move the player");
      return `(${a}) → (${(await gameState(page)).position})`;
    },
    { gate, page },
  );
  await step(
    "phone",
    "toolbar targets ≥ 44 px, Settings and Josh by tap",
    async () => {
      const small = await page.locator(".world-toolbar button, .world-toolbar a").evaluateAll((els) =>
        els
          .map((el) => ({ text: el.textContent.trim(), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }))
          .filter((b) => b.w < 44 || b.h < 44),
      );
      await page.locator(".world-toolbar button", { hasText: "Settings" }).tap();
      await panelIs(page, "settings");
      await frames(page, 2);
      await shot(page, path.join(OUT, "phone-settings.png"));
      await domClick(page, '.game-modal [aria-label="Close dialog"]');
      await panelIs(page, "none");
      await page.locator(".world-toolbar button", { hasText: "Josh" }).tap();
      await panelIs(page, "memories");
      await frames(page, 2);
      await shot(page, path.join(OUT, "phone-links.png"));
      const overflow = await page.locator(".game-modal").last().evaluate((el) => el.scrollWidth - el.clientWidth);
      await domClick(page, '.game-modal [aria-label="Close dialog"]');
      await panelIs(page, "none");
      if (small.length) throw new Error(`under 44 px: ${small.map((b) => `${b.text} ${b.w}×${b.h}`).join(", ")}`);
      if (overflow > 1) throw new Error(`the links hub overflows sideways by ${overflow}px`);
      return "both open and close";
    },
    { gate, page },
  );
  const world = (await gameState(page)).world;
  const list = await places(page).catch(() => []);
  for (const place of list) {
    let entered = null;
    const near = place.at ? await standAt(page, place.at) : "";
    if (!near || ["stargazing", "bulletin", "read", "airport", "station", "photo"].includes(near)) continue;
    await step(
      "phone",
      `${place.name} by its door`,
      async () => {
        // The prompt is a button on touch screens.
        if (!(await domClick(page, ".context-action.visible button"))) await page.keyboard.press("e");
        await waitForState(page, () => window.__qa.game.getState().scene !== "hub", null, 60000);
        entered = (await gameState(page)).scene;
        await waitForScene(page, entered);
        await frames(page, 3);
        await shot(page, path.join(OUT, `phone-${entered}.png`));
        return `room "${entered}"`;
      },
      { gate, page },
    );
    if (entered) {
      await playLaunchers(page, entered, `phone-${world}`, true);
      await step("phone", `${entered} › exit`, async () => void (await backToHub(page)), { gate, page });
    }
    break;
  }
  await drain(page, gate);
  collect(gate);
  await context.close();
}

function collect(gate) {
  summary.external.push(...gate.external);
  summary.aborted.push(...gate.aborted);
  summary.probes.push(...gate.probes);
  summary.problems.push(...gate.problems());
}

/* ------------------------------------------------------------------ main */

let exit = 0;
try {
  // Separate browsers: each game owns a software-GL process.
  const jobs = [];
  if (ONLY.includes("site"))
    jobs.push(
      (async () => {
        const browser = await launch();
        try {
          await siteRun(browser, "desktop", DESKTOP);
          await siteRun(browser, "phone", PHONE);
        } finally {
          await browser.close();
        }
      })(),
    );
  if (ONLY.includes("play"))
    jobs.push(
      (async () => {
        const browser = await launch();
        try {
          await playRun(browser);
        } finally {
          await browser.close();
        }
      })(),
    );
  await Promise.all(jobs);
  // The phone run comes after: two software-GL games at once starve each other.
  if (ONLY.includes("phone")) {
    const browser = await launch();
    try {
      await phoneRun(browser);
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  console.error(`smoke: aborted: ${error?.stack ?? error}`);
  exit = 2;
} finally {
  server?.close();
}
const table = report.table();
console.log(table);
const unique = (list) => [...new Set(list)];
if (summary.problems.length) console.log(`\nproblems:\n${unique(summary.problems).map((p) => `  ${p}`).join("\n")}`);
console.log(`\nstubbed external hosts: ${unique(summary.external.map((u) => new URL(u).hostname)).join(", ") || "none"}`);
console.log(`allowed API probes: ${unique(summary.probes).map((u) => new URL(u).pathname).join(", ") || "none"}`);
writeFileSync(
  path.join(OUT, "smoke.json"),
  JSON.stringify(
    { base: BASE, quick: QUICK, rows: report.rows, problems: unique(summary.problems), worlds: summary.worlds, games: summary.games, external: unique(summary.external), aborted: unique(summary.aborted), probes: unique(summary.probes) },
    null,
    1,
  ),
);
writeFileSync(path.join(OUT, "smoke.txt"), `${table}\n`);
process.exit(exit || (report.failed() ? 1 : 0));
