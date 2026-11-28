/**
 * Lunch Rush: the kitchen game's rules, pure and testable.
 *
 * One loop, taught by the first order: cook the patty on the grill (tap
 * when the needle reaches gold), stack the toppings the ticket shows, top
 * bun serves it. Nothing can be built wrong: a wrong topping just doesn't
 * land (and costs a little), customers never walk out (late plates only
 * lose their tip). Orders get longer, flips arrive, then two tickets at
 * once. A run is a 150-second rush after an optional untimed first order.
 */
export type Topping = "cheese" | "lettuce" | "tomato" | "onion" | "pickle" | "top";
/** Tray order; the bun is always last. */
export const TRAY: readonly Topping[] = ["cheese", "lettuce", "tomato", "onion", "pickle", "top"];
export const toppingName = (t: Topping) => (t === "top" ? "Top bun" : t[0].toUpperCase() + t.slice(1));

/** Seconds of the timed rush. */
export const RUSH_SECONDS = 150;
/** Seconds for one side to reach heat 1 (the middle of the gold zone). */
export const SIDE_SECONDS = 2.6;
/** Heat bands. Below EARLY a tap is ignored ("not yet"). */
export const EARLY = 0.45;
export const PERFECT: readonly [number, number] = [0.82, 1.22];
export const GOOD: readonly [number, number] = [0.62, 1.5];
/** Past this the patty is charcoal and comes off by itself. */
export const BURNT = 2.3;
/** Where the meter ends (heat units); the needle is drawn on 0..METER. */
export const METER = 1.9;

export type Doneness = "perfect" | "good" | "under" | "over" | "burnt";
export const sideScore: Record<Doneness, number> = { perfect: 100, good: 75, under: 40, over: 40, burnt: 10 };
export function doneness(heat: number): Doneness {
  if (heat >= BURNT) return "burnt";
  if (heat >= PERFECT[0] && heat <= PERFECT[1]) return "perfect";
  if (heat >= GOOD[0] && heat <= GOOD[1]) return "good";
  return heat < GOOD[0] ? "under" : "over";
}

export type Order = {
  id: number;
  name: string;
  /** Toppings in stacking order, ending with the top bun. */
  toppings: Topping[];
  /** Needs a flip (two timed taps) instead of one. */
  flip: boolean;
  /** Seconds before the tip is gone. */
  patience: number;
  waited: number;
  cook: "raw" | "grill" | "done";
  side: 1 | 2;
  heat: number;
  /** One entry per finished side. */
  sides: Doneness[];
  /** Toppings stacked so far. */
  stacked: number;
  mistakes: number;
};

export type Feedback =
  | { kind: "none" }
  | { kind: "arrive"; id: number; name: string }
  | { kind: "grill" | "flip" }
  | { kind: "side"; done: Doneness; plated: boolean }
  | { kind: "early" }
  | { kind: "add"; topping: Topping }
  | { kind: "wrong"; topping: Topping; want: Topping | null }
  | { kind: "serve"; points: number; perfect: boolean; combo: number; name: string; late: boolean; rush?: boolean }
  | { kind: "new"; topping: Topping }
  | { kind: "end" };

export type KitchenGame = {
  phase: "idle" | "tutorial" | "service" | "results";
  run: number;
  /** Seconds left in the rush (frozen during the tutorial order). */
  clock: number;
  /** Orders made so far this run (sets the ramp). */
  made: number;
  /** Seconds until the next customer may step up. */
  arrival: number;
  orders: Order[];
  score: number;
  served: number;
  perfects: number;
  combo: number;
  bestCombo: number;
  mistakes: number;
  /** Toppings shown in the tray (they unlock as the rush goes on). */
  unlocked: Topping[];
  /** Feedback for the last action; `seq` increases with each one. */
  last: Feedback;
  seq: number;
};

export type KitchenAction =
  | { type: "start"; tutorial?: boolean }
  | { type: "stop" }
  | { type: "tick"; dt: number }
  | { type: "grill" }
  | { type: "add"; topping: Topping };

const NAMES = ["Mina", "Theo", "Ada", "Jun", "Rosa", "Ollie", "Priya", "Kofi", "Lena", "Sol"];
const START_TRAY: Topping[] = ["cheese", "lettuce", "top"];

/** The ramp, by order number. Deterministic so the bots and tests agree. */
export function orderFor(n: number, id: number): Order {
  const pick = (xs: Topping[], k: number) => {
    const out: Topping[] = [];
    for (let i = 0; out.length < k; i++) {
      const t = xs[(n * 7 + i * 3 + (n >> 1)) % xs.length];
      if (!out.includes(t)) out.push(t);
    }
    return out;
  };
  const fixed: Topping[][] = [["cheese"], ["cheese", "lettuce"], ["lettuce", "tomato"], ["cheese", "tomato"]];
  const pool: Topping[] = n < 6 ? ["cheese", "lettuce", "tomato", "onion"] : ["cheese", "lettuce", "tomato", "onion", "pickle"];
  const toppings = n < fixed.length ? fixed[n] : pick(pool, n < 8 ? 2 : 3);
  return {
    id,
    name: NAMES[n % NAMES.length],
    toppings: [...toppings, "top"],
    flip: n >= 2,
    patience: n < 4 ? 32 : n < 8 ? 28 : 25,
    waited: 0,
    cook: "raw",
    side: 1,
    heat: 0,
    sides: [],
    stacked: 0,
    mistakes: 0,
  };
}
/** Tickets on the rail at once: one, then two from the fifth order. */
export const railSize = (made: number) => (made < 4 ? 1 : 2);

export function newKitchen(run = 0): KitchenGame {
  return {
    phase: "idle",
    run,
    clock: RUSH_SECONDS,
    made: 0,
    arrival: 0,
    orders: [],
    score: 0,
    served: 0,
    perfects: 0,
    combo: 0,
    bestCombo: 0,
    mistakes: 0,
    unlocked: [...START_TRAY],
    last: { kind: "none" },
    seq: 0,
  };
}

/** The order whose patty is (or will next be) on the grill. */
export const grillOrder = (g: KitchenGame) => g.orders.find((o) => o.cook !== "done");
/** The order being stacked on the board. */
export const plateOrder = (g: KitchenGame) => g.orders.find((o) => o.cook === "done");
export const wanted = (o: Order | undefined): Topping | null => (o ? (o.toppings[o.stacked] ?? null) : null);

/**
 * What the player should do next: the grill when a patty is in the gold
 * zone, raw and waiting, or there is nothing to stack; else the next topping.
 */
export function nextStep(g: KitchenGame): "grill" | Topping | null {
  if (g.phase !== "tutorial" && g.phase !== "service") return null;
  const grill = grillOrder(g),
    plate = plateOrder(g);
  const want = wanted(plate);
  if (grill?.cook === "grill" && grill.heat >= PERFECT[0]) return "grill";
  if (want) return want;
  if (grill) return "grill";
  return null;
}

/** Points for a served plate, before the combo bonus. */
export function platePoints(o: Order): { points: number; perfect: boolean; late: boolean } {
  const cook = o.sides.reduce((n, d) => n + sideScore[d], 0) / Math.max(1, o.sides.length);
  const late = o.waited > o.patience;
  const speed = late ? 0 : 100 * (1 - (o.waited / o.patience) * 0.6);
  const care = Math.max(0, 100 - 30 * o.mistakes);
  const perfect = o.sides.every((d) => d === "perfect") && o.mistakes === 0 && !late;
  return { points: Math.round(cook * 0.5 + speed * 0.3 + care * 0.2), perfect, late };
}
export const comboBonus = (combo: number) => Math.min(50, Math.max(0, combo - 1) * 10);

/** Star thresholds for a run's score (tuned with the bots in tests). */
export const STARS: readonly [number, number, number] = [400, 950, 2400];
export const starsFor = (score: number) => STARS.filter((s) => score >= s).length;

const feedback = (g: KitchenGame, last: Feedback): KitchenGame => ({ ...g, last, seq: g.seq + 1 });

function arrive(g: KitchenGame): KitchenGame {
  const order = orderFor(g.made, g.run * 1000 + g.made);
  const fresh = order.toppings.find((t) => !g.unlocked.includes(t));
  const unlocked = fresh ? TRAY.filter((t) => g.unlocked.includes(t) || t === fresh) : g.unlocked;
  return feedback(
    { ...g, made: g.made + 1, orders: [...g.orders, order], arrival: 2.5, unlocked },
    fresh ? { kind: "new", topping: fresh } : { kind: "arrive", id: order.id, name: order.name },
  );
}

function finishSide(g: KitchenGame, o: Order): KitchenGame {
  const done = doneness(o.heat);
  const sides = [...o.sides, done];
  const plated = !o.flip || o.side === 2 || done === "burnt";
  const next: Order = plated
    ? { ...o, sides: o.flip && sides.length < 2 ? [...sides, done] : sides, cook: "done", heat: o.heat }
    : { ...o, sides, side: 2, heat: 0 };
  return feedback({ ...g, orders: g.orders.map((x) => (x === o ? next : x)) }, { kind: "side", done, plated });
}

export function kitchenReducer(g: KitchenGame, a: KitchenAction): KitchenGame {
  if (a.type === "start") {
    const fresh = { ...newKitchen(g.run + 1), phase: a.tutorial ? ("tutorial" as const) : ("service" as const) };
    return arrive(fresh);
  }
  if (a.type === "stop") return { ...g, phase: "idle" };
  if (g.phase !== "tutorial" && g.phase !== "service") return g;
  if (a.type === "tick") {
    if (!Number.isFinite(a.dt) || a.dt <= 0) return g;
    const dt = Math.min(a.dt, 0.5),
      timed = g.phase === "service";
    let next: KitchenGame = {
      ...g,
      clock: timed ? Math.max(0, g.clock - dt) : g.clock,
      arrival: g.arrival - dt,
      orders: g.orders.map((o) => ({
        ...o,
        waited: timed ? o.waited + dt : o.waited,
        heat: o.cook === "grill" ? o.heat + dt / SIDE_SECONDS : o.heat,
      })),
    };
    const charred = next.orders.find((o) => o.cook === "grill" && o.heat >= BURNT);
    if (charred) next = finishSide(next, charred);
    if (timed && next.clock === 0) return feedback({ ...next, phase: "results", combo: next.combo }, { kind: "end" });
    if (timed && next.arrival <= 0 && next.orders.length < railSize(next.made)) next = arrive(next);
    return next;
  }
  if (a.type === "grill") {
    const o = grillOrder(g);
    if (!o) return g;
    if (o.cook === "raw") {
      if (g.orders.some((x) => x.cook === "grill")) return g;
      return feedback({ ...g, orders: g.orders.map((x) => (x === o ? { ...x, cook: "grill", heat: 0 } : x)) }, { kind: "grill" });
    }
    if (o.heat < EARLY) return feedback(g, { kind: "early" });
    return finishSide(g, o);
  }
  // add
  const o = plateOrder(g),
    want = wanted(o);
  if (!o || a.topping !== want) {
    if (!o) return feedback(g, { kind: "wrong", topping: a.topping, want: null });
    return feedback(
      { ...g, mistakes: g.mistakes + 1, orders: g.orders.map((x) => (x === o ? { ...x, mistakes: x.mistakes + 1 } : x)) },
      { kind: "wrong", topping: a.topping, want },
    );
  }
  const stacked: Order = { ...o, stacked: o.stacked + 1 };
  if (stacked.stacked < stacked.toppings.length)
    return feedback({ ...g, orders: g.orders.map((x) => (x === o ? stacked : x)) }, { kind: "add", topping: a.topping });
  // Top bun: serve.
  const { points, perfect, late } = platePoints(stacked);
  const combo = perfect ? g.combo + 1 : 0;
  const gained = points + (perfect ? comboBonus(combo) : 0);
  const first = g.phase === "tutorial";
  return feedback(
    {
      ...g,
      orders: g.orders.filter((x) => x !== o),
      score: g.score + gained,
      served: g.served + 1,
      perfects: g.perfects + (perfect ? 1 : 0),
      combo,
      bestCombo: Math.max(g.bestCombo, combo),
      arrival: first ? 1.5 : Math.min(g.arrival, 1.2),
      phase: "service",
    },
    { kind: "serve", points: gained, perfect, combo, name: o.name, late, rush: first },
  );
}
