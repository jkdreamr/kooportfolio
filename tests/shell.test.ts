// WS-A shell: the inline boot-sky script, the engine-load recovery ladder,
// the loading mark's progress, and the prerendered portfolio markup.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DAYLIGHT_KEYS } from "../src/game/core/daylight";
import { bootProgress, nextLoadStep } from "../src/stage/boot";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const inline = html.match(/<script>([\s\S]*?)<\/script>/)![1];

/** Run the head script against a fake page; returns what it wrote. */
function boot({
  path = "/",
  save = null as string | null,
  anchor = null as string | null,
  now = new Date("2026-11-27T20:00:00Z"),
} = {}) {
  const props = new Map<string, string>();
  const links: Record<string, string>[] = [];
  let theme = "#fbfbf9";
  const docEl = {
    className: "",
    style: {
      background: "",
      setProperty: (k: string, v: string) => props.set(k, v),
    },
  };
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...a: []) {
      super(...((a.length ? a : [now.getTime()]) as []));
    }
  }
  const win: Record<string, unknown> = {};
  runInNewContext(inline, {
    window: win,
    location: { pathname: path },
    localStorage: { getItem: () => save },
    sessionStorage: { getItem: () => anchor },
    Intl,
    Math,
    Date: FixedDate,
    parseInt,
    document: {
      documentElement: docEl,
      querySelector: () => ({ setAttribute: (_: string, v: string) => (theme = v) }),
      createElement: () => ({}) as Record<string, string>,
      head: { appendChild: (l: Record<string, string>) => links.push(l) },
    },
  });
  return { sky: props.get("--sky")!, className: docEl.className, background: docEl.style.background, theme, links, win };
}

/** TimeOfDayLighting's background: the horizon key colours blended in
 * three's linear working space, read back as sRGB hex. */
function horizonAt(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  const index = DAYLIGHT_KEYS.findIndex((key, i) => i > 0 && h < key.hour) - 1;
  const from = DAYLIGHT_KEYS[Math.max(0, index)];
  const to = DAYLIGHT_KEYS[Math.max(0, index) + 1];
  const t = (h - from.hour) / (to.hour - from.hour);
  const blend = t * t * (3 - 2 * t);
  return `#${new THREE.Color(from.horizon).lerp(new THREE.Color(to.horizon), blend).getHexString(THREE.SRGBColorSpace)}`;
}

describe("index.html boot sky", () => {
  it("uses the same horizon table as core/daylight.ts", () => {
    const table = inline.match(/var K = (\[\[[\s\S]*?\]\]);/)![1];
    const parsed = JSON.parse(table) as [number, string][];
    expect(parsed).toEqual(DAYLIGHT_KEYS.map((k) => [k.hour, k.horizon.slice(1)]));
  });
  it("a first visit opens on the late-afternoon horizon (16.6 h)", () => {
    expect(boot().sky).toBe(horizonAt(16.6));
  });
  it("matches the engine's background at every quarter hour of the saved world", () => {
    const save = JSON.stringify({ world: "home" });
    for (let q = 0; q < 96; q++) {
      const now = new Date(Date.UTC(2026, 10, 27, 8, 0) + q * 15 * 60_000); // 00:00 PT onwards
      const pacific = q / 4;
      expect(boot({ save, now }).sky, `hour ${pacific}`).toBe(horizonAt(pacific));
    }
  });
  it("follows Seoul for a Korea save and the session anchor when set", () => {
    const now = new Date("2026-11-27T20:00:00Z"); // 12:00 PT, 05:00 KST
    expect(boot({ save: JSON.stringify({ world: "korea" }), now }).sky).toBe(horizonAt(5));
    expect(boot({ save: JSON.stringify({ world: "stanford" }), now }).sky).toBe(horizonAt(12));
    expect(boot({ anchor: "4.6", now }).sky).toBe(horizonAt(16.6));
  });
  it("survives a corrupt save", () => {
    expect(boot({ save: "{not json" }).sky).toBe(horizonAt(16.6));
  });
  it("paints the page and preloads the engine on /play only", () => {
    const site = boot({ path: "/about" });
    expect(site.className).toBe("");
    expect(site.background).toBe("");
    expect(site.theme).toBe("#fbfbf9");
    expect(site.links).toHaveLength(0);
    const play = boot({ path: "/play" });
    expect(play.className).toContain("play");
    expect(play.background).toBe(play.sky);
    expect(play.theme).toBe(play.sky);
    expect(boot({ path: "/player" }).className).toBe("");
  });
  it("has a placeholder the prerender fills with the engine's files", () => {
    expect(inline).toContain("/*ENGINE_PRELOAD*/ []");
  });
});

describe("engine import recovery", () => {
  it("retries once, reloads once on /play, then gives up", () => {
    const play = { allowReload: true, reloaded: false };
    expect(nextLoadStep("first", play)).toBe("retry");
    expect(nextLoadStep("retry", play)).toBe("reload");
    expect(nextLoadStep("retry", { allowReload: true, reloaded: true })).toBe("fail");
    expect(nextLoadStep("retry", { allowReload: false, reloaded: false })).toBe("fail");
    expect(nextLoadStep("reload", play)).toBe("fail");
  });
});

describe("loading mark progress", () => {
  const files = [
    ["/assets/engine.js", 3000],
    ["/assets/three.core.js", 1000],
  ] as const;
  it("splits 60% download by size, 40% warm-up", () => {
    expect(bootProgress(files, new Set(), 0)).toBe(0);
    expect(bootProgress(files, new Set(["/assets/three.core.js"]), 0)).toBeCloseTo(0.15);
    expect(bootProgress(files, new Set(["/assets/three.core.js", "/assets/engine.js"]), 0)).toBeCloseTo(0.6);
    expect(bootProgress(files, new Set(), 0.5)).toBeCloseTo(0.8);
    expect(bootProgress(files, new Set(), 1)).toBe(1);
  });
  it("is monotonic in each input and bounded", () => {
    let last = -1;
    for (const w of [0, 0.1, 0.4, 0.9, 1, 1.5]) {
      const p = bootProgress(files, new Set(["/assets/engine.js"]), w);
      expect(p).toBeGreaterThanOrEqual(last);
      expect(p).toBeLessThanOrEqual(1);
      last = p;
    }
  });
  it("works with no preload list (dev, or the inline script missing)", () => {
    expect(bootProgress([], new Set(), 0)).toBe(0);
    expect(bootProgress([], new Set(), 0.5)).toBeCloseTo(0.8);
  });
});

describe("prerendered portfolio", () => {
  it("renders every route with the real tree, deterministically", async () => {
    const { renderRoute, renderNotFound } = await import("../src/site/ssr");
    const year = String(new Date().getFullYear());
    for (const [route, text] of [
      ["/", "joshua koo"],
      ["/about", "A little about me."],
      ["/work", "Things in motion."],
      ["/contact", "Good things start with hello."],
    ]) {
      const a = renderRoute(route);
      expect(a).toBe(renderRoute(route));
      expect(a).toContain('class="portfolio"');
      expect(a).toContain(text);
      expect(a).toContain(`© ${year} JOSHUA KOO`);
      expect(a).toContain('<span class="play-label">Play</span>');
      expect(a).toContain('class="stage-root"');
    }
    const contact = renderRoute("/contact");
    expect(contact).toContain('href="https://buymeacoffee.com/joshuakoo"');
    expect(contact).toContain("Buy me a coffee");
    expect(renderNotFound()).toContain("Nothing here.");
  });
});

describe("vercel.json (A4)", () => {
  type Rule = { source: string; destination?: string; headers?: { key: string; value: string }[] };
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
    cleanUrls: boolean;
    outputDirectory: string;
    rewrites: Rule[];
    headers: Rule[];
  };
  // Vercel's source syntax, enough of it for these rules: ":name*" is any
  // number of segments, "(...)" is a regex group.
  const toRegex = (source: string) =>
    new RegExp(`^${source.replace(/\/:\w+\*/g, "(?:/.*)?").replace(/\/:\w+/g, "/[^/]+")}$`);
  // What a static deployment of the build answers: files first, then the
  // rewrites, then 404.html with status 404.
  const files = new Set(["/index.html", "/about/index.html", "/play/index.html", "/404.html", "/assets/engine-abc123.js", "/audio/birds.mp3"]);
  function route(path: string) {
    const candidates = [path, `${path}.html`, `${path.replace(/\/$/, "")}/index.html`];
    const hit = candidates.find((c) => files.has(c));
    if (hit) return { status: 200, file: hit };
    const rewrite = config.rewrites.find((r) => toRegex(r.source).test(path));
    if (rewrite && files.has(rewrite.destination!)) return { status: 200, file: rewrite.destination! };
    return { status: 404, file: "/404.html" };
  }
  const header = (path: string, key: string) =>
    config.headers
      .filter((h) => toRegex(h.source).test(path))
      .flatMap((h) => h.headers ?? [])
      .reverse()
      .find((h) => h.key === key)?.value;

  it("serves pages, deep links and the 404 page with real statuses", () => {
    expect(config.outputDirectory).toBe("dist");
    expect(config.cleanUrls).toBe(true);
    expect(route("/about")).toEqual({ status: 200, file: "/about/index.html" });
    expect(route("/play")).toEqual({ status: 200, file: "/play/index.html" });
    expect(route("/play/anything/deeper")).toEqual({ status: 200, file: "/play/index.html" });
    expect(route("/assets/nope.js").status).toBe(404);
    expect(route("/api/booth").status).toBe(404);
    expect(route("/api/health").status).toBe(404);
    expect(route("/characters/cast-v9.bin").status).toBe(404);
    expect(route("/no-such-page")).toEqual({ status: 404, file: "/404.html" });
    expect(route("/player").status).toBe(404);
  });
  it("never rewrites everything to index.html", () => {
    for (const r of config.rewrites) expect(r.source).toMatch(/^\/play/);
  });
  it("caches hashed assets for a year, unhashed media briefly", () => {
    expect(header("/assets/engine-abc123.js", "Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(header("/audio/birds.mp3", "Cache-Control")).toBe("public, max-age=3600, stale-while-revalidate=604800");
    expect(header("/characters/cast-v1.bin.gz", "Cache-Control")).toMatch(/^public, max-age=3600/);
    expect(header("/", "Cache-Control")).toBeUndefined(); // HTML: Vercel's revalidating default
  });
  it("sends the security headers everywhere and keeps the camera for the photo booth", () => {
    for (const path of ["/", "/play", "/assets/x.js"]) {
      expect(header(path, "X-Content-Type-Options")).toBe("nosniff");
      expect(header(path, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(header(path, "Permissions-Policy")).toBe("camera=(self), microphone=(), geolocation=()");
    }
  });
  it("blocks nothing the game embeds or calls cross-origin", () => {
    // Music players (SoundCloud, Spotify, YouTube iframes) and the Worker on
    // *.workers.dev must keep working: no framing, isolation or CSP headers.
    const keys = config.headers.flatMap((h) => h.headers ?? []).map((h) => h.key.toLowerCase());
    for (const banned of ["content-security-policy", "x-frame-options", "cross-origin-embedder-policy", "cross-origin-opener-policy"])
      expect(keys).not.toContain(banned);
  });
});

describe("check-budgets (A10)", () => {
  async function fakeBuild(opts: { engineBytes: number; routeLoadsEngine?: boolean }) {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { randomBytes } = await import("node:crypto");
    const dir = mkdtempSync(join(tmpdir(), "budgets-"));
    mkdirSync(join(dir, "assets"));
    // Random bytes do not compress: gzip size ≈ raw size.
    writeFileSync(join(dir, "assets/engine-abc.js"), randomBytes(opts.engineBytes));
    writeFileSync(join(dir, "assets/index-abc.js"), randomBytes(1000));
    writeFileSync(join(dir, "assets/index-abc.css"), "body{}");
    const page = (extra = "") =>
      `<html><head><script type="module" crossorigin src="/assets/index-abc.js"></script>${extra}<script>var P=[["/assets/engine-abc.js",1]]</script></head></html>`;
    writeFileSync(join(dir, "index.html"), page(opts.routeLoadsEngine ? '<link rel="modulepreload" href="/assets/engine-abc.js">' : ""));
    for (const r of ["about", "work", "contact"]) {
      mkdirSync(join(dir, r));
      writeFileSync(join(dir, r, "index.html"), page());
    }
    return dir;
  }
  async function run(dir: string) {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(process.execPath, ["scripts/check-budgets.mjs", dir], { encoding: "utf8" });
    return { code: r.status, out: r.stdout + r.stderr };
  }
  it("passes a small build and prints the table", async () => {
    const r = await run(await fakeBuild({ engineBytes: 10_000 }));
    expect(r.code).toBe(0);
    expect(r.out).toContain("engine chunk (gzip)");
    expect(r.out).toContain("no engine");
  });
  it("fails an engine over 540 KB, or a portfolio page that loads it", async () => {
    expect((await run(await fakeBuild({ engineBytes: 560 * 1024 }))).code).toBe(1);
    const loads = await run(await fakeBuild({ engineBytes: 10_000, routeLoadsEngine: true }));
    expect(loads.code).toBe(1);
    expect(loads.out).toContain("LOADS ENGINE");
  });
});

describe("console gate allowlist (A11)", () => {
  it("allows exactly the three renderer notices", async () => {
    const { CONSOLE_ALLOWLIST, isAllowed } = await import("./http/console-gate");
    expect(CONSOLE_ALLOWLIST).toHaveLength(3);
    expect(isAllowed("[.WebGL-0x1]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels")).toBe(true);
    expect(isAllowed("THREE.WebGLRenderer: KHR_parallel_shader_compile extension not supported.")).toBe(true);
    expect(isAllowed("Automatic fallback to software WebGL has been deprecated.")).toBe(true);
    expect(isAllowed("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed.")).toBe(false);
    expect(isAllowed("Warning: An error occurred during hydration.")).toBe(false);
  });
});

describe("portfolio type sizes", () => {
  it("sets no text below 12 px in the portfolio stylesheets", () => {
    for (const file of ["../src/style.css", "../src/site/glass.css"]) {
      const css = readFileSync(new URL(file, import.meta.url), "utf8");
      const sizes = [...css.matchAll(/font(?:-size)?\s*:[^;{}]*?(\d+(?:\.\d+)?)px/g)].map((m) => +m[1]);
      if (file.endsWith("style.css")) expect(sizes.length).toBeGreaterThan(10);
      for (const px of sizes) expect(px, file).toBeGreaterThanOrEqual(12);
    }
  });
});
