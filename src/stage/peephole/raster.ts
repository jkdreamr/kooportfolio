/**
 * DOM → paper. Rasterises what the portfolio shows in the viewport into a
 * DPR-scaled Canvas2D image with the same system fonts, each glyph placed at
 * the exact box the browser laid it out in (Range.getClientRects), so the
 * WebGL sheet is pixel-identical to the DOM it replaces for the crossfade.
 *
 * The peephole "o" is not painted into the page: it gets its own signed
 * distance fields (ink and counter) so it stays sharp while stretched, and a
 * counter mask the DOM uses to open the live hole at rest.
 */

export type GlyphBox = { x: number; y: number; width: number; height: number };

export type LetterField = {
  /** CSS px box of the field in the viewport (rest position). */
  box: GlyphBox;
  /** Field resolution in texels. */
  size: number;
  /** RG8: R = ink SDF, G = counter SDF; 128 = edge, 1 texel ≈ `spread`/127 px. */
  data: Uint8Array;
  /** Distance (CSS px) that maps to the full ±127 range. */
  spread: number;
  /** Centre of the counter (CSS px, viewport). */
  center: { x: number; y: number };
  /** Approximate counter radii, CSS px. */
  radius: { x: number; y: number };
  ink: string;
  /** PNG data URL of the counter (white = hole), sized to `box`. */
  counterMask: string;
};

export type PageRaster = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  dpr: number;
  background: string;
  letter: LetterField | null;
};

const PAPER_SKIP = "[data-paper-skip]";

function fontOf(cs: CSSStyleDeclaration) {
  return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
}

/** Split a CSS function argument list on top-level commas. */
export function splitTopLevel(s: string) {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export type GradientStop = { color: string; at: number | null };
/** Parse `linear-gradient(<angle>deg, stops…)`; null for anything else. */
export function parseLinearGradient(css: string): { angle: number; stops: GradientStop[] } | null {
  const m = /^linear-gradient\((.*)\)$/.exec(css.trim());
  if (!m) return null;
  const parts = splitTopLevel(m[1]);
  let angle = 180;
  if (/^-?[\d.]+deg$/.test(parts[0])) angle = parseFloat(parts.shift()!);
  else if (parts[0].startsWith("to ")) {
    const dir = parts.shift()!;
    angle = dir.includes("right") ? 90 : dir.includes("left") ? 270 : dir.includes("top") ? 0 : 180;
  }
  const stops: GradientStop[] = parts.map((p): GradientStop => {
    const pm = /^(.*\))\s*([\d.]+)%$|^(\S+)\s+([\d.]+)%$/.exec(p);
    if (pm) return { color: (pm[1] ?? pm[3]).trim(), at: parseFloat(pm[2] ?? pm[4]) / 100 };
    return { color: p, at: null };
  });
  // Fill implicit positions evenly between known neighbours.
  if (stops[0].at === null) stops[0].at = 0;
  if (stops[stops.length - 1].at === null) stops[stops.length - 1].at = 1;
  for (let i = 1; i < stops.length - 1; i++) {
    if (stops[i].at !== null) continue;
    let j = i;
    while (stops[j].at === null) j++;
    const a = stops[i - 1].at!;
    const b = stops[j].at!;
    for (let k = i; k < j; k++) stops[k].at = a + ((b - a) * (k - i + 1)) / (j - i + 1);
  }
  return { angle, stops };
}

type Shadow = { color: string; x: number; y: number; blur: number; spread: number; inset: boolean };
export function parseBoxShadows(css: string): Shadow[] {
  if (!css || css === "none") return [];
  return splitTopLevel(css).map((s) => {
    const inset = /\binset\b/.test(s);
    const color = /(rgba?\([^)]*\)|#[0-9a-f]+)/i.exec(s)?.[1] ?? "rgba(0,0,0,0)";
    const nums = s
      .replace(color, "")
      .replace("inset", "")
      .trim()
      .split(/\s+/)
      .map((n) => parseFloat(n))
      .filter((n) => Number.isFinite(n));
    return { color, x: nums[0] ?? 0, y: nums[1] ?? 0, blur: nums[2] ?? 0, spread: nums[3] ?? 0, inset };
  });
}

function fillGradient(ctx: CanvasRenderingContext2D, r: DOMRect, css: string) {
  const g = parseLinearGradient(css);
  if (!g) return null;
  const a = (g.angle * Math.PI) / 180;
  const half = (Math.abs(r.width * Math.sin(a)) + Math.abs(r.height * Math.cos(a))) / 2;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const dx = Math.sin(a) * half;
  const dy = -Math.cos(a) * half;
  const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  for (const s of g.stops) grad.addColorStop(Math.min(1, Math.max(0, s.at ?? 0)), s.color);
  return grad;
}

function radiusOf(cs: CSSStyleDeclaration, r: DOMRect) {
  const v = parseFloat(cs.borderTopLeftRadius) || 0;
  return Math.min(v, r.height / 2, r.width / 2);
}

/** Paint an element's own box: background colour/gradient, border, shadows. */
function paintBox(ctx: CanvasRenderingContext2D, el: Element, cs: CSSStyleDeclaration) {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return;
  const bg = cs.backgroundColor;
  const img = cs.backgroundImage;
  const hasBg = (bg && !/rgba\(.*,\s*0\)$/.test(bg) && bg !== "transparent") || (img && img !== "none");
  const bw = parseFloat(cs.borderTopWidth) || 0;
  const shadows = parseBoxShadows(cs.boxShadow);
  if (!hasBg && !bw && !shadows.length) return;
  const rad = radiusOf(cs, r);
  const path = () => {
    ctx.beginPath();
    ctx.roundRect(r.left, r.top, r.width, r.height, rad);
  };
  // Outer shadows: draw an opaque shape offscreen and keep only its shadow.
  for (const s of shadows.filter((x) => !x.inset).reverse()) {
    ctx.save();
    ctx.shadowColor = s.color;
    ctx.shadowBlur = s.blur;
    ctx.shadowOffsetX = s.x + 100000;
    ctx.shadowOffsetY = s.y;
    ctx.beginPath();
    ctx.roundRect(r.left - 100000 - s.spread, r.top - s.spread, r.width + 2 * s.spread, r.height + 2 * s.spread, rad + s.spread);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  path();
  ctx.clip();
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(r.left, r.top, r.width, r.height);
  }
  if (img && img !== "none") {
    for (const layer of splitTopLevel(img).reverse()) {
      const grad = fillGradient(ctx, r, layer);
      if (grad) {
        ctx.fillStyle = grad;
        ctx.fillRect(r.left, r.top, r.width, r.height);
      }
    }
  }
  // Inset highlights: 1px lines along the offset edge.
  for (const s of shadows.filter((x) => x.inset)) {
    ctx.fillStyle = s.color;
    if (s.y > 0) ctx.fillRect(r.left, r.top, r.width, s.y);
    if (s.y < 0) ctx.fillRect(r.left, r.bottom + s.y, r.width, -s.y);
    if (s.x > 0) ctx.fillRect(r.left, r.top, s.x, r.height);
    if (s.x < 0) ctx.fillRect(r.right + s.x, r.top, -s.x, r.height);
  }
  ctx.restore();
  if (bw > 0) {
    ctx.save();
    ctx.lineWidth = bw;
    ctx.beginPath();
    ctx.roundRect(r.left + bw / 2, r.top + bw / 2, r.width - bw, r.height - bw, Math.max(0, rad - bw / 2));
    // Per-side colours (top highlight): stroke all in the side colour, then the top.
    ctx.strokeStyle = cs.borderRightColor;
    ctx.stroke();
    if (cs.borderTopColor !== cs.borderRightColor) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.left, r.top, r.width, Math.max(rad, bw * 2));
      ctx.clip();
      ctx.beginPath();
      ctx.roundRect(r.left + bw / 2, r.top + bw / 2, r.width - bw, r.height - bw, Math.max(0, rad - bw / 2));
      ctx.strokeStyle = cs.borderTopColor;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

const metricsCache = new Map<string, { asc: number; desc: number }>();
function metrics(ctx: CanvasRenderingContext2D, font: string) {
  let m = metricsCache.get(font);
  if (!m) {
    ctx.font = font;
    const t = ctx.measureText("Hg");
    m = { asc: t.fontBoundingBoxAscent, desc: t.fontBoundingBoxDescent };
    metricsCache.set(font, m);
  }
  return m;
}

/** Paint one text node glyph by glyph at its laid-out boxes. */
function paintText(ctx: CanvasRenderingContext2D, node: Text, range: Range) {
  const parent = node.parentElement;
  if (!parent) return;
  const cs = getComputedStyle(parent);
  if (cs.visibility === "hidden") return;
  const font = fontOf(cs);
  const { asc, desc } = metrics(ctx, font);
  ctx.font = font;
  ctx.fillStyle = cs.color;
  ctx.textBaseline = "alphabetic";
  const text = node.data;
  const upper = cs.textTransform === "uppercase";
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    if (/\s/.test(ch)) continue;
    // Keep surrogate pairs together.
    let end = i + 1;
    if (ch.charCodeAt(0) >= 0xd800 && ch.charCodeAt(0) <= 0xdbff && i + 1 < text.length) {
      ch += text[i + 1];
      end++;
    }
    range.setStart(node, i);
    range.setEnd(node, end);
    const rects = range.getClientRects();
    const r = rects[0];
    if (!r || r.width === 0) continue;
    // The box is the font's content area: baseline sits `asc` below its top,
    // scaled if the browser reports a different content height.
    const k = r.height / (asc + desc || 1);
    ctx.fillText(upper ? ch.toUpperCase() : ch, r.left, r.top + asc * k);
    i = end - 1;
  }
}

function visibleInViewport(r: DOMRect, w: number, h: number) {
  return r.bottom > -40 && r.top < h + 40 && r.right > -40 && r.left < w + 40;
}

/** The portfolio's paper grain tile (public/, 64 CSS px; `.portfolio` in
    style.css). Decoded at load so the first raster already has it. */
const PAPER_GRAIN = "/paper-grain.png";
let grain: HTMLImageElement | null = null;
if (typeof Image !== "undefined") {
  grain = new Image();
  grain.src = PAPER_GRAIN;
}

/**
 * Rasterise `root` as seen in the viewport. Elements matching
 * [data-paper-skip] (and their subtrees) are left out; `letter` is the
 * element holding the peephole "o".
 */
export function rasterizePage(root: HTMLElement, letter: HTMLElement | null, dpr: number): PageRaster {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const rootCs = getComputedStyle(root);
  const background = rootCs.backgroundColor || "#fff";
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  const bodyImg = rootCs.backgroundImage;
  if (bodyImg && bodyImg !== "none") {
    const grad = fillGradient(ctx, new DOMRect(0, 0, width, height), bodyImg);
    if (grad) {
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }
  }
  // The paper grain (a tiled image on the root): same tile, same origin.
  if (bodyImg && bodyImg.includes(PAPER_GRAIN) && grain?.complete && grain.naturalWidth) {
    const pattern = ctx.createPattern(grain, "repeat");
    if (pattern) {
      const o = root.getBoundingClientRect();
      ctx.save();
      ctx.translate(o.left, o.top);
      ctx.fillStyle = pattern;
      ctx.fillRect(-o.left, -o.top, width, height);
      ctx.restore();
    }
  }
  const range = document.createRange();
  const walk = (el: Element) => {
    if (el.matches(PAPER_SKIP)) return;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return;
    const r = el.getBoundingClientRect();
    // Visually hidden (screen-reader only) content is not on the paper.
    if (cs.position === "absolute" && (r.width <= 1 || r.height <= 1) && cs.overflow === "hidden") return;
    if (cs.clip && cs.clip !== "auto" && /rect\(0(px)?,? 0(px)?/.test(cs.clip)) return;
    if (!visibleInViewport(r, width, height) && cs.position !== "static") return;
    if (el !== root) paintBox(ctx, el, cs);
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) paintText(ctx, child as Text, range);
      else if (child.nodeType === Node.ELEMENT_NODE) walk(child as Element);
    }
  };
  walk(root);
  range.detach();
  return {
    canvas,
    width,
    height,
    dpr,
    background,
    letter: letter ? letterField(letter) : null,
  };
}

/* --------------------------------------------------------- letter fields */

/**
 * Two-pass 8-neighbour chamfer distance (in texels) to the nearest `true`
 * cell. Exact enough for antialiasing a glyph edge; O(n).
 */
export function chamfer(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
  const a = 1;
  const b = Math.SQRT2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + a);
      if (y > 0) {
        v = Math.min(v, d[i - w] + a);
        if (x > 0) v = Math.min(v, d[i - w - 1] + b);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + b);
      }
      d[i] = v;
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + a);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + a);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + b);
        if (x > 0) v = Math.min(v, d[i + w - 1] + b);
      }
      d[i] = v;
    }
  return d;
}

/** Signed distance (texels): negative inside `mask`. */
export function signedField(mask: Uint8Array, w: number, h: number) {
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) inv[i] = mask[i] ? 0 : 1;
  const out = chamfer(mask, w, h);
  const inside = chamfer(inv, w, h);
  for (let i = 0; i < out.length; i++) out[i] = mask[i] ? -(inside[i] - 0.5) : out[i] - 0.5;
  return out;
}

/** Flood the transparent region enclosed by ink, starting from (sx, sy). */
export function floodCounter(ink: Uint8Array, w: number, h: number, sx: number, sy: number) {
  const out = new Uint8Array(w * h);
  const start = sy * w + sx;
  if (ink[start]) return out;
  const stack = [start];
  out[start] = 1;
  let leaked = false;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) leaked = true;
    for (const j of [i - 1, i + 1, i - w, i + w]) {
      if (j < 0 || j >= w * h || out[j] || ink[j]) continue;
      if ((j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue;
      out[j] = 1;
      stack.push(j);
    }
  }
  return leaked ? new Uint8Array(w * h) : out;
}

/** Build the ink/counter SDFs of the peephole letter from its live layout. */
export function letterField(el: HTMLElement): LetterField | null {
  const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && /\S/.test((n as Text).data)) as
    | Text
    | undefined;
  if (!node) return null;
  const range = document.createRange();
  const idx = node.data.search(/\S/);
  range.setStart(node, idx);
  range.setEnd(node, idx + 1);
  // The glyph's untransformed box: measure with the letter's transform removed.
  const prev = el.style.transform;
  el.style.transform = "none";
  const r = range.getBoundingClientRect();
  el.style.transform = prev;
  range.detach();
  if (!r.width) return null;
  const cs = getComputedStyle(el);
  const font = fontOf(cs);
  const scratch = document.createElement("canvas").getContext("2d")!;
  const { asc, desc } = metrics(scratch, font);
  const k = r.height / (asc + desc || 1);
  const pad = Math.ceil(parseFloat(cs.fontSize) * 0.12);
  const box = { x: r.left - pad, y: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
  // Supersample so the field is smooth at 2–3× magnification.
  const size = 256;
  const sx = size / box.width;
  const sy = size / box.height;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  ctx.font = font;
  ctx.fillStyle = "#000";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(node.data[idx], pad, pad + asc * k);
  const px = ctx.getImageData(0, 0, size, size).data;
  const ink = new Uint8Array(size * size);
  for (let i = 0; i < ink.length; i++) ink[i] = px[i * 4 + 3] >= 128 ? 1 : 0;
  // Find the counter: flood from the ink's centre of mass.
  let mx = 0;
  let my = 0;
  let n = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (ink[y * size + x]) {
        mx += x;
        my += y;
        n++;
      }
  if (!n) return null;
  const cx = Math.round(mx / n);
  const cy = Math.round(my / n);
  const counter = floodCounter(ink, size, size, cx, cy);
  const inkSdf = signedField(ink, size, size);
  const cntSdf = signedField(counter, size, size);
  // Texels → CSS px (anisotropic boxes: use the mean scale).
  const texelPx = (1 / sx + 1 / sy) / 2;
  const spread = 24;
  const data = new Uint8Array(size * size * 4);
  let minX = size;
  let maxX = 0;
  let minY = size;
  let maxY = 0;
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = enc(inkSdf[i] * texelPx, spread);
    data[i * 4 + 1] = enc(cntSdf[i] * texelPx, spread);
    data[i * 4 + 3] = 255;
    if (counter[i]) {
      const x = i % size;
      const y = (i - x) / size;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const has = maxX >= minX;
  const center = has
    ? { x: box.x + ((minX + maxX + 1) / 2) / sx, y: box.y + ((minY + maxY + 1) / 2) / sy }
    : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const radius = has
    ? { x: (maxX - minX + 1) / sx / 2, y: (maxY - minY + 1) / sy / 2 }
    : { x: 0, y: 0 };
  // Counter mask for CSS (white = hole, antialiased from the SDF).
  const m = document.createElement("canvas");
  m.width = size;
  m.height = size;
  const mctx = m.getContext("2d")!;
  const img = mctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const dpx = cntSdf[i] * texelPx;
    const a = Math.max(0, Math.min(1, 0.5 - dpx));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = Math.round(a * 255);
  }
  mctx.putImageData(img, 0, 0);
  return {
    box,
    size,
    data,
    spread,
    center,
    radius,
    ink: cs.color,
    counterMask: m.toDataURL("image/png"),
  };
}
function enc(dpx: number, spread: number) {
  return Math.max(0, Math.min(255, Math.round(128 + (dpx / spread) * 127)));
}
