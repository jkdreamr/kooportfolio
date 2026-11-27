// Prerender the portfolio routes with the real React tree (react-dom/server)
// into the built index.html, so the first paint is the page itself and the
// client hydrates it in place (no stub, no layout shift). Also writes:
//   play/index.html  the /play shell (empty root; the engine preload list)
//   404.html         a static "Nothing here." page, no script, noindex
//   robots.txt
// `node scripts/prerender.mjs --og` after a build (needs a local Chromium)
// regenerates public/og.png instead.
//
// Runs after `vite build`. Loads src/site/ssr.tsx through Vite's SSR module
// loader, so no second bundle or extra dependency is needed.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const root = "dist/client";
const ROUTES = {
  "/": { title: "Joshua Koo", file: "index.html" },
  "/about": { title: "About — Joshua Koo", file: "about/index.html" },
  "/work": { title: "Work — Joshua Koo", file: "work/index.html" },
  "/contact": { title: "Contact — Joshua Koo", file: "contact/index.html" },
};
// Canonical and og:url need the public origin. Vercel exposes the production
// domain at build time; SITE_URL overrides it. Without either they are left
// out rather than guessed.
const origin = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "")
).replace(/\/+$/, "");

// Same constants as vite.config.ts `define` (kept in step by hand: the
// config file cannot be loaded here, it carries the Worker plugin).
function buildDefines() {
  let commit = process.env.VERCEL_GIT_COMMIT_SHA || "";
  if (!commit) {
    try {
      commit = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
    } catch {
      commit = "unknown";
    }
  }
  return {
    __BUILD_YEAR__: JSON.stringify(new Date().getFullYear()),
    __BUILD_COMMIT__: JSON.stringify(commit.slice(0, 12)),
  };
}

// `--og` (after a full build): only regenerate public/og.png from dist.
if (process.argv.includes("--og")) {
  await shareCard();
  process.exit(0);
}

const template = await readFile(`${root}/index.html`, "utf8");
if (!/<div id="root"><\/div>/.test(template))
  throw new Error("prerender: index.html has no empty #root to fill");
if (!/<title>[^<]*<\/title>/.test(template))
  throw new Error("prerender: index.html has no <title> to replace");

/* ---------------------------------------------------- engine preload list */
// The engine chunk and everything it statically imports, for /play's
// modulepreload links (the inline head script adds them on /play only, so
// portfolio routes keep their three requests). Sizes weight the loading
// mark's download progress.
const manifestPath = `${root}/.vite/manifest.json`;
let preload = [];
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const engineKey = Object.keys(manifest).find((k) => /src\/game\/engine\/index\.tsx$/.test(k));
  if (!engineKey) throw new Error("prerender: engine chunk missing from the manifest");
  const seen = new Set();
  const walk = (key) => {
    const entry = manifest[key];
    if (!entry || seen.has(key) || entry.isEntry) return;
    seen.add(key);
    preload.push(`/${entry.file}`);
    for (const dep of entry.imports ?? []) walk(dep);
  };
  walk(engineKey);
  preload = preload.map((url) => [url, statSync(`${root}${url}`).size]);
  // Build bookkeeping only: never published.
  await rm(`${root}/.vite`, { recursive: true, force: true });
}
// The favicon rides inline (a few hundred bytes), so a portfolio page stays
// at three requests; public/favicon.svg is the same file for everyone else.
const favicon = `data:image/svg+xml,${encodeURIComponent(readFileSync("public/favicon.svg", "utf8").trim())}`;
const withPreload = (html) =>
  html
    .replace("/*ENGINE_PRELOAD*/ []", JSON.stringify(preload))
    .replace('href="/favicon.svg"', `href="${favicon}"`);

/* ------------------------------------------------------------- render */
const vite = await createServer({
  configFile: false,
  logLevel: "error",
  appType: "custom",
  plugins: [react()],
  define: buildDefines(),
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let ssr;
try {
  ssr = await vite.ssrLoadModule("/src/site/ssr.tsx");
} catch (error) {
  await vite.close();
  throw error;
}

const head = (html, { title, path, noindex }) => {
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  out = out.replace(
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${title}" />`,
  );
  const extra = [];
  if (noindex) extra.push('<meta name="robots" content="noindex" />');
  if (origin && path) {
    extra.push(`<link rel="canonical" href="${origin}${path === "/" ? "/" : path}" />`);
    extra.push(`<meta property="og:url" content="${origin}${path === "/" ? "/" : path}" />`);
  }
  if (origin)
    out = out.replace(
      '<meta property="og:image" content="/og.png" />',
      `<meta property="og:image" content="${origin}/og.png" />`,
    );
  return out.replace("</head>", `${extra.map((l) => `    ${l}\n`).join("")}  </head>`);
};

try {
  for (const [path, { title, file }] of Object.entries(ROUTES)) {
    const body = ssr.renderRoute(path);
    const html = head(withPreload(template), { title, path }).replace(
      '<div id="root"></div>',
      `<div id="root">${body}</div>`,
    );
    await mkdir(`${root}/${file}`.replace(/\/[^/]+$/, ""), { recursive: true });
    await writeFile(`${root}/${file}`, html);
  }
  // /play: nothing to prerender (the game mounts fresh), same head script.
  await mkdir(`${root}/play`, { recursive: true });
  await writeFile(
    `${root}/play/index.html`,
    head(withPreload(template), { title: "Play — Joshua Koo", path: "/play" }),
  );
  // 404: the portfolio's look, its stylesheet only (no script, no engine).
  const notFound = head(withPreload(template), { title: "Nothing here — Joshua Koo", noindex: true })
    .replace(/\s*<script>[\s\S]*?<\/script>/, "")
    .replace(/\s*<script type="module"[^>]*><\/script>/g, "")
    .replace(/\s*<link rel="modulepreload"[^>]*>/g, "")
    .replace(/\s*<noscript[\s\S]*?<\/noscript>/, "")
    .replace('<div id="root"></div>', `<div id="root">${ssr.renderNotFound()}</div>`);
  await writeFile(`${root}/404.html`, notFound);
} finally {
  await vite.close();
}
await writeFile(`${root}/robots.txt`, "User-agent: *\nDisallow: /api/\n");
console.log(
  `prerender: ${Object.keys(ROUTES).join(", ")}, /play shell, 404 (engine preload: ${preload.length} files)`,
);

/* ------------------------------------------------------- share card */
// public/og.png: a screenshot of "/" (heading centred, no nav). Needs a local
// Chromium (PW_CHROMIUM or Playwright's own); the result is committed, so a
// normal build never needs a browser.
async function shareCard() {
  const http = await import("node:http");
  const { chromium } = await import("@playwright/test");
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
  const server = http.createServer((req, res) => {
    const url = req.url.split("?")[0];
    let file = `${root}${url}`;
    if (!existsSync(file) || statSync(file).isDirectory()) file = `${root}/index.html`;
    res.writeHead(200, { "content-type": types[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addStyleTag({
      content:
        ".site-header,.site-footer,.portfolio-nav{display:none!important}.portfolio{min-height:630px;justify-content:center}.editorial{flex:0;padding:0 32px!important}",
    });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: "public/og.png" });
    console.log("prerender: public/og.png written");
  } finally {
    await browser.close();
    server.close();
  }
}
