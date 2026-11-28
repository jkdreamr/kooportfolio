import { describe, expect, it } from "vitest";
import {
  HIP,
  LAND_WINDOW,
  POP_MIN_SPEED,
  POP_RECOVER,
  RAIL_TO_RAIL_BONUS,
  SKATE,
  SKATE_GOAL_IDS,
  SKATE_LETTERS,
  SKATE_RAILS,
  hipAirValue,
  idleSkateInput,
  isCleanLine,
  newSkateGame,
  skateGoalMet,
  skateGoals,
  skateGoalsMet,
  skateHeight,
  stepSkate,
  trickValue,
  type SkateInput,
  type SkateState,
} from "../src/game/core/skate";
import { flatKickflips, masher, parkKickflips, standingSpam } from "./skateBots";

const idle = idleSkateInput();
function advance(g: SkateState, seconds: number, input: Partial<SkateInput> = {}) {
  const i = { ...idle, ...input };
  for (let n = 0; n < Math.round(seconds * 120); n++) stepSkate(g, i, 1 / 120);
}
const once = (g: SkateState, input: Partial<SkateInput>) => stepSkate(g, { ...idle, ...input }, 1 / 120);
/** A rolling skater on the flat front half, heading -z. */
function rolling(speed: number, mode: SkateState["mode"] = "free") {
  const g = newSkateGame(mode);
  Object.assign(g, { x: -1, z: 9, speed, y: skateHeight(-1, 9), messageTime: 0 });
  return g;
}
/** Holds speed on the flat (push just enough). */
const cruise = (g: SkateState) => ({ push: g.speed < 7 ? 1 : 0.1 });

describe("park and physics", () => {
  it("covers a large park with banks, hip and a flat entry", () => {
    expect(SKATE.halfWidth * 2 * SKATE.worldScale).toBeGreaterThanOrEqual(40);
    expect(skateHeight(0, 0)).toBeCloseTo(0.18);
    expect(skateHeight(SKATE.halfWidth, 0)).toBeGreaterThan(2);
    expect(skateHeight(0, -SKATE.halfDepth)).toBeGreaterThan(2);
    expect(skateHeight(0, SKATE.halfDepth)).toBeCloseTo(0.18);
    expect(skateHeight(HIP.x, HIP.z)).toBeGreaterThan(1.2);
    expect(SKATE_RAILS[2].height).toBe(0.35);
  });
  it("requires pushing, steers, brakes and stays in bounds", () => {
    const g = newSkateGame();
    advance(g, 1);
    expect(g.z).toBe(8);
    advance(g, 1, { push: 1 });
    expect(g.z).toBeLessThan(7);
    const startX = g.x;
    advance(g, 0.5, { push: 1, steer: 1 });
    expect(g.x).toBeGreaterThan(startX);
    g.speed = 2.5; // below manual speed, S is the brake
    advance(g, 1, { brake: true });
    expect(g.speed).toBe(0);
    advance(g, 50, { push: 1, steer: 0.1 });
    expect(Math.abs(g.x)).toBeLessThanOrEqual(SKATE.halfWidth);
    expect(Math.abs(g.z)).toBeLessThanOrEqual(SKATE.halfDepth);
    expect(Number.isFinite(g.y)).toBe(true);
  });
  it("a fast flat wall is a bail, a slow one a stop, a bank lip turns you round", () => {
    const fast = rolling(6);
    Object.assign(fast, { x: 0, z: 12.3, heading: Math.PI });
    advance(fast, 0.2);
    expect(fast.stats.bails).toBe(1);
    const slow = rolling(2);
    Object.assign(slow, { x: 0, z: 12.4, heading: Math.PI });
    advance(slow, 0.2);
    expect(slow.stats.bails).toBe(0);
    expect(slow.speed).toBe(0);
    const bank = rolling(9);
    Object.assign(bank, { x: 0, z: -11, heading: 0 });
    advance(bank, 1);
    expect(bank.stats.bails).toBe(0);
    expect(bank.z).toBeGreaterThan(-12.5);
  });
  it("keeps contacts stable over different frame rates and ignores bad time", () => {
    const g = newSkateGame();
    stepSkate(g, { ...idle, push: 1 }, NaN);
    stepSkate(g, { ...idle, push: 1 }, -1);
    expect(g.time).toBe(0);
    const slow = newSkateGame(),
      fast = newSkateGame();
    for (let i = 0; i < 30; i++) stepSkate(slow, { ...idle, push: 1 }, 1 / 30);
    for (let i = 0; i < 120; i++) stepSkate(fast, { ...idle, push: 1 }, 1 / 120);
    expect(slow.z).toBeCloseTo(fast.z, 4);
  });
});

describe("tricks need speed, air and a clean landing", () => {
  it("standing still scores nothing and says why", () => {
    const g = newSkateGame();
    for (let n = 0; n < 20; n++) {
      once(g, { trick: n % 2 ? "kickflip" : "shove-it" });
      if (n === 0) expect(g.message).toBe("Need speed");
      advance(g, 1.5);
    }
    expect(g.score).toBe(0);
    expect(g.combo).toBe(0);
  });
  it("below the pop speed a flip animates but pays 0", () => {
    const g = rolling(POP_MIN_SPEED - 0.2);
    once(g, { trick: "kickflip" });
    expect(g.trick).toBe("kickflip");
    advance(g, 2, { push: 0.1 });
    expect(g.score).toBe(0);
  });
  it("a flip at speed, landed rolling, banks after the landing window", () => {
    const g = rolling(7);
    once(g, { trick: "kickflip" });
    advance(g, 0.75, cruise(g));
    expect(g.score).toBe(0);
    advance(g, 0.1, cruise(g));
    expect(g.grounded).toBe(true);
    expect(g.combo).toBe(trickValue("kickflip", 7));
    advance(g, LAND_WINDOW + 0.05, cruise(g));
    expect(g.score).toBe(trickValue("kickflip", 7));
  });
  it("one flip per pop on the flat; a second flip in the same air bails", () => {
    const g = rolling(7);
    once(g, { trick: "kickflip" });
    advance(g, 0.43);
    once(g, { trick: "kickflip" });
    advance(g, 1);
    expect(g.stats.bails).toBe(1);
    expect(g.score).toBe(0);
  });
  it("ollie alone is worth nothing", () => {
    const g = rolling(7);
    once(g, { jump: true });
    advance(g, 2, cruise(g));
    expect(g.score).toBe(0);
  });
  it("must set your feet before the next pop", () => {
    const g = rolling(7);
    once(g, { jump: true });
    advance(g, 0.85, cruise(g));
    expect(g.grounded).toBe(true);
    once(g, { jump: true });
    expect(g.grounded).toBe(true);
    advance(g, POP_RECOVER, cruise(g));
    once(g, { jump: true });
    expect(g.grounded).toBe(false);
  });
  it("speed scales value; the hip air pays ×1.5", () => {
    expect(trickValue("kickflip", 7)).toBe(120);
    expect(trickValue("kickflip", 10)).toBe(120);
    expect(trickValue("kickflip", 3.5)).toBe(60);
    expect(trickValue("kickflip", 1)).toBe(Math.round(120 * 0.45));
    expect(trickValue("kickflip", 7, true)).toBe(180);
    expect(hipAirValue(0.3)).toBe(150);
    expect(hipAirValue(0.6)).toBe(250);
    expect(hipAirValue(0.81)).toBe(350);
  });
  it("no repetition penalty: ten kickflips at the same speed pay ten equal values", () => {
    const g = rolling(7);
    const paid: number[] = [];
    for (let n = 0; n < 10; n++) {
      Object.assign(g, { x: -1, z: 9, heading: 0, speed: 7, y: skateHeight(-1, 9), recover: 0 });
      const before = g.score;
      once(g, { trick: "kickflip" });
      advance(g, 1.4, { push: 0 });
      g.speed = 7;
      advance(g, 0.4);
      paid.push(g.score - before);
    }
    expect(new Set(paid)).toEqual(new Set([trickValue("kickflip", 7)]));
  });
  it("loses only the unbanked line if a late flip hits the ground", () => {
    const g = rolling(7);
    g.score = 1234;
    once(g, { jump: true });
    advance(g, 0.64);
    once(g, { trick: "kickflip" });
    advance(g, 0.3);
    expect(g.bailTime).toBeGreaterThan(0);
    expect(g.combo).toBe(0);
    expect(g.score).toBe(1234);
  });
});

describe("combos are lines: manuals, grinds and hip airs link", () => {
  it("multiplier counts landed elements and caps at ×6", () => {
    const g = rolling(7);
    g.combo = 100;
    g.count = 9;
    advance(g, LAND_WINDOW + 0.1);
    g.landWindow = 0.01;
    advance(g, 0.05);
    expect(g.score).toBe(600);
  });
  it("a manual keeps the combo open and pays per second; losing balance bails", () => {
    const g = rolling(7);
    once(g, { trick: "kickflip" });
    advance(g, 0.85, cruise(g));
    expect(g.landWindow).toBeGreaterThan(0);
    // S lightly while rolling: manual, needle corrected with steering.
    for (let n = 0; n < 240; n++) stepSkate(g, { ...idle, brake: true, steer: Math.max(-1, Math.min(1, g.needle * 3)) }, 1 / 120);
    expect(g.manual).toBe(true);
    expect(g.score).toBe(0);
    expect(g.count).toBe(2);
    const g2 = rolling(7);
    advance(g2, 3, { brake: true });
    expect(g2.stats.bails).toBe(1);
  });
  it("one manual per landing (tapping S cannot farm the multiplier)", () => {
    const g = rolling(7);
    for (let n = 0; n < 20; n++) {
      once(g, { brake: true });
      once(g, {});
    }
    expect(g.count).toBe(1);
  });
  it("grinds link, Rail to rail pays once, and a flip off a rail end counts", () => {
    const g = newSkateGame(),
      r0 = SKATE_RAILS[0];
    Object.assign(g, { x: r0.x, z: 1.5, speed: 6 });
    advance(g, 0.05, { grind: true });
    expect(g.rail).toBe(0);
    expect(g.count).toBe(1);
    g.comboRails |= 2; // as if rail 1 was ground earlier in the line
    g.rail = -1;
    g.railLock = 0;
    g.y = r0.height;
    advance(g, 0.02, { grind: true });
    expect(g.rail).toBe(0);
    expect(g.railBonus).toBe(true);
    const combo = g.combo;
    advance(g, 0.02, { grind: true });
    expect(g.combo - combo).toBeLessThan(RAIL_TO_RAIL_BONUS);
    once(g, { trick: "kickflip", grind: true });
    expect(g.grounded).toBe(false);
    advance(g, 3, { push: 1 });
    expect(g.score).toBeGreaterThan(0);
    expect(g.stats.kickflips).toBe(1);
  });
  it("does not teleport a distant skater onto a rail", () => {
    const g = newSkateGame();
    Object.assign(g, { x: -1, z: 1, speed: 4 });
    advance(g, 1, { grind: true });
    expect(g.rail).toBe(-1);
  });
});

describe("runs, goals and letters", () => {
  it("goals are three distinct, seeded and from the pool of 12", () => {
    expect(SKATE_GOAL_IDS).toHaveLength(12);
    for (let seed = 0; seed < 200; seed++) {
      const goals = skateGoals(seed);
      expect(new Set(goals).size).toBe(3);
      expect(skateGoals(seed)).toEqual(goals);
      for (const id of goals) expect(SKATE_GOAL_IDS).toContain(id);
    }
    expect(newSkateGame("free").goals).toEqual([]);
    expect(newSkateGame("daily", 9).goals).toEqual(skateGoals(9));
  });
  it("evaluates goals from the run's stats", () => {
    const g = newSkateGame("run", 3);
    g.stats.railToRail = 1;
    g.bestCombo = 1500;
    g.stats.longestManual = 3;
    g.letters = 15;
    expect(skateGoalMet("both-rails", g)).toBe(true);
    expect(skateGoalMet("combo-1500", g)).toBe(true);
    expect(skateGoalMet("manual-3", g)).toBe(true);
    expect(skateGoalMet("josh", g)).toBe(true);
    expect(skateGoalMet("no-bails", g)).toBe(false); // not over yet
    g.phase = "done";
    expect(skateGoalMet("no-bails", g)).toBe(true);
    g.goals = ["both-rails", "josh", "no-bails"];
    expect(skateGoalsMet(g)).toBe(3);
    g.score = 12000;
    expect(isCleanLine(g)).toBe(true);
    g.stats.bails = 1;
    expect(isCleanLine(g)).toBe(false);
  });
  it("J-O-S-H pays 1,000 once all four are collected in a run", () => {
    const g = newSkateGame("run");
    for (const l of SKATE_LETTERS) {
      Object.assign(g, { x: l.x, z: l.z, y: skateHeight(l.x, l.z), speed: 0 });
      once(g, {});
    }
    expect(g.letters).toBe(15);
    expect(g.score).toBe(1000);
  });
  it("ends timed runs and never counts an unfinished airborne line", () => {
    const g = rolling(7, "run");
    g.time = 59.9;
    once(g, { trick: "kickflip" });
    advance(g, 0.2);
    expect(g.phase).toBe("done");
    expect(g.score).toBe(0);
    const time = g.time;
    advance(g, 2, { jump: true, push: 1 });
    expect(g.time).toBe(time);
    const free = newSkateGame();
    advance(free, 61);
    expect(free.phase).toBe("riding");
  });
  it("ends after 60 active seconds at low frame rates", () => {
    for (const fps of [4, 15, 60]) {
      const g = newSkateGame("run");
      for (let frame = 0; frame < 60 * fps; frame++) stepSkate(g, idle, 1 / fps);
      expect(g.phase, `${fps} FPS`).toBe("done");
      expect(g.time).toBe(SKATE.duration);
    }
  });
});

describe("tuning bots (§2.6)", () => {
  it("standing spam scores 0 (the old 198,000 exploit)", () => {
    expect(standingSpam().score).toBe(0);
  });
  it("a random masher lands a small score", () => {
    const scores = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => masher(s).score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(mean).toBeGreaterThan(200);
    expect(mean).toBeLessThan(2500);
  });
  it("kickflip-only: the flat pays some, a line through the park pays more (gold possible)", () => {
    const flat = flatKickflips().score,
      park = parkKickflips().score;
    expect(flat).toBeGreaterThan(3000);
    expect(flat).toBeLessThan(10000);
    expect(park).toBeGreaterThan(flat * 1.2);
    expect(park).toBeGreaterThanOrEqual(12000);
    expect(park).toBeLessThanOrEqual(40000);
  });
});
