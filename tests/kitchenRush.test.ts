import { describe, expect, it } from "vitest";
import {
  BURNT,
  doneness,
  grillOrder,
  kitchenReducer as act,
  newKitchen,
  nextStep,
  plateOrder,
  RUSH_SECONDS,
  starsFor,
  TRAY,
} from "../src/game/scenes/kitchenRush";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Bot = {
  /** Seconds between noticing and acting. */
  react: () => number;
  /** Heat at which this bot taps the grill. */
  tapAt: () => number;
  /** Chance a topping tap picks the wrong ingredient. */
  slip: number;
};
/** Plays a whole run (tutorial order first) by following the highlight. */
function play(bot: Bot, seed: number, rand = rng(seed)) {
  let g = act(newKitchen(), { type: "start", tutorial: true });
  let wait = bot.react(),
    target = bot.tapAt();
  const dt = 0.05;
  for (let t = 0; t < RUSH_SECONDS + 120 && g.phase !== "results"; t += dt) {
    g = act(g, { type: "tick", dt });
    wait -= dt;
    if (wait > 0) continue;
    const step = nextStep(g);
    if (!step) continue;
    if (step === "grill") {
      const o = grillOrder(g)!;
      // Wait for this bot's tap point (it may be late: past gold).
      if (o.cook === "grill" && o.heat < target) continue;
      g = act(g, { type: "grill" });
      if (o.cook === "grill") target = bot.tapAt();
    } else {
      const wrong = rand() < bot.slip;
      g = act(g, { type: "add", topping: wrong ? TRAY.find((x) => x !== step)! : step });
    }
    wait = bot.react();
    // Start the next patty as soon as the grill is free.
    if (grillOrder(g)?.cook === "raw" && !g.orders.some((o) => o.cook === "grill")) {
      g = act(g, { type: "grill" });
      wait += bot.react();
    }
  }
  return g;
}

const casual = (r: () => number): Bot => ({
  react: () => 0.9 + r() * 0.9,
  tapAt: () => 0.5 + r() * 1.25,
  slip: 0.12,
});
const good = (r: () => number): Bot => ({
  react: () => 0.3 + r() * 0.2,
  tapAt: () => 0.9 + r() * 0.25,
  slip: 0,
});

describe("Lunch Rush kitchen", () => {
  it("teaches on an untimed first order of three steps", () => {
    let g = act(newKitchen(), { type: "start", tutorial: true });
    expect(g.phase).toBe("tutorial");
    expect(g.orders).toHaveLength(1);
    expect(g.orders[0].toppings).toEqual(["cheese", "top"]);
    expect(g.orders[0].flip).toBe(false);
    expect(nextStep(g)).toBe("grill");
    g = act(g, { type: "grill" });
    for (let i = 0; i < 100; i++) g = act(g, { type: "tick", dt: 0.5 });
    // The clock waits for the tutorial; the patty burns and plates itself.
    expect(g.clock).toBe(RUSH_SECONDS);
    expect(plateOrder(g)?.sides).toEqual(["burnt"]);
    expect(nextStep(g)).toBe("cheese");
    g = act(g, { type: "add", topping: "top" });
    expect(g.last.kind).toBe("wrong");
    expect(plateOrder(g)?.stacked).toBe(0);
    g = act(act(g, { type: "add", topping: "cheese" }), { type: "add", topping: "top" });
    expect(g.phase).toBe("service");
    expect(g.served).toBe(1);
    expect(g.last).toMatchObject({ kind: "serve", rush: true, perfect: false });
  });

  it("ignores early taps and grades doneness by heat", () => {
    let g = act(newKitchen(), { type: "start" });
    g = act(act(g, { type: "grill" }), { type: "tick", dt: 0.3 });
    g = act(g, { type: "grill" });
    expect(g.last.kind).toBe("early");
    expect(doneness(1)).toBe("perfect");
    expect(doneness(0.7)).toBe("good");
    expect(doneness(0.5)).toBe("under");
    expect(doneness(1.7)).toBe("over");
    expect(doneness(BURNT)).toBe("burnt");
  });

  it("builds a combo from back-to-back perfect plates", () => {
    let g = act(newKitchen(), { type: "start" });
    for (let n = 0; n < 3; n++) {
      while (!grillOrder(g)) g = act(g, { type: "tick", dt: 0.1 });
      g = act(g, { type: "grill" });
      const sides = grillOrder(g)!.flip ? 2 : 1;
      for (let s = 0; s < sides; s++) {
        for (let i = 0; i < 26; i++) g = act(g, { type: "tick", dt: 0.1 });
        g = act(g, { type: "grill" });
      }
      for (let step = nextStep(g); step && step !== "grill"; step = nextStep(g)) g = act(g, { type: "add", topping: step });
    }
    expect(g.served).toBe(3);
    expect(g.perfects).toBe(3);
    expect(g.combo).toBe(3);
  });

  it("ramps from one short ticket to two longer ones", () => {
    let g = act(newKitchen(), { type: "start" });
    const sizes: number[] = [];
    for (let t = 0; t < 100 && g.phase === "service"; t += 0.1) {
      g = act(g, { type: "tick", dt: 0.1 });
      const step = nextStep(g);
      if (step === "grill") {
        const o = grillOrder(g)!;
        if (o.cook === "raw" || o.heat >= 1) g = act(g, { type: "grill" });
      } else if (step) g = act(g, { type: "add", topping: step });
      sizes.push(g.orders.length);
    }
    expect(Math.max(...sizes.slice(0, 50))).toBe(1);
    expect(Math.max(...sizes)).toBe(2);
    expect(g.unlocked).toContain("onion");
  });

  it("gives a casual player 1–2 stars and a good one 3", () => {
    const casualStars: number[] = [],
      goodStars: number[] = [],
      scores: number[][] = [[], []];
    for (let seed = 1; seed <= 12; seed++) {
      const r1 = rng(seed),
        r2 = rng(seed + 99);
      const a = play(casual(r1), seed),
        b = play(good(r2), seed);
      scores[0].push(a.score);
      scores[1].push(b.score);
      casualStars.push(starsFor(a.score));
      goodStars.push(starsFor(b.score));
    }
    if (process.env.KITCHEN_TUNE) {
      const decent = (r: () => number): Bot => ({ react: () => 0.6 + r() * 0.5, tapAt: () => 0.75 + r() * 0.55, slip: 0.04 });
      console.log("casual", scores[0], "good", scores[1], "decent", [1, 2, 3, 4, 5, 6].map((s) => play(decent(rng(s + 7)), s).score));
    }
    for (const s of casualStars) expect(s === 1 || s === 2).toBe(true);
    for (const s of goodStars) expect(s).toBe(3);
  });
});
