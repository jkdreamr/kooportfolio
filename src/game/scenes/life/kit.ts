/**
 * Room-life kit: a tiny scene description language for dressing rooms.
 *
 * A room is a function that draws into a `Kit`: static pieces (baked into
 * the room's one merged mesh), interactive props (a few moving pieces plus
 * what E does), glows (lamp shades, fairy lights), light pools on the floor
 * and wall text. The kit is plain data with no three.js, so rooms can be
 * measured and tested without a renderer; `RoomLife.tsx` draws it.
 *
 * Coordinates are the room's: +x right, +z toward the door, y up. `at()`
 * nests a placement (position, turn about y, uniform scale). Piece rotations
 * are YXZ Euler angles, so a placement's turn simply adds to `r[1]`.
 */

export type V3 = [number, number, number];
/** `slab` is a plain 12-triangle box (books, rugs, frames); `box` is the
 * chamfered one (furniture). */
export type Shape = "box" | "slab" | "cyl" | "ball" | "cone";
export type Piece = { shape: Shape; p: V3; s: V3; r: V3; c: string };

/** What a prop's moving pieces do when used. */
export type Motion =
  /** Stays put (lamps, switches: the response is light). */
  | { kind: "none" }
  /** Toggle: turns about y (or z) while on (records, fan blades). */
  | { kind: "spin"; speed: number; axis?: "y" | "z" }
  /** One shot: `turns` about y, easing out (globes). */
  | { kind: "whirl"; turns: number }
  /** One shot: a damped swing about z or x (frames, bells, oars). */
  | { kind: "wobble"; axis: "x" | "z"; angle: number }
  /** One shot: decaying bounces (balls, the cat). */
  | { kind: "hop"; height: number; bounces: number }
  /** One shot: a quick swell (plants, cushions). */
  | { kind: "pulse"; amount: number }
  /** Toggle: slides along local z (drawers). */
  | { kind: "slide"; travel: number }
  /** Toggle: swings about an axis at the pivot (doors, lids, book covers). */
  | { kind: "swing"; axis: "x" | "y" | "z"; angle: number }
  /** One shot: dips and returns (keys, switches, buttons). */
  | { kind: "press"; depth: number }
  /** One shot: a hop with one full turn about x (a board trick). */
  | { kind: "flip"; height: number };

export type PropSound = "tap" | "chime" | "bounce" | "paper" | "door" | "ui-toggle" | "card" | "stone" | "whoosh" | "swish" | "score" | "oar" | "kick" | "shuttle" | "rim";

export type PropAction =
  /** Just the motion and sound. */
  | { type: "play" }
  /** A lamp: toggles its glows and pools. */
  | { type: "lamp" }
  /** A wall switch: every lamp in the room follows it. */
  | { type: "switch" }
  /** A record player or radio: toggles the room tune. */
  | { type: "tune"; tune: string }
  /** Shows a short card (frames, notebooks, plaques). */
  | { type: "read"; title: string; text: string }
  /** Each use draws the next step on the room's board. */
  | { type: "board" }
  /** Walks the player onto a seat. */
  | { type: "sit"; seat: V3; face: number };

export type Prop = {
  id: string;
  label: string;
  /** Verb when off / idle. */
  verb: string;
  /** Verb while on (toggles). */
  verbOn?: string;
  /** Room position of the prop origin. */
  x: number;
  y: number;
  z: number;
  /** Turn about y, radians. */
  turn: number;
  scale: number;
  /** Prompt / sparkle anchor height above the prop's origin. */
  anchor: number;
  reach?: number;
  motion: Motion;
  /** Pivot of the motion, in prop-local coordinates. */
  pivot: V3;
  action: PropAction;
  sound: PropSound;
  /** A glyph for the pop ("♪"); empty for none. */
  pop: string;
  /** Moving pieces, prop-local. */
  parts: Piece[];
  /** Starts on (lamps that are lit when you walk in). */
  on: boolean;
};

export type Glow = { p: V3; s: V3; lamp?: string };
export type Pool = { x: number; z: number; rx: number; rz: number; lamp?: string };
export type Board = {
  /** Centre, in room coordinates, and the turn about y of its face. */
  p: V3;
  turn: number;
  size: [number, number];
  /** Lines revealed one use at a time; the first is always shown. */
  lines: string[];
  ink: string;
  ground: string;
};

export type PropInit = {
  id: string;
  label: string;
  verb: string;
  verbOn?: string;
  anchor?: number;
  reach?: number;
  motion?: Motion;
  pivot?: V3;
  action?: PropAction;
  sound?: PropSound;
  pop?: string;
  on?: boolean;
};

type Frame = { x: number; y: number; z: number; turn: number; scale: number };

const rotY = (x: number, z: number, a: number): [number, number] => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [x * c + z * s, -x * s + z * c];
};

export class Kit {
  statics: Piece[] = [];
  props: Prop[] = [];
  glows: Glow[] = [];
  pools: Pool[] = [];
  boards: Board[] = [];
  /** Low tier: `clutter()` blocks are skipped. */
  readonly thin: boolean;
  private frame: Frame = { x: 0, y: 0, z: 0, turn: 0, scale: 1 };
  private target: Piece[];
  private propFrame: Frame | null = null;

  constructor(options: { thin?: boolean } = {}) {
    this.thin = !!options.thin;
    this.target = this.statics;
  }

  /** Nest a placement: everything drawn in `draw` is relative to it. */
  at(x: number, z: number, turn: number, draw: () => void, y = 0, scale = 1) {
    const outer = this.frame;
    const [wx, wz] = rotY(x * outer.scale, z * outer.scale, outer.turn);
    this.frame = {
      x: outer.x + wx,
      y: outer.y + y * outer.scale,
      z: outer.z + wz,
      turn: outer.turn + turn,
      scale: outer.scale * scale,
    };
    try {
      draw();
    } finally {
      this.frame = outer;
    }
  }

  /** Small things a low-tier device can do without. */
  clutter(draw: () => void) {
    if (!this.thin) draw();
  }

  /** A local point in room coordinates. */
  point(p: V3): V3 {
    const f = this.frame;
    const [wx, wz] = rotY(p[0] * f.scale, p[2] * f.scale, f.turn);
    return [f.x + wx, f.y + p[1] * f.scale, f.z + wz];
  }
  /** The current placement's turn about y. */
  get turn() {
    return this.frame.turn;
  }

  private local(p: V3): { p: V3; turn: number; scale: number } {
    const f = this.frame,
      base = this.propFrame;
    if (!base) return { p: this.point(p), turn: f.turn, scale: f.scale };
    // Inside a prop: relative to the prop's own origin and turn.
    const world = this.point(p);
    const dx = world[0] - base.x,
      dz = world[2] - base.z;
    const [lx, lz] = rotY(dx, dz, -base.turn);
    return {
      p: [lx / base.scale, (world[1] - base.y) / base.scale, lz / base.scale],
      turn: f.turn - base.turn,
      scale: f.scale / base.scale,
    };
  }

  private push(shape: Shape, p: V3, s: V3, c: string, r?: V3) {
    const placed = this.local(p);
    this.target.push({
      shape,
      p: placed.p,
      s: [s[0] * placed.scale, s[1] * placed.scale, s[2] * placed.scale],
      r: [r?.[0] ?? 0, (r?.[1] ?? 0) + placed.turn, r?.[2] ?? 0],
      c,
    });
  }
  box(p: V3, s: V3, c: string, r?: V3) {
    this.push("box", p, s, c, r);
  }
  slab(p: V3, s: V3, c: string, r?: V3) {
    this.push("slab", p, s, c, r);
  }
  /** `s` is [radius x, height, radius z]. */
  cyl(p: V3, s: V3, c: string, r?: V3) {
    this.push("cyl", p, s, c, r);
  }
  /** `s` is the three radii. */
  ball(p: V3, s: V3, c: string, r?: V3) {
    this.push("ball", p, s, c, r);
  }
  /** `s` is [radius x, height, radius z]; the tip points up. */
  cone(p: V3, s: V3, c: string, r?: V3) {
    this.push("cone", p, s, c, r);
  }

  /**
   * An interactive prop at the current placement. Pieces drawn inside
   * `draw` are its moving parts; draw anything that stays still outside.
   */
  prop(init: PropInit, draw?: () => void): Prop {
    const f = this.frame;
    const prop: Prop = {
      id: init.id,
      label: init.label,
      verb: init.verb,
      verbOn: init.verbOn,
      x: f.x,
      y: f.y,
      z: f.z,
      turn: f.turn,
      scale: f.scale,
      anchor: init.anchor ?? 1.5,
      reach: init.reach,
      motion: init.motion ?? { kind: "none" },
      pivot: init.pivot ?? [0, 0, 0],
      action: init.action ?? { type: "play" },
      sound: init.sound ?? "tap",
      pop: init.pop ?? "",
      parts: [],
      on: !!init.on,
    };
    if (this.props.some((other) => other.id === prop.id)) throw new Error(`duplicate prop id: ${prop.id}`);
    this.props.push(prop);
    if (draw) {
      const outerTarget = this.target,
        outerProp = this.propFrame;
      this.target = prop.parts;
      this.propFrame = f;
      try {
        draw();
      } finally {
        this.target = outerTarget;
        this.propFrame = outerProp;
      }
    }
    return prop;
  }

  /** An emissive blob (lamp shade, bulb). With `lamp`, it follows that prop. */
  glow(p: V3, s: V3, lamp?: string) {
    const f = this.frame;
    this.glows.push({ p: this.point(p), s: [s[0] * f.scale, s[1] * f.scale, s[2] * f.scale], lamp });
  }
  /** A soft pool of warm light on the floor (never a real light). */
  pool(x: number, z: number, rx: number, rz = rx, lamp?: string) {
    const f = this.frame;
    const [wx, , wz] = this.point([x, 0, z]);
    this.pools.push({ x: wx, z: wz, rx: rx * f.scale, rz: rz * f.scale, lamp });
  }
  board(p: V3, size: [number, number], lines: string[], ink = "#2f4a43", ground = "#f3f1e4") {
    this.boards.push({ p: this.point(p), turn: this.frame.turn, size: [size[0] * this.frame.scale, size[1] * this.frame.scale], lines, ink, ground });
  }
}

/** Triangles per piece shape (the geometry RoomLife draws them with). */
export const SHAPE_TRIANGLES: Record<Shape, number> = { box: 44, slab: 12, cyl: 40, ball: 80, cone: 16 };

export function triangleCount(kit: Kit): number {
  let total = 0;
  for (const piece of kit.statics) total += SHAPE_TRIANGLES[piece.shape];
  for (const prop of kit.props) for (const piece of prop.parts) total += SHAPE_TRIANGLES[piece.shape];
  // Glows are 20-triangle icosahedra, pools two-triangle quads.
  return total + kit.glows.length * 20 + kit.pools.length * 2;
}

/** Deterministic 0..1 from two numbers (stable clutter, no Math.random). */
export function hash01(a: number, b = 0): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
