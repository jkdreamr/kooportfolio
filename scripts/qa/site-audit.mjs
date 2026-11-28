#!/usr/bin/env node
// Portfolio polish audit: accessibility and page-quality facts for every
// portfolio route, measured in a real browser against a production build.
//
//   npm run qa:site-audit [-- --base=<url> | --dist=dist/client] [--out=<dir>]
//
// Per route (/, /about, /work, /contact, /404.html) it reports:
//   contrast   every visible text run against its real background (WCAG AA:
//              4.5:1, or 3:1 for text ≥ 24 px / ≥ 18.66 px bold)
//   targets    links and buttons under 44×44 CSS px on a touch screen
//              (the "o" in the heading is exempt: it is a letter in a line
//              of text, WCAG 2.5.8 "inline")
//   focus      the Tab order, and that every stop shows a focus ring
//   semantics  landmarks, one h1, heading order, names of links and buttons,
//              images without alt
//   overflow   sideways scroll, or text running off the screen, at 320,
//              390 and 1440 px
//   CLS        layout shift during load and the 4 s after it (budget 0.02)
//   motion     under prefers-reduced-motion: no animation or transition
//              longer than 0.4 s, no view-transition opt-in
//   head       title, description, canonical, og:*, icons, robots, lang
// Exit code 1 if anything is outside its limit. <out>/site-audit.json has
// every measurement.
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { args, launch, serve } from "./lib.mjs";

const arg = args("QA");
const OUT = path.resolve(String(arg("out", "test-results/qa/site-audit")));
mkdirSync(OUT, { recursive: true });
let server = null;
let BASE = arg("base");
if (!BASE) {
  server = await serve({ dir: String(arg("dist", "dist/client")), port: Number(arg("port", 0)), serve: arg("serve") });
  BASE = server.base;
}
const ROUTES = ["/", "/about", "/work", "/contact", "/404.html"];
const findings = [];
const data = {};
const flag = (route, kind, text) => findings.push({ route, kind, text });

/* In-page measurements --------------------------------------------------- */
function measure() {
  const parse = (value) => {
    const m = /rgba?\(([^)]+)\)/.exec(value);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p[3] ?? 1];
  };
  const over = (top, under) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
  };
  const lum = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  // Every colour an element's own background can show: its colour and each
  // stop of a gradient. The page background ends the walk.
  const backgrounds = (el) => {
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const stops = [...style.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0]));
      const colour = parse(style.backgroundColor);
      if (stops.length) layers.push(stops);
      else if (colour && colour[3] > 0) layers.push([colour]);
      if (layers.length && layers[layers.length - 1].every((c) => c[3] === 1)) break;
    }
    let result = [[255, 255, 255, 1]];
    for (const layer of layers.reverse()) result = layer.flatMap((top) => result.map((under) => over(top, under)));
    return result;
  };
  const visible = (el) => {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && +style.opacity > 0 && box.width > 1 && box.height > 1;
  };
  const describe = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).join(".")}` : ""}`;
  const inPage = (el) => !el.closest(".stage-root, .sr-only, noscript, script, style");

  const contrast = [];
  const clipped = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!node.textContent.trim() || !el || seen.has(el) || !inPage(el) || !visible(el)) continue;
    seen.add(el);
    const style = getComputedStyle(el);
    const colour = parse(style.color);
    const size = parseFloat(style.fontSize);
    const bold = +style.fontWeight >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const worst = Math.min(...backgrounds(el).map((bg) => ratio(over(colour, bg), bg)));
    const range = document.createRange();
    range.selectNodeContents(node);
    const box = range.getBoundingClientRect();
    if (box.left < -0.5 || box.right > window.innerWidth + 0.5)
      clipped.push(`${describe(el)} "${node.textContent.trim().slice(0, 30)}" spans ${Math.round(box.left)}..${Math.round(box.right)} of ${window.innerWidth}`);
    contrast.push({ el: describe(el), text: node.textContent.trim().slice(0, 40), size, ratio: +worst.toFixed(2), need: large ? 3 : 4.5 });
  }

  const interactive = [...document.querySelectorAll("a[href], button, input, select, textarea, [tabindex]")].filter((el) => inPage(el) && visible(el));
  const targets = interactive.map((el) => {
    const box = el.getBoundingClientRect();
    return { el: describe(el), name: (el.getAttribute("aria-label") ?? el.textContent).trim().slice(0, 40), w: Math.round(box.width), h: Math.round(box.height), inline: el.matches(".loose-letter") };
  });
  const unnamed = interactive.filter((el) => !(el.getAttribute("aria-label") ?? el.textContent).trim()).map(describe);
  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter((h) => inPage(h) && visible(h)).map((h) => `${h.tagName.toLowerCase()}:${h.getAttribute("aria-label") ?? h.textContent.trim()}`);
  const meta = (selector, attr = "content") => document.querySelector(selector)?.getAttribute(attr) ?? null;
  return {
    contrast,
    clipped,
    targets,
    unnamed,
    headings,
    landmarks: { header: !!document.querySelector("header"), main: document.querySelectorAll("main").length, nav: [...document.querySelectorAll("nav")].map((n) => n.getAttribute("aria-label")), footer: !!document.querySelector("footer") },
    imagesWithoutAlt: [...document.images].filter((img) => !img.hasAttribute("alt")).length,
    blankWithoutRel: [...document.querySelectorAll('a[target="_blank"]')].filter((a) => inPage(a) && !/noopener|noreferrer/.test(a.rel)).map((a) => a.href),
    newTabNotAnnounced: [...document.querySelectorAll('a[target="_blank"]')].filter((a) => inPage(a) && !/new tab|↗/i.test(`${a.textContent} ${a.getAttribute("aria-label") ?? ""}`)).map((a) => a.href),
    sideways: document.documentElement.scrollWidth - window.innerWidth,
    wider: [...document.querySelectorAll("body *")].filter((el) => inPage(el) && visible(el) && el.getBoundingClientRect().right > window.innerWidth + 0.5).map(describe).slice(0, 8),
    fonts: [...document.fonts].map((f) => `${f.family} ${f.status}`),
    head: {
      title: document.title,
      lang: document.documentElement.lang,
      description: meta('meta[name="description"]'),
      canonical: meta('link[rel="canonical"]', "href"),
      robots: meta('meta[name="robots"]'),
      viewport: meta('meta[name="viewport"]'),
      themeColor: meta('meta[name="theme-color"]'),
      ogTitle: meta('meta[property="og:title"]'),
      ogDescription: meta('meta[property="og:description"]'),
      ogImage: meta('meta[property="og:image"]'),
      ogUrl: meta('meta[property="og:url"]'),
      ogType: meta('meta[property="og:type"]'),
      twitterCard: meta('meta[name="twitter:card"]'),
      icon: (meta('link[rel="icon"]', "href") ?? "").slice(0, 40),
      appleTouchIcon: meta('link[rel="apple-touch-icon"]', "href"),
    },
  };
}
function watchShift() {
  window.__cls = { value: 0, entries: [] };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue;
      window.__cls.value += entry.value;
      window.__cls.entries.push({ value: +entry.value.toFixed(4), at: Math.round(entry.startTime), nodes: entry.sources.map((s) => s.node?.className || s.node?.nodeName).slice(0, 3) });
    }
  }).observe({ type: "layout-shift", buffered: true });
}

const browser = await launch();
try {
  const PROFILES = [
    ["desktop", { viewport: { width: 1440, height: 900 } }],
    ["phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
    ["320", { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ];
  for (const [profile, options] of PROFILES) {
    const context = await browser.newContext(options);
    await context.addInitScript(watchShift);
    const page = await context.newPage();
    for (const route of ROUTES) {
      const key = `${profile} ${route}`;
      await page.goto(BASE + route, { waitUntil: "load" });
      await page.waitForTimeout(4000); // past hydration and the 2.5 s idle tell
      const m = await page.evaluate(measure);
      const cls = await page.evaluate(() => window.__cls);
      data[key] = { ...m, cls };
      for (const c of m.contrast) if (c.ratio < c.need) flag(key, "contrast", `${c.ratio}:1 (needs ${c.need}) ${c.el} "${c.text}" ${c.size}px`);
      if (options.hasTouch) for (const t of m.targets) if (!t.inline && (t.w < 44 || t.h < 44)) flag(key, "target", `${t.w}×${t.h} ${t.el} "${t.name}"`);
      for (const el of m.unnamed) flag(key, "name", `no accessible name: ${el}`);
      if (m.headings.filter((h) => h.startsWith("h1")).length !== 1) flag(key, "semantics", `h1 count: ${m.headings.join(" | ")}`);
      if (m.landmarks.main !== 1) flag(key, "semantics", `${m.landmarks.main} <main>`);
      if (m.imagesWithoutAlt) flag(key, "semantics", `${m.imagesWithoutAlt} img without alt`);
      for (const href of m.blankWithoutRel) flag(key, "links", `target=_blank without rel: ${href}`);
      for (const text of m.clipped) flag(key, "overflow", `text runs off the screen: ${text}`);
      if (m.sideways > 0) flag(key, "overflow", `scrolls sideways by ${m.sideways}px (${m.wider.join(", ")})`);
      if (cls.value > 0.02) flag(key, "CLS", `${cls.value.toFixed(3)} ${JSON.stringify(cls.entries)}`);
      if (m.fonts.length) flag(key, "fonts", `web fonts in use: ${m.fonts.join(", ")}`);
      if (profile === "desktop") {
        if (!m.head.description) flag(key, "head", "no meta description");
        if (!m.head.ogImage) flag(key, "head", "no og:image");
        if (route === "/404.html" && m.head.robots !== "noindex") flag(key, "head", "404 is indexable");
      }
    }
    await context.close();
  }

  /* Focus order and focus rings (keyboard, desktop). */
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    for (const route of ROUTES) {
      await page.goto(BASE + route, { waitUntil: "load" });
      await page.waitForTimeout(500);
      const stops = [];
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press("Tab");
        const stop = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const style = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          return {
            name: (el.getAttribute("aria-label") ?? el.textContent).trim().slice(0, 30),
            inStage: !!el.closest(".stage-root"),
            ring: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 1.5,
            ringColour: style.outlineColor,
            y: Math.round(box.top),
            x: Math.round(box.left),
            index: [...document.querySelectorAll("*")].indexOf(el),
          };
        });
        if (!stop || stops.some((s) => s.index === stop.index)) break;
        stops.push(stop);
      }
      data[`focus ${route}`] = stops;
      for (const s of stops) {
        if (!s.ring) flag(`focus ${route}`, "focus", `no visible focus ring on "${s.name}"`);
        if (s.inStage) flag(`focus ${route}`, "focus", `Tab reaches the hidden game HUD: "${s.name}"`);
      }
      if (stops.some((s, i) => i > 0 && s.index < stops[i - 1].index)) flag(`focus ${route}`, "focus", "Tab order does not follow the document order");
      await page.screenshot({ path: path.join(OUT, `focus-${route.replace(/\W+/g, "_") || "home"}.png`) });
    }
    await context.close();
  }

  /* Reduced motion. */
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    for (const route of ROUTES) {
      await page.goto(BASE + route, { waitUntil: "load" });
      await page.waitForTimeout(600);
      const motion = await page.evaluate(() => {
        const seconds = (value) => Math.max(...value.split(",").map((part) => (part.trim().endsWith("ms") ? parseFloat(part) / 1000 : parseFloat(part) || 0)));
        const long = [];
        for (const el of document.querySelectorAll(".portfolio, .portfolio *")) {
          const style = getComputedStyle(el);
          const t = seconds(style.transitionDuration);
          const a = style.animationName !== "none" ? seconds(style.animationDuration) : 0;
          if (t > 0.4 || a > 0.4) long.push(`${el.className || el.tagName}: transition ${t}s animation ${a}s`);
        }
        let optIn = false;
        for (const sheet of document.styleSheets)
          for (const rule of sheet.cssRules)
            if (rule instanceof CSSMediaRule && rule.cssText.includes("@view-transition") && matchMedia(rule.conditionText).matches) optIn = true;
            else if (rule.cssText.startsWith("@view-transition")) optIn = true;
        return { long, optIn, running: document.getAnimations().filter((a) => a.playState === "running").length };
      });
      data[`reduced-motion ${route}`] = motion;
      for (const text of motion.long) flag(`reduced-motion ${route}`, "motion", text);
      if (motion.optIn) flag(`reduced-motion ${route}`, "motion", "view transitions still opted in");
    }
    await context.close();
  }
} finally {
  await browser.close();
  server?.close();
}

const byKind = {};
for (const f of findings) (byKind[f.kind] ??= []).push(f);
console.log(`site-audit: ${BASE}\n`);
for (const kind of ["contrast", "target", "focus", "semantics", "name", "links", "overflow", "CLS", "fonts", "motion", "head"]) {
  const list = byKind[kind] ?? [];
  console.log(`${list.length ? "FAIL" : "PASS"}  ${kind.padEnd(10)} ${list.length ? `${list.length} finding(s)` : ""}`);
  for (const f of list) console.log(`        [${f.route}] ${f.text}`);
}
const cls = Object.entries(data).filter(([, v]) => v.cls).map(([k, v]) => `${k}=${v.cls.value.toFixed(3)}`);
console.log(`\nCLS: ${cls.join("  ")}`);
console.log(`head /: ${JSON.stringify(data["desktop /"].head)}`);
console.log(`focus order /contact: ${data["focus /contact"].map((s) => s.name).join(" → ")}`);
writeFileSync(path.join(OUT, "site-audit.json"), JSON.stringify({ base: BASE, findings, data }, null, 1));
process.exit(findings.length ? 1 : 0);
