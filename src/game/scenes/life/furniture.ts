/**
 * Furniture and props drawn with the room-life kit. Everything draws at the
 * local origin, standing on y = 0 and facing +z (toward the door); place it
 * with `k.at(x, z, turn, () => sofa(k))`.
 *
 * Wall pieces (frames, shelves, switches) draw in the wall's plane: local x
 * runs along the wall, y is up, +z comes out of the wall into the room.
 */
import { hash01, type Kit, type PropInit, type V3 } from "./kit";

export const WOOD = "#8b6540",
  DARK_WOOD = "#624a36",
  PALE_WOOD = "#c9a676",
  STEEL = "#46535a",
  BRASS = "#b19a65",
  CREAM = "#eadfc4",
  PAPER = "#f1e8d0",
  INK = "#2f3b3a",
  LEAF = "#5d8a4e",
  LEAF_DARK = "#3f6b47",
  TERRACOTTA = "#b85d3b";

const BOOKS = ["#496b61", "#a54f38", "#b5a16e", "#435668", "#7a5578", "#c98a4b", "#2f5d6b", "#8b3f45"];

/* ------------------------------------------------------------------ rugs */

/** A flat rug with a border and optional stripes. Lies above the boards. */
export function rug(k: Kit, w: number, d: number, color: string, border = CREAM, stripes?: string) {
  k.slab([0, 0.085, 0], [w, 0.03, d], border);
  k.slab([0, 0.1, 0], [w - 0.36, 0.03, d - 0.36], color);
  if (stripes) {
    k.slab([0, 0.115, -d * 0.28], [w - 0.7, 0.02, 0.16], stripes);
    k.slab([0, 0.115, d * 0.28], [w - 0.7, 0.02, 0.16], stripes);
  }
}
export function roundRug(k: Kit, r: number, color: string, border = CREAM) {
  k.cyl([0, 0.085, 0], [r, 0.03, r], border);
  k.cyl([0, 0.1, 0], [r - 0.22, 0.03, r - 0.22], color);
}
/** A long hall runner. */
export function runner(k: Kit, w: number, d: number, color: string, trim = BRASS) {
  k.slab([0, 0.085, 0], [w, 0.03, d], color);
  k.slab([-w / 2 + 0.14, 0.1, 0], [0.08, 0.02, d - 0.3], trim);
  k.slab([w / 2 - 0.14, 0.1, 0], [0.08, 0.02, d - 0.3], trim);
}

/* --------------------------------------------------------------- seating */

/** A sofa `w` wide, back to −z. Seat top is 0.62. */
export function sofa(k: Kit, w = 3, color = "#5d7565", pillow = "#d1ab54") {
  const dark = shade(color, 0.82);
  k.box([0, 0.3, 0], [w, 0.44, 1.2], dark);
  k.box([0, 0.86, -0.46], [w, 0.95, 0.34], color);
  for (const side of [-1, 1]) k.box([side * (w / 2 - 0.16), 0.66, 0.02], [0.32, 0.66, 1.24], color);
  const seats = Math.max(2, Math.round((w - 0.6) / 0.95));
  const sw = (w - 0.7) / seats;
  for (let i = 0; i < seats; i++) k.box([-(w - 0.7) / 2 + sw * (i + 0.5), 0.58, 0.1], [sw - 0.05, 0.18, 0.92], shade(color, 1.1));
  k.box([-(w / 2 - 0.62), 0.86, -0.12], [0.5, 0.46, 0.22], pillow, [-0.2, 0.3, 0]);
  k.clutter(() => k.box([w / 2 - 0.66, 0.84, -0.14], [0.46, 0.42, 0.2], shade(pillow, 0.8), [-0.2, -0.25, 0]));
  for (const x of [-(w / 2 - 0.2), w / 2 - 0.2]) for (const z of [-0.45, 0.45]) k.slab([x, 0.05, z], [0.12, 0.1, 0.12], DARK_WOOD);
}
/** An armchair, back to −z. */
export function armchair(k: Kit, color = "#a35e46", pillow?: string) {
  const dark = shade(color, 0.82);
  k.box([0, 0.3, 0], [1.3, 0.44, 1.15], dark);
  k.box([0, 0.9, -0.44], [1.3, 1.05, 0.3], color);
  for (const side of [-1, 1]) k.box([side * 0.56, 0.66, 0.02], [0.26, 0.6, 1.16], color);
  k.box([0, 0.58, 0.08], [0.8, 0.18, 0.9], shade(color, 1.1));
  if (pillow) k.box([0.05, 0.86, -0.16], [0.46, 0.42, 0.2], pillow, [-0.22, 0.2, 0]);
}
/** A round pouf or ottoman. */
export function pouf(k: Kit, color = "#c98a4b", r = 0.48) {
  k.cyl([0, 0.24, 0], [r, 0.44, r], color);
  k.cyl([0, 0.47, 0], [r * 0.86, 0.06, r * 0.86], shade(color, 1.12));
}
/** A bean bag: one squashed ball and a dent. */
export function beanBag(k: Kit, color = "#7a5578") {
  k.ball([0, 0.36, 0], [0.72, 0.4, 0.68], color);
  k.ball([0, 0.62, -0.26], [0.5, 0.36, 0.3], shade(color, 1.1));
}
/** A flat floor cushion. */
export function cushion(k: Kit, color = "#b5a16e", size = 0.8) {
  k.box([0, 0.14, 0], [size, 0.16, size], color);
  k.slab([0, 0.23, 0], [size * 0.3, 0.02, size * 0.3], shade(color, 0.8));
}
export function stool(k: Kit, color = "#a7543d") {
  k.cyl([0, 0.62, 0], [0.34, 0.12, 0.34], color);
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) k.slab([x, 0.28, z], [0.08, 0.56, 0.08], DARK_WOOD);
}
/** A simple side chair, back to −z. */
export function chair(k: Kit, color = "#496159", wood = DARK_WOOD) {
  k.box([0, 0.56, 0], [0.62, 0.12, 0.6], color);
  k.box([0, 1.02, -0.27], [0.62, 0.7, 0.1], color);
  for (const [x, z] of [[-0.25, -0.24], [0.25, -0.24], [-0.25, 0.24], [0.25, 0.24]]) k.slab([x, 0.26, z], [0.07, 0.52, 0.07], wood);
}
/** A bench with a slatted top. */
export function bench(k: Kit, w = 2.4, color = WOOD) {
  k.box([0, 0.5, 0], [w, 0.12, 0.6], color);
  for (const side of [-1, 1]) k.box([side * (w / 2 - 0.2), 0.24, 0], [0.12, 0.46, 0.5], STEEL);
}

/* ---------------------------------------------------------------- tables */

export function coffeeTable(k: Kit, w = 1.7, d = 0.9, color = WOOD) {
  k.box([0, 0.46, 0], [w, 0.1, d], color);
  k.slab([0, 0.2, 0], [w - 0.3, 0.05, d - 0.25], shade(color, 0.8));
  for (const x of [-1, 1]) for (const z of [-1, 1]) k.slab([x * (w / 2 - 0.1), 0.22, z * (d / 2 - 0.1)], [0.08, 0.44, 0.08], shade(color, 0.72));
}
export function sideTable(k: Kit, color = WOOD, r = 0.42, h = 0.7) {
  k.cyl([0, h, 0], [r, 0.07, r], color);
  k.cyl([0, h / 2, 0], [0.06, h, 0.06], shade(color, 0.72));
  k.cyl([0, 0.04, 0], [r * 0.6, 0.06, r * 0.6], shade(color, 0.72));
}
/** A work desk `w` wide, 0.95 high, user sits at +z. */
export function desk(k: Kit, w = 2.6, d = 1.2, color = WOOD) {
  k.box([0, 0.95, 0], [w, 0.12, d], color);
  for (const side of [-1, 1]) k.box([side * (w / 2 - 0.14), 0.46, 0], [0.12, 0.9, d - 0.2], shade(color, 0.72));
  k.slab([0, 0.6, -d / 2 + 0.08], [w - 0.3, 0.5, 0.05], shade(color, 0.8));
}
/** A long table on trestles. */
export function longTable(k: Kit, w = 4, d = 1.3, color = WOOD, h = 0.95) {
  k.box([0, h, 0], [w, 0.14, d], color);
  for (const side of [-1, 1]) {
    k.box([side * (w / 2 - 0.5), h / 2 - 0.04, 0], [0.14, h - 0.1, d - 0.3], shade(color, 0.72));
    k.slab([side * (w / 2 - 0.5), 0.06, 0], [0.24, 0.1, d - 0.1], shade(color, 0.72));
  }
  k.slab([0, 0.36, 0], [w - 1, 0.08, 0.1], shade(color, 0.72));
}
export function consoleTable(k: Kit, w = 1.8, color = DARK_WOOD) {
  k.box([0, 0.86, 0], [w, 0.09, 0.48], color);
  k.slab([0, 0.3, 0], [w - 0.2, 0.05, 0.4], shade(color, 1.15));
  for (const x of [-1, 1]) for (const z of [-1, 1]) k.slab([x * (w / 2 - 0.08), 0.42, z * 0.18], [0.07, 0.84, 0.07], color);
}

/* ---------------------------------------------------------------- storage */

/** Books standing on a shelf, from x0 to x1, base at y. */
export function bookRow(k: Kit, x0: number, x1: number, y: number, z: number, seed: number, depth = 0.42) {
  let x = x0,
    i = 0;
  while (x < x1 - 0.12) {
    const w = 0.11 + hash01(seed, i) * 0.09;
    const h = 0.42 + hash01(seed + 3, i) * 0.22;
    const gap = hash01(seed + 7, i) > 0.86;
    if (gap && x + 0.5 < x1) {
      // A leaning book, then air.
      k.slab([x + 0.14, y + h / 2 - 0.02, z], [w, h, depth], BOOKS[(i + seed) % BOOKS.length], [0, 0, -0.32]);
      x += 0.46;
    } else {
      k.slab([x + w / 2, y + h / 2, z], [w, h, depth], BOOKS[(i * 3 + seed) % BOOKS.length]);
      x += w + 0.012;
    }
    i++;
  }
}
/** A bookcase `w` wide, `rows` shelves, against −z. */
export function bookcase(k: Kit, w = 2.6, rows = 4, seed = 1, color = DARK_WOOD, full = true) {
  const h = 0.3 + rows * 0.78;
  k.slab([0, h / 2, -0.24], [w, h, 0.06], shade(color, 0.75));
  for (const side of [-1, 1]) k.box([side * (w / 2 - 0.06), h / 2, 0], [0.12, h, 0.56], color);
  for (let r = 0; r <= rows; r++) k.slab([0, 0.14 + r * 0.78, 0], [w - 0.2, 0.07, 0.54], shade(color, 1.18));
  for (let r = 0; r < rows; r++) {
    const y = 0.18 + r * 0.78;
    if (!full && hash01(seed, r + 20) > 0.55) {
      // A shelf of objects instead of books.
      k.box([-w * 0.22, y + 0.2, 0], [0.5, 0.36, 0.4], BOOKS[(r + seed) % BOOKS.length]);
      k.cyl([w * 0.16, y + 0.18, 0], [0.16, 0.36, 0.16], CREAM);
      k.clutter(() => k.ball([w * 0.34, y + 0.14, 0.04], [0.14, 0.14, 0.14], BRASS));
    } else bookRow(k, -w / 2 + 0.16, w / 2 - 0.16, y, 0, seed * 13 + r);
  }
  k.slab([0, h + 0.03, 0], [w + 0.1, 0.07, 0.62], shade(color, 1.1));
}
/** A low cabinet (sideboard) with doors; top at `h`. */
export function sideboard(k: Kit, w = 2.4, h = 0.9, color = DARK_WOOD, door = "#617064") {
  k.box([0, h / 2, 0], [w, h, 0.6], color);
  k.slab([0, h + 0.03, 0], [w + 0.12, 0.07, 0.68], shade(color, 1.25));
  const doors = Math.max(2, Math.round(w / 0.8));
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + (w / doors) * (i + 0.5);
    k.slab([x, h / 2, 0.31], [w / doors - 0.08, h - 0.16, 0.04], i % 2 ? door : shade(door, 1.12));
    k.slab([x + (i % 2 ? -1 : 1) * (w / doors / 2 - 0.12), h / 2, 0.345], [0.04, 0.16, 0.03], BRASS);
  }
}
export function crate(k: Kit, s = 0.7, color = "#a98250") {
  k.box([0, s / 2, 0], [s, s, s], color);
  k.slab([0, s / 2, s / 2 + 0.01], [s * 0.86, s * 0.14, 0.03], shade(color, 0.75));
  k.slab([0, s * 0.82, s / 2 + 0.01], [s * 0.86, s * 0.1, 0.03], shade(color, 0.75));
}
/** A loose stack of cardboard boxes. */
export function boxStack(k: Kit, seed = 1) {
  k.box([0, 0.3, 0], [0.8, 0.6, 0.7], "#b89362", [0, 0.1, 0]);
  k.box([0.06, 0.82, 0.02], [0.62, 0.44, 0.56], "#c5a373", [0, -0.2 + hash01(seed) * 0.4, 0]);
  k.clutter(() => k.box([-0.02, 1.16, 0], [0.4, 0.24, 0.4], "#a98250", [0, 0.5, 0]));
  k.slab([0, 0.3, 0.36], [0.5, 0.08, 0.02], PAPER, [0, 0.1, 0]);
}
/** Flat stack of books. */
export function bookStack(k: Kit, n = 3, seed = 1) {
  for (let i = 0; i < n; i++)
    k.slab([0, 0.05 + i * 0.09, 0], [0.5 - i * 0.03, 0.085, 0.36], BOOKS[(i * 2 + seed) % BOOKS.length], [0, (hash01(seed, i) - 0.5) * 0.7, 0]);
}

/* ---------------------------------------------------------------- plants */

/** A potted plant; `kind` 0 bushy, 1 tall fronds, 2 a little tree. */
export function plant(k: Kit, kind = 0, scale = 1) {
  k.at(0, 0, 0, () => plantPot(k), 0, scale);
  k.at(0, 0, 0, () => plantLeaves(k, kind), 0, scale);
}
export function plantPot(k: Kit) {
  k.cyl([0, 0.24, 0], [0.3, 0.48, 0.3], TERRACOTTA);
  k.cyl([0, 0.5, 0], [0.34, 0.08, 0.34], "#d68a58");
}
export function plantLeaves(k: Kit, kind = 0) {
  if (kind === 1) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      k.cone([Math.sin(a) * 0.14, 1.12, Math.cos(a) * 0.14], [0.14, 1.2, 0.07], i % 2 ? LEAF : LEAF_DARK, [0.32, a, 0]);
    }
  } else if (kind === 2) {
    k.cyl([0, 0.95, 0], [0.05, 0.9, 0.05], DARK_WOOD);
    k.ball([0, 1.62, 0], [0.5, 0.44, 0.5], LEAF_DARK);
    k.ball([0.26, 1.42, 0.12], [0.3, 0.26, 0.3], LEAF);
    k.ball([-0.22, 1.86, -0.08], [0.28, 0.24, 0.28], LEAF);
  } else {
    k.ball([0, 0.86, 0], [0.42, 0.36, 0.42], LEAF_DARK);
    k.ball([0.22, 1.02, 0.1], [0.26, 0.3, 0.24], LEAF);
    k.ball([-0.2, 1.08, -0.06], [0.24, 0.3, 0.24], LEAF);
  }
}
/** A plant you can water: the leaves swell. */
export function wateredPlant(k: Kit, id: string, kind = 0, scale = 1, label = "Plant") {
  k.at(0, 0, 0, () => {
    plantPot(k);
    k.prop(
      { id, label, verb: "Water", motion: { kind: "pulse", amount: 0.22 }, pivot: [0, 0.5, 0], sound: "swish", pop: "💧", anchor: kind === 2 ? 2.2 * scale : 1.5 * scale },
      () => plantLeaves(k, kind),
    );
  }, 0, scale);
}
/** A hanging planter on a wall bracket (wall-local). */
export function hangingPlant(k: Kit) {
  k.slab([0, 0.5, 0.2], [0.06, 0.06, 0.44], DARK_WOOD);
  k.slab([0, 0.22, 0.38], [0.02, 0.5, 0.02], BRASS);
  k.cyl([0, -0.1, 0.38], [0.22, 0.24, 0.22], CREAM);
  k.ball([0, 0.12, 0.38], [0.3, 0.2, 0.3], LEAF);
  k.cone([0.16, -0.36, 0.44], [0.07, 0.5, 0.07], LEAF_DARK, [Math.PI, 0, 0.1]);
  k.clutter(() => k.cone([-0.14, -0.3, 0.3], [0.06, 0.4, 0.06], LEAF, [Math.PI, 0, -0.1]));
}

/* ----------------------------------------------------------------- lamps */

/** A floor lamp you can switch. `on` lamps are lit when you walk in. */
export function floorLamp(k: Kit, id: string, on = true, shadeColor = "#e8d2a0") {
  k.cyl([0, 0.04, 0], [0.26, 0.07, 0.26], STEEL);
  k.cyl([0, 0.9, 0], [0.035, 1.7, 0.035], BRASS);
  k.ball([0, 1.86, 0], [0.32, 0.27, 0.32], shadeColor);
  k.cyl([0, 1.62, 0], [0.12, 0.06, 0.12], BRASS);
  k.glow([0, 1.86, 0], [0.335, 0.285, 0.335], id);
  k.pool(0, 0, 2.6, 2.6, id);
  k.prop({ id, label: "Floor lamp", verb: "Switch on", verbOn: "Switch off", action: { type: "lamp" }, sound: "ui-toggle", anchor: 2.3, on });
}
/** A table lamp; stands on whatever is at the local origin's height. */
export function tableLamp(k: Kit, id: string, on = true, shadeColor = "#24715b", label = "Lamp") {
  k.cyl([0, 0.03, 0], [0.15, 0.05, 0.15], BRASS);
  k.cyl([0, 0.24, 0], [0.03, 0.4, 0.03], BRASS);
  k.ball([0, 0.52, 0], [0.23, 0.17, 0.23], shadeColor);
  k.glow([0, 0.52, 0], [0.24, 0.18, 0.24], id);
  k.pool(0, 0, 1.7, 1.7, id);
  k.prop({ id, label, verb: "Switch on", verbOn: "Switch off", action: { type: "lamp" }, sound: "ui-toggle", anchor: 0.9, on });
}
/** A paper lantern on the floor. */
export function lantern(k: Kit, id: string, on = true) {
  k.cyl([0, 0.05, 0], [0.24, 0.08, 0.24], DARK_WOOD);
  k.ball([0, 0.46, 0], [0.34, 0.4, 0.34], "#f0e2bd");
  k.cyl([0, 0.88, 0], [0.14, 0.06, 0.14], DARK_WOOD);
  k.glow([0, 0.46, 0], [0.35, 0.41, 0.35], id);
  k.pool(0, 0, 2, 2, id);
  k.prop({ id, label: "Lantern", verb: "Light", verbOn: "Put out", action: { type: "lamp" }, sound: "ui-toggle", anchor: 1.3, on });
}
/** A wall switch (wall-local): every lamp in the room follows it. */
export function lightSwitch(k: Kit, id = "switch") {
  k.slab([0, 0, 0.02], [0.22, 0.32, 0.04], CREAM);
  k.prop(
    { id, label: "Light switch", verb: "Flip", motion: { kind: "press", depth: 0.02 }, action: { type: "switch" }, sound: "ui-toggle", anchor: 0, reach: 2.4 },
    () => k.slab([0, 0, 0.06], [0.08, 0.14, 0.05], "#c9b98f"),
  );
}
/** Fairy lights strung between two wall points (wall-local, always on). */
export function stringLights(k: Kit, x0: number, x1: number, y: number, n = 9, sag = 0.3) {
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const drop = sag * 4 * t * (1 - t);
    k.glow([x, y - drop, 0.12], [0.07, 0.09, 0.07]);
    if (i < n) {
      const t2 = (i + 0.5) / n;
      k.slab([x0 + (x1 - x0) * t2, y - sag * 4 * t2 * (1 - t2) + 0.07, 0.1], [(x1 - x0) / n, 0.02, 0.02], INK);
    }
  }
}
/** Daylight falling through a back-wall window onto the floor. */
export function windowLight(k: Kit, x: number, wallZ: number, out = 2.6) {
  k.pool(x + 0.5, wallZ + out, 1.5, 2.5);
}
/** A pin board on two legs, facing +z; `id` makes it readable. */
export function standingBoard(k: Kit, init?: { id: string; label: string; title: string; text: string }, seed = 2) {
  for (const side of [-1, 1]) {
    k.slab([side * 0.8, 0.9, 0], [0.07, 1.8, 0.07], DARK_WOOD);
    k.slab([side * 0.8, 0.04, 0], [0.1, 0.08, 0.7], DARK_WOOD);
  }
  const draw = () => k.at(0, 0.05, 0, () => corkBoard(k, 1.9, 1.25, seed), 1.45);
  if (!init) return draw();
  k.prop(
    { id: init.id, label: init.label, verb: "Read", motion: { kind: "wobble", axis: "x", angle: 0.06 }, pivot: [0, 0.8, 0], action: { type: "read", title: init.title, text: init.text }, sound: "paper", anchor: 2.2 },
    draw,
  );
}

/* --------------------------------------------------------------- wall art */

/** A framed picture (wall-local). `art` paints simple colour fields. */
export function frame(k: Kit, w: number, h: number, art: string[], wood = DARK_WOOD) {
  k.slab([0, 0, 0.03], [w, h, 0.06], wood);
  k.slab([0, 0, 0.065], [w - 0.14, h - 0.14, 0.02], art[0] ?? CREAM);
  if (art[1]) k.slab([-w * 0.14, -h * 0.12, 0.08], [w * 0.4, h * 0.42, 0.015], art[1]);
  if (art[2]) k.slab([w * 0.18, h * 0.12, 0.08], [w * 0.28, h * 0.3, 0.015], art[2]);
}
/** A framed thing you can read: it swings on its nail. */
export function readableFrame(k: Kit, init: { id: string; label: string; title: string; text: string; verb?: string }, w: number, h: number, art: string[], wood = DARK_WOOD) {
  k.prop(
    {
      id: init.id,
      label: init.label,
      verb: init.verb ?? "Read",
      motion: { kind: "wobble", axis: "z", angle: 0.14 },
      pivot: [0, h / 2, 0],
      action: { type: "read", title: init.title, text: init.text },
      sound: "paper",
      anchor: 0,
      reach: 2.6,
    },
    () => frame(k, w, h, art, wood),
  );
}
/** A shelf on brackets (wall-local) for things to stand on; top at y = 0. */
export function wallShelf(k: Kit, w = 1.8, color = WOOD) {
  k.slab([0, -0.03, 0.2], [w, 0.06, 0.4], color);
  for (const side of [-1, 1]) k.slab([side * (w / 2 - 0.2), -0.16, 0.1], [0.06, 0.22, 0.2], shade(color, 0.72));
}
/** A wall clock (wall-local). */
export function wallClock(k: Kit, color = CREAM) {
  k.cyl([0, 0, 0.05], [0.36, 0.08, 0.36], DARK_WOOD, [Math.PI / 2, 0, 0]);
  k.cyl([0, 0, 0.09], [0.31, 0.03, 0.31], color, [Math.PI / 2, 0, 0]);
  k.slab([0, 0.09, 0.115], [0.03, 0.2, 0.02], INK);
  k.slab([0.07, 0, 0.115], [0.16, 0.03, 0.02], INK);
}
/** A felt pennant (wall-local): a tapering row of slabs. */
export function pennant(k: Kit, color = "#8c2f2f", trim = "#e8d2a0") {
  k.slab([-0.52, 0, 0.03], [0.1, 0.62, 0.04], trim);
  for (let i = 0; i < 5; i++) k.slab([-0.36 + i * 0.22, 0, 0.03], [0.22, 0.54 - i * 0.1, 0.03], color);
}
/** A cork board with pinned notes (wall-local). */
export function corkBoard(k: Kit, w = 1.8, h = 1.2, seed = 1) {
  k.slab([0, 0, 0.03], [w, h, 0.06], DARK_WOOD);
  k.slab([0, 0, 0.065], [w - 0.14, h - 0.14, 0.02], "#c79a62");
  const notes = ["#f1e8d0", "#e8c66a", "#a9c9b8", "#e6a48c", "#f1e8d0", "#bcd0e0"];
  for (let i = 0; i < 6; i++) {
    const x = (-0.5 + ((i % 3) + 0.5) / 3) * (w - 0.4) + (hash01(seed, i) - 0.5) * 0.12;
    const y = (i < 3 ? 0.24 : -0.24) * (h / 1.2) + (hash01(seed + 5, i) - 0.5) * 0.1;
    k.slab([x, y, 0.085], [0.36, 0.3, 0.012], notes[(i + seed) % notes.length], [0, 0, (hash01(seed + 9, i) - 0.5) * 0.3]);
  }
}
/** A long oar mounted flat on the wall (wall-local, blade to +x). */
export function mountedOar(k: Kit, length = 4.2, blade = "#8c2f2f") {
  k.cyl([0, 0, 0.1], [0.045, length, 0.045], PALE_WOOD, [0, 0, Math.PI / 2]);
  k.slab([length / 2 + 0.3, 0, 0.1], [0.75, 0.3, 0.05], blade);
  k.slab([length / 2 + 0.3, 0, 0.13], [0.5, 0.06, 0.02], CREAM);
  k.cyl([-length / 2 + 0.25, 0, 0.1], [0.06, 0.5, 0.06], INK, [0, 0, Math.PI / 2]);
  for (const x of [-length / 4, length / 4]) k.slab([x, -0.08, 0.05], [0.1, 0.2, 0.12], BRASS);
}
/** A plain jersey in a shadow box: a number block and stripes, no marks. */
export function jerseyFrame(k: Kit, color: string, trim: string, wood = DARK_WOOD) {
  k.slab([0, 0, 0.03], [1.5, 1.7, 0.08], wood);
  k.slab([0, 0, 0.075], [1.32, 1.52, 0.02], "#efe7d2");
  k.slab([0, -0.05, 0.1], [0.74, 1.02, 0.03], color);
  for (const side of [-1, 1]) k.slab([side * 0.5, 0.3, 0.1], [0.3, 0.34, 0.03], color, [0, 0, side * -0.35]);
  k.slab([0, 0.42, 0.115], [0.3, 0.1, 0.02], trim);
  k.slab([-0.1, -0.02, 0.12], [0.1, 0.38, 0.02], trim);
  k.slab([0.12, -0.02, 0.12], [0.16, 0.38, 0.02], trim);
  for (const side of [-1, 1]) k.slab([side * 0.5, 0.2, 0.115], [0.26, 0.05, 0.02], trim, [0, 0, side * -0.35]);
}

/* ------------------------------------------------------------ small props */

export function mug(k: Kit, color = CREAM) {
  k.cyl([0, 0.07, 0], [0.07, 0.14, 0.07], color);
  k.slab([0.09, 0.07, 0], [0.05, 0.08, 0.03], color);
}
export function papers(k: Kit, seed = 1) {
  for (let i = 0; i < 3; i++) k.slab([i * 0.03, 0.01 + i * 0.012, i * 0.02], [0.34, 0.012, 0.44], i === 2 ? PAPER : "#e2d7bb", [0, (hash01(seed, i) - 0.5) * 0.6, 0]);
}
export function laptop(k: Kit, screen = "#91aaa1") {
  k.slab([0, 0.02, 0], [0.52, 0.03, 0.36], "#9aa3a3");
  k.slab([0, 0.19, -0.2], [0.52, 0.34, 0.03], "#7f8a8a", [-0.25, 0, 0]);
  k.slab([0, 0.19, -0.18], [0.46, 0.28, 0.012], screen, [-0.25, 0, 0]);
}
export function monitor(k: Kit, screen = "#91aaa1") {
  k.slab([0, 0.03, 0], [0.36, 0.04, 0.24], STEEL);
  k.slab([0, 0.2, 0], [0.07, 0.34, 0.07], STEEL);
  k.box([0, 0.56, 0], [1, 0.62, 0.07], "#263c43");
  k.slab([0, 0.56, 0.04], [0.9, 0.52, 0.012], screen);
}
/** A trophy cup; nothing engraved. */
export function trophy(k: Kit, color = "#d7aa45", h = 0.5) {
  k.box([0, 0.05, 0], [0.22, 0.1, 0.22], DARK_WOOD);
  k.cyl([0, 0.1 + h * 0.2, 0], [0.03, h * 0.4, 0.03], color);
  k.cone([0, 0.1 + h * 0.66, 0], [0.16, h * 0.56, 0.16], color, [Math.PI, 0, 0]);
}
/** A speaker cabinet. */
export function speaker(k: Kit, h = 1.2, color = "#3a3f3f") {
  k.box([0, h / 2, 0], [0.62, h, 0.52], color);
  k.cyl([0, h * 0.68, 0.27], [0.2, 0.03, 0.2], "#1f2424", [Math.PI / 2, 0, 0]);
  k.cyl([0, h * 0.3, 0.27], [0.13, 0.03, 0.13], "#1f2424", [Math.PI / 2, 0, 0]);
}
/** An acoustic guitar on a stand, leaning back. */
export function guitar(k: Kit, body = "#c98a4b") {
  k.slab([0, 0.05, 0], [0.5, 0.06, 0.4], STEEL);
  k.slab([0, 0.45, -0.12], [0.04, 0.9, 0.04], STEEL, [-0.2, 0, 0]);
  k.cyl([0, 0.42, 0.02], [0.3, 0.12, 0.3], body, [Math.PI / 2 - 0.2, 0, 0]);
  k.cyl([0, 0.78, -0.06], [0.22, 0.12, 0.22], body, [Math.PI / 2 - 0.2, 0, 0]);
  k.cyl([0, 0.56, 0.06], [0.08, 0.02, 0.08], INK, [Math.PI / 2 - 0.2, 0, 0]);
  k.slab([0, 1.3, -0.17], [0.07, 0.9, 0.04], DARK_WOOD, [-0.2, 0, 0]);
  k.slab([0, 1.8, -0.27], [0.11, 0.2, 0.05], shade(body, 0.6), [-0.2, 0, 0]);
}
/** A coat rack with a coat and a hat. */
export function coatRack(k: Kit, coat = "#435668") {
  k.cyl([0, 0.04, 0], [0.3, 0.07, 0.3], DARK_WOOD);
  k.cyl([0, 0.95, 0], [0.04, 1.85, 0.04], DARK_WOOD);
  for (let i = 0; i < 4; i++) k.slab([Math.sin((i * Math.PI) / 2) * 0.14, 1.76, Math.cos((i * Math.PI) / 2) * 0.14], [0.05, 0.05, 0.3], DARK_WOOD, [0.5, (i * Math.PI) / 2, 0]);
  k.box([0.16, 1.2, 0.1], [0.3, 0.9, 0.34], coat, [0, 0.4, 0.08]);
  k.cyl([-0.12, 1.86, -0.1], [0.2, 0.1, 0.2], "#b9823a");
}
/** A waste basket. */
export function basket(k: Kit, color = "#a98250") {
  k.cyl([0, 0.2, 0], [0.22, 0.4, 0.22], color);
  k.cyl([0, 0.41, 0], [0.24, 0.04, 0.24], shade(color, 0.75));
}
/** A fruit bowl. */
export function fruitBowl(k: Kit) {
  k.cyl([0, 0.05, 0], [0.24, 0.1, 0.24], CREAM);
  k.ball([-0.08, 0.14, 0.02], [0.09, 0.09, 0.09], "#cd5438");
  k.ball([0.08, 0.14, -0.03], [0.09, 0.09, 0.09], "#e69a37");
  k.clutter(() => k.ball([0, 0.2, 0.06], [0.08, 0.08, 0.08], "#9bb04a"));
}
/** A vase with stems. */
export function vase(k: Kit, color = "#7d9d8a", bloom = "#e6a48c") {
  k.cyl([0, 0.16, 0], [0.1, 0.32, 0.1], color);
  k.ball([0, 0.5, 0], [0.16, 0.14, 0.16], bloom);
  k.clutter(() => k.ball([0.1, 0.42, 0.04], [0.1, 0.09, 0.1], shade(bloom, 1.15)));
}
/** A candle cluster that is simply lit. */
export function candles(k: Kit) {
  for (const [x, h] of [[-0.1, 0.22], [0.04, 0.3], [0.16, 0.16]] as const) {
    k.cyl([x, h / 2, 0], [0.045, h, 0.045], CREAM);
    k.glow([x, h + 0.05, 0], [0.03, 0.05, 0.03]);
  }
}

/* --------------------------------------------------------- interactives */

/** A desk or floor globe: spins and settles. */
export function globe(k: Kit, id = "globe", floor = true) {
  const h = floor ? 0.9 : 0.12;
  if (floor) {
    k.cyl([0, 0.04, 0], [0.3, 0.07, 0.3], DARK_WOOD);
    k.cyl([0, 0.45, 0], [0.05, 0.8, 0.05], DARK_WOOD);
  } else k.cyl([0, 0.04, 0], [0.16, 0.07, 0.16], DARK_WOOD);
  k.slab([0.02, h + 0.36, 0], [0.04, 0.84, 0.04], BRASS, [0, 0, 0.4]);
  k.prop(
    { id, label: "Globe", verb: "Spin", motion: { kind: "whirl", turns: 3 }, pivot: [0, h + 0.36, 0], sound: "whoosh", anchor: h + 0.95, pop: "" },
    () => {
      k.ball([0, h + 0.36, 0], [0.34, 0.34, 0.34], "#4f86a0");
      k.box([0.2, h + 0.44, 0.2], [0.22, 0.26, 0.2], "#7fa35a", [0, 0.6, 0]);
      k.box([-0.22, h + 0.3, -0.14], [0.2, 0.22, 0.22], "#8fae62", [0, -0.5, 0]);
      k.box([-0.02, h + 0.56, -0.24], [0.2, 0.14, 0.14], "#7fa35a");
    },
  );
}
/** A turntable; stands on a surface at the local origin. */
export function recordPlayer(k: Kit, id: string, tune: string, label = "Record player") {
  k.box([0, 0.07, 0], [0.74, 0.14, 0.56], "#35473d");
  k.slab([0.26, 0.17, 0.12], [0.3, 0.03, 0.04], "#c7af73", [0, 0.5, 0]);
  k.cyl([0.3, 0.17, -0.16], [0.04, 0.06, 0.04], BRASS);
  k.prop(
    { id, label, verb: "Play record", verbOn: "Lift the needle", motion: { kind: "spin", speed: 3.4 }, pivot: [-0.1, 0, 0], action: { type: "tune", tune }, sound: "tap", pop: "♪", anchor: 0.7 },
    () => {
      k.cyl([-0.1, 0.165, 0], [0.24, 0.025, 0.24], "#1c2222");
      k.cyl([-0.1, 0.18, 0], [0.085, 0.012, 0.085], "#c9603f");
      // Off-centre fleck so the spin reads.
      k.slab([-0.1, 0.182, 0.15], [0.03, 0.006, 0.12], "#3d4747");
    },
  );
}
/** A cat that stretches into a hop when petted. Faces +z. */
export function cat(k: Kit, id = "cat", fur = "#d8a868", patch = "#f3e8d0") {
  k.prop(
    { id, label: "Cat", verb: "Pet", motion: { kind: "hop", height: 0.22, bounces: 2 }, sound: "swish", pop: "♥", anchor: 0.8, reach: 2 },
    () => {
      k.ball([0, 0.2, -0.04], [0.2, 0.18, 0.3], fur);
      k.ball([0, 0.36, 0.24], [0.15, 0.14, 0.14], fur);
      k.cone([-0.08, 0.5, 0.24], [0.045, 0.1, 0.03], fur);
      k.cone([0.08, 0.5, 0.24], [0.045, 0.1, 0.03], fur);
      k.ball([0, 0.32, 0.34], [0.07, 0.05, 0.05], patch);
      k.cyl([0.16, 0.14, -0.3], [0.035, 0.34, 0.035], fur, [0.5, 0, -0.9]);
    },
  );
}
/** A ball that bounces in place. `kind` picks the look. */
export function bouncyBall(k: Kit, id: string, kind: "basketball" | "football" | "soccer" | "shuttle" = "basketball", label?: string) {
  const look = {
    basketball: { s: [0.24, 0.24, 0.24] as V3, c: "#c9682f", name: "Basketball" },
    football: { s: [0.17, 0.17, 0.27] as V3, c: "#7a4a2c", name: "Football" },
    soccer: { s: [0.22, 0.22, 0.22] as V3, c: "#f1e8d0", name: "Ball" },
    shuttle: { s: [0.06, 0.06, 0.06] as V3, c: "#f1e8d0", name: "Shuttlecock" },
  }[kind];
  k.prop(
    { id, label: label ?? look.name, verb: kind === "shuttle" ? "Flick" : "Bounce", motion: { kind: "hop", height: kind === "shuttle" ? 1.2 : 0.9, bounces: 3 }, sound: kind === "shuttle" ? "shuttle" : kind === "football" ? "kick" : "bounce", anchor: 0.9 },
    () => {
      k.ball([0, look.s[1], 0], look.s, look.c);
      if (kind === "basketball") k.cyl([0, look.s[1], 0], [0.245, 0.02, 0.245], INK);
      if (kind === "football") k.slab([0, look.s[1] * 2 - 0.01, 0], [0.03, 0.02, 0.2], PAPER);
      if (kind === "shuttle") k.cone([0, 0.2, 0], [0.11, 0.2, 0.11], PAPER, [Math.PI, 0, 0]);
    },
  );
}
/** A chest of drawers; the top drawer slides open on a note. */
export function drawerChest(k: Kit, init: { id: string; label?: string; title: string; text: string }, w = 1.3, color = DARK_WOOD) {
  k.box([0, 0.5, 0], [w, 1, 0.6], color);
  k.slab([0, 1.03, 0], [w + 0.1, 0.06, 0.68], shade(color, 1.25));
  for (const y of [0.2, 0.5]) {
    k.slab([0, y, 0.31], [w - 0.14, 0.24, 0.03], shade(color, 1.15));
    k.slab([0, y, 0.335], [0.22, 0.04, 0.03], BRASS);
  }
  k.prop(
    {
      id: init.id,
      label: init.label ?? "Drawer",
      verb: "Open",
      verbOn: "Close",
      motion: { kind: "slide", travel: 0.36 },
      action: { type: "read", title: init.title, text: init.text },
      sound: "door",
      anchor: 1.3,
    },
    () => {
      k.box([0, 0.8, 0.12], [w - 0.14, 0.24, 0.5], shade(color, 1.15));
      k.slab([0, 0.8, 0.385], [0.22, 0.04, 0.03], BRASS);
      k.slab([0, 0.9, 0.1], [w - 0.4, 0.03, 0.34], PAPER);
    },
  );
}
/** A closed notebook on a surface; the cover lifts to read. */
export function notebook(k: Kit, init: { id: string; label: string; title: string; text: string; verb?: string }, cover = "#2c6353") {
  k.slab([0, 0.025, 0], [0.4, 0.04, 0.54], PAPER);
  k.prop(
    {
      id: init.id,
      label: init.label,
      verb: init.verb ?? "Open",
      verbOn: "Close",
      motion: { kind: "swing", axis: "z", angle: 2.75 },
      pivot: [-0.21, 0.045, 0],
      action: { type: "read", title: init.title, text: init.text },
      sound: "paper",
      anchor: 0.6,
    },
    () => {
      k.slab([0, 0.055, 0], [0.42, 0.025, 0.56], cover);
      k.slab([0.1, 0.07, 0], [0.04, 0.01, 0.56], BRASS);
    },
  );
}
/** A brass bell on a bracket or a counter. */
export function bell(k: Kit, id = "bell", label = "Bell") {
  k.cyl([0, 0.02, 0], [0.14, 0.04, 0.14], DARK_WOOD);
  k.prop({ id, label, verb: "Ring", motion: { kind: "wobble", axis: "z", angle: 0.32 }, pivot: [0, 0.3, 0], sound: "chime", pop: "♪", anchor: 0.7 }, () => {
    k.cone([0, 0.04, 0], [0.13, 0.2, 0.13], "#d7aa45");
    k.ball([0, 0.26, 0], [0.035, 0.035, 0.035], "#d7aa45");
  });
}
/** A skateboard leaning on its tail; pops a flip. */
export function skateboard(k: Kit, id = "skateboard", deck = "#35615a") {
  k.prop({ id, label: "Skateboard", verb: "Flip", motion: { kind: "flip", height: 0.7 }, pivot: [0, 0.12, 0], sound: "kick", anchor: 0.7 }, () => {
    k.box([0, 0.13, 0], [0.24, 0.035, 0.86], deck);
    k.slab([0, 0.152, 0], [0.22, 0.01, 0.6], INK);
    for (const z of [-0.28, 0.28]) {
      k.slab([0, 0.085, z], [0.22, 0.04, 0.05], "#9aa3a3");
      for (const x of [-0.12, 0.12]) k.cyl([x, 0.05, z], [0.05, 0.045, 0.05], PAPER, [0, 0, Math.PI / 2]);
    }
  });
}
/** A small keyboard synth on a stand; a key dips and it sings. */
export function synth(k: Kit, id = "synth") {
  for (const side of [-1, 1]) {
    k.slab([side * 0.5, 0.42, 0], [0.05, 0.9, 0.05], STEEL, [0.35, 0, 0]);
    k.slab([side * 0.5, 0.42, 0], [0.05, 0.9, 0.05], STEEL, [-0.35, 0, 0]);
  }
  k.box([0, 0.9, 0], [1.4, 0.12, 0.44], "#2b3134");
  k.slab([0.44, 0.97, -0.12], [0.36, 0.02, 0.1], "#c9603f");
  k.clutter(() => {
    for (let i = 0; i < 4; i++) k.cyl([-0.5 + i * 0.14, 0.98, -0.12], [0.03, 0.04, 0.03], BRASS);
  });
  k.prop({ id, label: "Synth", verb: "Play a note", motion: { kind: "press", depth: 0.03 }, sound: "chime", pop: "♪", anchor: 1.4 }, () => {
    k.slab([0, 0.975, 0.08], [1.26, 0.03, 0.22], PAPER);
    for (let i = 0; i < 6; i++) k.slab([-0.5 + i * 0.2 + (i > 2 ? 0.06 : 0), 0.995, 0.03], [0.08, 0.03, 0.12], INK);
  });
}
/** A whiteboard on the wall (wall-local); each use writes the next line. */
export function whiteboard(k: Kit, id: string, label: string, w: number, h: number, lines: string[], verb = "Work a step") {
  k.slab([0, 0, 0.03], [w + 0.14, h + 0.14, 0.06], "#9aa3a3");
  k.slab([0, -h / 2 - 0.1, 0.12], [w * 0.6, 0.04, 0.12], "#9aa3a3");
  k.clutter(() => {
    k.slab([-0.3, -h / 2 - 0.06, 0.13], [0.2, 0.04, 0.04], "#2f5d6b");
    k.slab([0.1, -h / 2 - 0.06, 0.13], [0.2, 0.04, 0.04], "#a54f38");
  });
  k.board([0, 0, 0.065], [w, h], lines);
  k.prop({ id, label, verb, action: { type: "board" }, sound: "paper", pop: "✎", anchor: 0, reach: 2.8 });
}
/** A seat prop: E walks the player onto it. Use inside a sofa placement. */
export function seatSpot(k: Kit, id: string, label: string, seat: V3, init: Partial<PropInit> = {}) {
  const world = k.point(seat);
  k.at(seat[0], seat[2], 0, () =>
    k.prop({
      id,
      label,
      verb: "Sit",
      verbOn: "Stand up",
      action: { type: "sit", seat: world, face: k.turn },
      sound: "swish",
      anchor: seat[1] + 1.1,
      reach: 2,
      ...init,
    }),
  );
}

/* ---------------------------------------------------------------- colour */

/** Multiplies a #rrggbb colour's brightness (clamped). */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${((c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, "0")}`;
}

/* ------------------------------------------------------ more interactives */

/** A rowing machine, flywheel to −z; the seat and handle slide on a pull. */
export function erg(k: Kit, id: string) {
  k.slab([0, 0.16, 0.2], [0.12, 0.08, 2.3], "#9aa3a3");
  for (const z of [-0.85, 1.25]) k.slab([0, 0.07, z], [0.6, 0.12, 0.1], STEEL);
  k.cyl([0, 0.52, -0.95], [0.34, 0.14, 0.34], "#2b3134", [0, 0, Math.PI / 2]);
  k.slab([0, 0.36, -0.7], [0.1, 0.5, 0.1], STEEL);
  k.slab([0, 0.86, -0.72], [0.22, 0.16, 0.05], "#263c43", [-0.4, 0, 0]);
  k.slab([0, 0.24, -0.3], [0.5, 0.05, 0.3], STEEL, [0.5, 0, 0]);
  k.prop({ id, label: "Rowing machine", verb: "Pull a stroke", motion: { kind: "wobble", axis: "x", angle: 0.16 }, pivot: [0, 0.2, 0.2], sound: "oar", anchor: 1.2 }, () => {
    k.box([0, 0.3, 0.75], [0.34, 0.08, 0.3], "#2b3134");
    k.cyl([0, 0.6, 0.1], [0.03, 0.5, 0.03], PALE_WOOD, [0, 0, Math.PI / 2]);
  });
}
/** A water cooler; the bottle glugs. */
export function waterCooler(k: Kit, id = "water") {
  k.box([0, 0.5, 0], [0.42, 1, 0.42], CREAM);
  k.slab([0, 0.72, 0.22], [0.2, 0.1, 0.04], STEEL);
  k.prop({ id, label: "Water cooler", verb: "Fill a cup", motion: { kind: "pulse", amount: 0.1 }, pivot: [0, 1, 0], sound: "swish", pop: "💧", anchor: 1.7 }, () => {
    k.cyl([0, 1.28, 0], [0.18, 0.5, 0.18], "#9cc7d8");
    k.cyl([0, 1.04, 0], [0.1, 0.08, 0.1], "#7fb0c4");
  });
}
/** A pedestal fan: the blades run until switched off. Faces +z. */
export function fan(k: Kit, id = "fan") {
  k.cyl([0, 0.04, 0], [0.3, 0.07, 0.3], STEEL);
  k.cyl([0, 0.7, 0], [0.04, 1.3, 0.04], STEEL);
  k.cyl([0, 1.4, -0.06], [0.1, 0.2, 0.1], STEEL, [Math.PI / 2, 0, 0]);
  k.at(0, 0.08, 0, () =>
    k.prop({ id, label: "Fan", verb: "Switch on", verbOn: "Switch off", motion: { kind: "spin", speed: 14, axis: "z" }, sound: "ui-toggle", anchor: 0.5 }, () => {
      for (let i = 0; i < 3; i++) k.slab([0, 0, 0], [0.12, 0.62, 0.02], "#c9d2d2", [0, 0, (i * Math.PI) / 3]);
      k.cyl([0, 0, 0.02], [0.07, 0.05, 0.07], STEEL, [Math.PI / 2, 0, 0]);
    }), 1.4);
}
/** A popcorn machine on a cart. */
export function popcorn(k: Kit, id = "popcorn") {
  k.box([0, 0.45, 0], [0.9, 0.9, 0.7], "#a33a32");
  k.slab([0, 0.6, 0.36], [0.6, 0.3, 0.02], "#e8d2a0");
  for (const x of [-0.42, 0.42]) for (const z of [-0.32, 0.32]) k.slab([x, 1.32, z], [0.05, 0.84, 0.05], "#d7aa45");
  k.slab([0, 1.76, 0], [0.96, 0.08, 0.76], "#a33a32");
  k.cyl([0, 1.5, 0], [0.14, 0.12, 0.14], STEEL);
  k.prop({ id, label: "Popcorn machine", verb: "Pop a batch", motion: { kind: "hop", height: 0.3, bounces: 4 }, sound: "tap", pop: "🍿", anchor: 1.9 }, () => {
    k.ball([0, 1.04, 0], [0.34, 0.14, 0.26], "#f3e3a8");
    k.ball([-0.12, 1.16, 0.06], [0.1, 0.08, 0.1], "#f7edc4");
    k.ball([0.14, 1.14, -0.04], [0.09, 0.08, 0.09], "#f7edc4");
  });
}
/** A film projector on a stand: its lamp throws a pool down the aisle. */
export function projector(k: Kit, id = "projector") {
  k.cyl([0, 0.04, 0], [0.36, 0.07, 0.36], STEEL);
  k.cyl([0, 0.6, 0], [0.05, 1.1, 0.05], STEEL);
  k.box([0, 1.3, 0], [0.5, 0.36, 0.8], "#2b3134");
  k.cyl([0, 1.3, -0.46], [0.11, 0.16, 0.11], "#9aa3a3", [Math.PI / 2, 0, 0]);
  for (const z of [-0.18, 0.24]) k.cyl([0, 1.7, z], [0.2, 0.05, 0.2], "#3d4747", [0, 0, Math.PI / 2]);
  k.glow([0, 1.3, -0.58], [0.08, 0.08, 0.05], id);
  k.pool(0, -3.2, 1.3, 2.8, id);
  k.prop({ id, label: "Projector", verb: "Switch on", verbOn: "Switch off", action: { type: "lamp" }, sound: "ui-toggle", anchor: 2.1, on: false });
}
/** A film reel on a spindle. */
export function filmReel(k: Kit, id = "reel") {
  k.cyl([0, 0.03, 0], [0.12, 0.06, 0.12], STEEL);
  k.prop({ id, label: "Film reel", verb: "Spin", motion: { kind: "whirl", turns: 2 }, pivot: [0, 0.1, 0], sound: "whoosh", anchor: 0.5 }, () => {
    k.cyl([0, 0.1, 0], [0.3, 0.07, 0.3], "#3d4747");
    k.cyl([0, 0.14, 0], [0.09, 0.02, 0.09], "#d7aa45");
    k.slab([0.18, 0.142, 0], [0.1, 0.012, 0.1], "#9aa3a3");
    k.slab([-0.16, 0.142, 0.1], [0.1, 0.012, 0.1], "#9aa3a3");
  });
}
/** A kettle that puffs when poured; stands on a surface. */
export function kettle(k: Kit, id = "kettle", label = "Kettle", verb = "Pour a cup") {
  k.prop({ id, label, verb, motion: { kind: "wobble", axis: "z", angle: 0.3 }, pivot: [0, 0, 0], sound: "swish", pop: "♨", anchor: 0.6 }, () => {
    k.ball([0, 0.13, 0], [0.16, 0.13, 0.16], "#4d5f5c");
    k.cyl([0, 0.27, 0], [0.06, 0.05, 0.06], INK);
    k.cone([0.2, 0.16, 0], [0.04, 0.16, 0.04], "#4d5f5c", [0, 0, -0.9]);
  });
}
/** A fridge whose door swings. Faces +z. */
export function fridge(k: Kit, id = "fridge") {
  k.box([0, 1, 0], [0.95, 2, 0.8], "#cfd6d2");
  k.slab([0, 1, 0.38], [0.8, 1.8, 0.04], "#eef1e8");
  k.clutter(() => {
    k.slab([0, 1.3, 0.3], [0.7, 0.03, 0.2], "#9aa3a3");
    k.ball([-0.15, 1.42, 0.3], [0.1, 0.1, 0.1], "#cd5438");
    k.cyl([0.18, 1.46, 0.3], [0.07, 0.26, 0.07], "#7d9d8a");
  });
  k.prop({ id, label: "Fridge", verb: "Open", verbOn: "Close", motion: { kind: "swing", axis: "y", angle: -1.9 }, pivot: [-0.46, 0, 0.42], sound: "door", anchor: 2.2 }, () => {
    k.box([0, 1, 0.44], [0.93, 1.96, 0.08], "#dfe5df");
    k.slab([0.36, 1.1, 0.5], [0.05, 0.5, 0.04], STEEL);
  });
}
/** A shape to turn over in your hands: `kind` 0 a faceted solid, 1 a cube. */
export function puzzleSolid(k: Kit, id: string, kind = 0, label = "Polyhedron") {
  k.cyl([0, 0.03, 0], [0.14, 0.05, 0.14], DARK_WOOD);
  k.prop({ id, label, verb: kind ? "Twist" : "Turn it over", motion: { kind: "whirl", turns: 2 }, pivot: [0, 0.3, 0], sound: "card", anchor: 0.7 }, () => {
    if (kind) {
      k.box([0, 0.26, 0], [0.3, 0.3, 0.3], "#c9603f", [0.3, 0.4, 0.2]);
      k.slab([0, 0.26, 0], [0.31, 0.1, 0.31], "#e8c66a", [0.3, 0.4, 0.2]);
    } else {
      k.cone([0, 0.42, 0], [0.22, 0.26, 0.22], "#4f86a0");
      k.cone([0, 0.18, 0], [0.22, 0.24, 0.22], "#7fb0c4", [Math.PI, 0, 0]);
    }
  });
}
/** A stack of coins with one on top to flip. */
export function coinFlip(k: Kit, id = "coin") {
  for (let i = 0; i < 4; i++) k.cyl([hash01(i, 3) * 0.04, 0.03 + i * 0.05, 0], [0.13, 0.045, 0.13], i % 2 ? "#f4d06d" : "#c89932");
  k.prop({ id, label: "Gold coin", verb: "Flip", motion: { kind: "flip", height: 0.9 }, pivot: [0, 0.24, 0], sound: "rim", anchor: 0.7 }, () => k.cyl([0, 0.24, 0], [0.13, 0.04, 0.13], "#f4d06d"));
}
/** A wall sconce you can switch (wall-local). */
export function sconce(k: Kit, id: string, on = true) {
  k.slab([0, 0, 0.04], [0.26, 0.5, 0.08], DARK_WOOD);
  k.slab([0, -0.08, 0.2], [0.06, 0.06, 0.3], BRASS);
  k.ball([0, 0.1, 0.34], [0.17, 0.2, 0.17], "#e8d2a0");
  k.glow([0, 0.1, 0.34], [0.18, 0.21, 0.18], id);
  k.pool(0, 1.4, 1.6, 1.6, id);
  k.prop({ id, label: "Wall lamp", verb: "Switch on", verbOn: "Switch off", action: { type: "lamp" }, sound: "ui-toggle", anchor: 0.3, reach: 2.6, on });
}
/** A television on a low console, facing +z. */
export function tvConsole(k: Kit, screen = "#3b5560") {
  sideboard(k, 2.6, 0.6, DARK_WOOD, "#4a5a52");
  k.slab([0, 0.72, 0], [0.5, 0.06, 0.3], STEEL);
  k.box([0, 1.36, 0], [2.1, 1.2, 0.09], "#1f2424");
  k.slab([0, 1.36, 0.05], [1.96, 1.06, 0.012], screen);
}
/** Place settings down a table: plates and cups either side. */
export function placeSettings(k: Kit, w: number, d: number, n: number) {
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    for (const side of [-1, 1]) {
      k.cyl([x, 0.02, side * (d / 2 - 0.26)], [0.17, 0.03, 0.17], PAPER);
      k.clutter(() => k.cyl([x + 0.26, 0.06, side * (d / 2 - 0.3)], [0.05, 0.12, 0.05], "#a9c9b8"));
    }
  }
}
/** A racket, flat on a surface or propped (give it a turn). */
export function racket(k: Kit, color = "#35615a") {
  k.cyl([0, 0.02, -0.34], [0.2, 0.025, 0.26], color);
  k.cyl([0, 0.03, -0.34], [0.16, 0.012, 0.22], PAPER);
  k.slab([0, 0.02, 0.14], [0.03, 0.03, 0.5], STEEL);
  k.slab([0, 0.02, 0.44], [0.05, 0.045, 0.2], INK);
}
/** A sports bag. */
export function duffel(k: Kit, color = "#8c2f2f") {
  k.box([0, 0.2, 0], [0.9, 0.4, 0.42], color);
  k.slab([0, 0.42, 0], [0.5, 0.03, 0.06], INK);
}

/** Stable pseudo-random for small scatters (stones, notes). */
export const hashStone = (a: number, b: number) => hash01(a * 7.3 + 1.7, b);

/* -------------------------------------------------------------- vignettes */

/** A low two-shelf bookcase to divide a big floor; things stand on top. */
export function lowShelf(k: Kit, w = 2.8, seed = 1, color = DARK_WOOD) {
  k.box([0, 0.55, 0], [w, 1.1, 0.5], color);
  k.slab([0, 1.13, 0], [w + 0.1, 0.06, 0.58], shade(color, 1.25));
  for (const side of [-1, 1])
    for (const y of [0.12, 0.6]) {
      k.slab([0, y + 0.22, side * 0.2], [w - 0.2, 0.44, 0.12], shade(color, 0.7));
      bookRow(k, -w / 2 + 0.14, w / 2 - 0.14, y, side * 0.22, seed * 7 + (side + 1) + y * 10, 0.1);
    }
  k.at(-w * 0.3, 0, 0, () => plantLeaves(k, 0), 0.66, 0.6);
  k.at(-w * 0.3, 0, 0, () => k.cyl([0, 0.1, 0], [0.16, 0.2, 0.16], TERRACOTTA), 1.16);
  k.at(w * 0.22, 0, 0.3, () => bookStack(k, 2, seed), 1.16);
  k.clutter(() => k.at(w * 0.4, 0, 0, () => vase(k, CREAM, "#e6a48c"), 1.16));
}
/** A chair, a small table, a stack to read and a rug to put them on. */
export function readingNook(k: Kit, color = "#52776a", rugColor = "#70413a", seed = 1) {
  roundRug(k, 2, rugColor, "#e2cf9f");
  k.at(-0.4, -0.3, 0.4, () => armchair(k, color, "#d9b765"));
  k.at(1.1, -0.4, 0, () => {
    sideTable(k, WOOD, 0.36, 0.62);
    k.at(0, 0, 0.4, () => bookStack(k, 2, seed), 0.66);
  });
  k.at(0.9, 0.9, 0.3, () => pouf(k, "#c98a4b", 0.4));
}
/** Three pots on a round mat. */
export function plantCluster(k: Kit, mat = "#8f9a6c") {
  roundRug(k, 1.5, mat, "#e2cf9f");
  k.at(0, -0.3, 0, () => plant(k, 2, 1.1));
  k.at(0.8, 0.4, 0, () => plant(k, 0, 0.9));
  k.at(-0.8, 0.5, 0, () => plant(k, 1, 0.9));
}
/** A small round table with two stools and something on it. */
export function cafeTable(k: Kit, color = WOOD, seat = "#a7543d") {
  roundRug(k, 1.7, "#6b5a45", "#e2cf9f");
  sideTable(k, color, 0.62, 0.9);
  k.at(-1, 0.2, 0, () => stool(k, seat));
  k.at(0.9, -0.5, 0, () => stool(k, seat));
  k.at(0.1, 0, 0, () => mug(k), 0.94);
  k.clutter(() => k.at(-0.2, 0.2, 0.5, () => papers(k, 3), 0.94));
}
/** Crates, a box stack and a basket: the corner where things end up. */
export function storageCorner(k: Kit, seed = 1) {
  k.at(0, 0, 0.1, () => boxStack(k, seed));
  k.at(1, 0.2, -0.2, () => crate(k, 0.8));
  k.at(0.9, 0.2, -0.2, () => crate(k, 0.55, "#bb8848"), 0.8);
  k.at(-0.9, 0.5, 0, () => basket(k));
}
/** A plinth with something worth a second look on it. */
export function plinth(k: Kit, draw: () => void, color = "#d9d2bd") {
  k.box([0, 0.5, 0], [0.7, 1, 0.7], color);
  k.slab([0, 1.02, 0], [0.8, 0.05, 0.8], shade(color, 0.85));
  k.at(0, 0, 0, draw, 1.05);
}
