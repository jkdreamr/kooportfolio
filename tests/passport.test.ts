import { describe, expect, it, vi } from "vitest";
import {
  addMemory,
  cleanDaily,
  cleanKit,
  freshSave,
  hasMemory,
  parseSave,
  recordDaily,
  SAVE_KEY,
  type DailyRecord,
} from "../src/shared/save";
import {
  HOME_ROOMS,
  isStampId,
  STAMP_COLOURS,
  STAMP_IDS,
  STAMPS,
  stampMemory,
  stampsEarned,
  type PassportSave,
} from "../src/game/core/passport";
import { gamesAtTier, MEDAL_GAMES, MEDALS, medalFor, meets, nextMedal, tierName } from "../src/game/core/medals";

const save = (over: Partial<PassportSave> = {}): PassportSave => ({ memories: [], ...over });

describe("save: memories, daily and kit (J0)", () => {
  it("old saves (no daily, kit or stamp memories) parse unchanged", () => {
    const old = { ...freshSave(), revision: 7, memories: ["hoover-key"], bests: { "gym.streak": 4 } };
    const parsed = parseSave(JSON.stringify(old));
    expect(parsed).toEqual(old);
    expect("daily" in parsed).toBe(false);
    expect("kit" in parsed).toBe(false);
  });
  it("malformed daily and kit are dropped without rejecting the save", () => {
    for (const daily of [[1], "x", { day: -1, done: [], streak: 0, best: 0, last: 0 }, { day: 1, done: ["BAD KEY"], streak: 0, best: 0, last: 0 }, { day: 1.5, done: [], streak: 0, best: 0, last: 0 }]) {
      const parsed = parseSave(JSON.stringify({ ...freshSave(), daily, kit: 4 }));
      expect(parsed.daily).toBeUndefined();
      expect(parsed.kit).toBeUndefined();
      expect(parsed.memories).toEqual([]);
    }
    const kit = parseSave(JSON.stringify({ ...freshSave(), kit: { "basketball.ball": "sunset", "Bad": "x", "skate.deck": "Not OK", "go.board": 3 } })).kit;
    expect(kit).toEqual({ "basketball.ball": "sunset" });
    expect(cleanKit({})).toBeUndefined();
  });
  it("a good daily record survives; best is never below streak; done is de-duplicated", () => {
    const d = { day: 20419, done: ["home.toss", "home.toss"], streak: 3, best: 2, last: 20418 };
    expect(cleanDaily(d)).toEqual({ day: 20419, done: ["home.toss"], streak: 3, best: 3, last: 20418 });
    expect(parseSave(JSON.stringify({ ...freshSave(), daily: d })).daily?.best).toBe(3);
  });
  it("hasMemory / addMemory are pure and refuse bad ids", () => {
    const s = freshSave();
    const t = addMemory(s, "stamp:home.cat");
    expect(t).not.toBe(s);
    expect(s.memories).toEqual([]);
    expect(hasMemory(t, "stamp:home.cat")).toBe(true);
    expect(addMemory(t, "stamp:home.cat")).toBe(t);
    expect(addMemory(t, "Bad Id")).toBe(t);
    expect(addMemory(t, "")).toBe(t);
  });
  it("daily streak: consecutive days grow it, a gap restarts it, a backwards clock revokes nothing", () => {
    let d: DailyRecord | undefined;
    const finish = (day: number) => {
      for (const task of ["a", "b", "c"]) d = recordDaily(d, day, task).daily;
      return d!;
    };
    let r = recordDaily(undefined, 100, "a");
    expect(r).toMatchObject({ changed: true, completed: false });
    expect(r.daily).toEqual({ day: 100, done: ["a"], streak: 0, best: 0, last: 0 });
    expect(recordDaily(r.daily, 100, "a").changed).toBe(false);
    d = r.daily;
    r = recordDaily(d, 100, "b");
    r = recordDaily(r.daily, 100, "c");
    expect(r.completed).toBe(true);
    expect(r.daily).toMatchObject({ streak: 1, best: 1, last: 100 });
    d = r.daily;
    expect(finish(101)).toMatchObject({ streak: 2, best: 2, last: 101 });
    expect(finish(102)).toMatchObject({ streak: 3, best: 3, last: 102 });
    expect(finish(105)).toMatchObject({ streak: 1, best: 3, last: 105 });
    // Clock goes back: today's list restarts, the streak is untouched.
    const back = finish(90);
    expect(back).toMatchObject({ day: 90, streak: 1, best: 3, last: 105 });
    // A new day resets done.
    expect(recordDaily(back, 106, "x").daily.done).toEqual(["x"]);
    expect(recordDaily(back, -1, "x").changed).toBe(false);
    expect(recordDaily(back, 106, "Bad Task").changed).toBe(false);
  });
});

describe("passport stamps (J0 skeleton)", () => {
  it("has the 40 stamps of §3.2 (with Banner Rush's keep and ground), unique ids, four worlds", () => {
    expect(STAMPS).toHaveLength(40);
    expect(new Set(STAMP_IDS).size).toBe(40);
    expect(STAMPS.filter((s) => s.world === "home")).toHaveLength(14);
    expect(STAMPS.filter((s) => s.world === "stanford")).toHaveLength(12);
    expect(STAMPS.filter((s) => s.world === "korea")).toHaveLength(8);
    expect(STAMPS.filter((s) => s.world === "village")).toHaveLength(6);
    for (const s of STAMPS) {
      expect(s.id.startsWith(`${s.world}.`)).toBe(true);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.how.length).toBeGreaterThan(0);
    }
    expect(Object.keys(STAMP_COLOURS)).toEqual(["home", "stanford", "korea", "village"]);
    expect(isStampId("home.banner")).toBe(true);
    expect(isStampId("home.nope")).toBe(false);
  });
  it("a fresh save has none; every stamp can be earned by its memory flag", () => {
    expect(stampsEarned(save()).size).toBe(0);
    expect(stampsEarned(save({ memories: STAMP_IDS.map(stampMemory) })).size).toBe(40);
  });
  it("derived stamps: true and false cases", () => {
    const cases: [string, PassportSave, PassportSave][] = [
      ["home.toss", save({ bests: { "paper-toss.level": 3 } }), save({ bests: { "paper-toss.level": 2 } })],
      ["home.kitchen", save({ bests: { "kitchen.stars": 1 } }), save({ bests: { "kitchen.stars": 0 } })],
      ["home.go", save({ bests: { "go.wins.easy": 1 } }), save({ bests: { "go.capture.wins": 0 } })],
      ["home.go", save({ bests: { "go.capture.wins": 1 } }), save()],
      ["home.kick", save({ bests: { "stadium.yards": 40 } }), save({ bests: { "stadium.distance": 60 } })],
      ["home.beat", save({ bests: { "music.rounds": 1 } }), save({ bests: { "music.landed": 9 } })],
      ["home.banner", save({ bests: { "banner-rush.wins": 1 } }), save()],
      ["stanford.hoops", save({ bests: { "basketball.points.hot": 30 } }), save({ bests: { "basketball.points.attack": 90 } })],
      ["stanford.shuttle", save({ bests: { "badminton.wins": 2 } }), save({ bests: { "badminton.rally": 30 } })],
      ["stanford.shuttle", save({ bests: { "badminton.wins.captain": 1 } }), save()],
      ["stanford.crew", save({ bests: { "rowing.gp.place.novice": 3 } }), save({ bests: { "rowing.time.360": 25 } })],
      ["stanford.skate", save({ bests: { "skate.score.run": 2000 } }), save({ bests: { "skate.score.run": 1999 } })],
      ["stanford.lights", save({ bests: { "math.par": 1 } }), save({ bests: { "math.puzzle": 9 } })],
      ["stanford.bench", save({ bests: { "gym.reps": 8 } }), save({ bests: { "gym.streak": 8 } })],
      ["stanford.kappa", save({ bests: { "pong.throws": 10 } }), save({ bests: { "blackjack.stack": 100 } })],
      ["stanford.kappa", save({ bests: { "blackjack.stack": 120 } }), save()],
      ["stanford.key", save({ memories: ["campus-stash"] }), save({ memories: ["hoover-key"] })],
      ["korea.sights", save({ memories: ["sight:gwanghwamun", "sight:bukchon", "sight:sejong", "sight:namsan"] }), save({ memories: ["sight:gwanghwamun", "sight:bukchon", "sight:sejong"] })],
      ["village.daily", save({ daily: { day: 1, done: [], streak: 0, best: 1, last: 1 } }), save({ daily: { day: 1, done: ["a", "b"], streak: 0, best: 0, last: 0 } })],
      ["village.week", save({ daily: { day: 9, done: [], streak: 1, best: 7, last: 9 } }), save({ daily: { day: 9, done: [], streak: 6, best: 6, last: 9 } })],
    ];
    for (const [id, yes, no] of cases) {
      expect(stampsEarned(yes).has(id), `${id} earned`).toBe(true);
      expect(stampsEarned(no).has(id), `${id} not earned`).toBe(false);
    }
  });
  it("discovery stamps read WS-I's found map", () => {
    const found: Record<string, true> = {};
    for (let i = 0; i < 9; i++) found[`${HOME_ROOMS[i % HOME_ROOMS.length]}:item${i}`] = true;
    found["campus:x"] = true;
    expect(stampsEarned(save(), found).has("home.rooms")).toBe(false);
    found["kitchen:pan"] = true;
    expect(stampsEarned(save(), found).has("home.rooms")).toBe(true);
    expect(stampsEarned(save(), { "cognition:hiring": true }).has("korea.office")).toBe(true);
    expect(stampsEarned(save(), { "cognition:coffee": true }).has("korea.office")).toBe(false);
  });
  it("village.gold needs gold in five games", () => {
    const four = { "basketball.wins.legend": 1, "stadium.yards": 54, "gym.reps": 20, "blackjack.stack": 400 };
    expect(stampsEarned(save({ bests: four })).has("village.gold")).toBe(false);
    expect(stampsEarned(save({ bests: { ...four, "skate.score.run": 12000 } })).has("village.gold")).toBe(true);
  });
  it("is monotonic as bests improve and memories are added", () => {
    let s = save();
    let prev = stampsEarned(s);
    const steps: Partial<PassportSave>[] = [
      { bests: { "paper-toss.level": 3 } },
      { bests: { "paper-toss.level": 5, "gym.reps": 9 } },
      { memories: ["stamp:home.cat"] },
      { bests: { "paper-toss.level": 5, "gym.reps": 30, "pong.throws": 6 } },
    ];
    for (const step of steps) {
      s = { ...s, ...step, memories: [...s.memories, ...(step.memories ?? [])] };
      const next = stampsEarned(s);
      for (const id of prev) expect(next.has(id)).toBe(true);
      prev = next;
    }
    expect(prev.size).toBe(4);
  });
});

describe("medals (J0 skeleton)", () => {
  it("covers the thirteen games of §3.3 with four tiers each", () => {
    expect(MEDAL_GAMES).toHaveLength(13);
    for (const g of MEDAL_GAMES) expect(MEDALS[g].tiers).toHaveLength(4);
  });
  it("threshold tables are monotonic (max rising, min falling)", () => {
    for (const g of MEDAL_GAMES) {
      const t = MEDALS[g].tiers.map((x) => x.when);
      for (let i = 1; i < 4; i++) {
        const a = t[i - 1], b = t[i];
        if ("atLeast" in a && "atLeast" in b && a.key === b.key) expect(b.atLeast).toBeGreaterThan(a.atLeast);
        if ("atMost" in a && "atMost" in b && a.key === b.key) expect(b.atMost).toBeLessThan(a.atMost);
      }
    }
  });
  it("medalFor and nextMedal", () => {
    expect(medalFor("basketball", undefined)).toBe(0);
    expect(nextMedal("basketball", undefined)).toEqual({ tier: 1, name: "Bronze", need: "Beat the Classmate" });
    expect(medalFor("basketball", { "basketball.wins.classmate": 3, "basketball.wins.hooper": 1 })).toBe(2);
    expect(medalFor("basketball", { "basketball.ladder": 1 })).toBe(4);
    expect(nextMedal("basketball", { "basketball.ladder": 1 })).toBeNull();
    expect(nextMedal("basketball", { "basketball.wins.legend": 1 })).toMatchObject({ tier: 4, name: "MVP" });
    expect(tierName("stadium", 4)).toBe("Ice in the Veins");
    expect(medalFor("pong", { "pong.throws": 10 })).toBe(1);
    expect(medalFor("pong", { "pong.throws": 7 })).toBe(3);
    expect(medalFor("pong", { "pong.throws": 6 })).toBe(4);
    expect(medalFor("math", { "math.sprint": 120 })).toBe(2);
    expect(medalFor("badminton", { "badminton.wins.freshman": 3, "badminton.wins.captain": 1 })).toBe(2);
  });
  it("variants: per distance or chart, and best over all without one", () => {
    const bests = { "rowing.gp.place.novice": 1, "rowing.gp.place.varsity": 3 };
    expect(medalFor("rowing", bests)).toBe(2);
    expect(medalFor("rowing", { ...bests, "rowing.gp.place.head": 1 })).toBe(4);
    expect(medalFor("rowing", { "rowing.gp.place.novice": 4 })).toBe(1);
    expect(medalFor("rowing", { "rowing.gp.place.varsity": 1 })).toBe(3);
    expect(medalFor("music", { "music.rounds": 4, "music.beats": 3 })).toBe(2);
    expect(medalFor("music", { "music.rounds": 9, "music.beats": 8, "music.landed": 16 })).toBe(4);
    expect(meets({ "music.accuracy": 99 }, { key: "music.accuracy.{v}", atLeast: 10 })).toBe(false);
  });
  it("counts games at a tier", () => {
    expect(gamesAtTier({ "gym.reps": 20, "blackjack.stack": 150 }, 1)).toBe(2);
    expect(gamesAtTier({ "gym.reps": 20, "blackjack.stack": 150 }, 3)).toBe(1);
  });
});

describe("store actions (J0)", () => {
  it("remember, earnStamp, setKit and recordDaily persist; carrying starts empty", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    try {
      vi.resetModules();
      const { useGame, runtime } = await import("../src/game/core/store");
      expect(runtime.carrying).toBeNull();
      const g = () => useGame.getState();
      expect(g().earnStamp("home.cat")).toBe(true);
      expect(g().earnStamp("home.cat")).toBe(false);
      expect(g().earnStamp("home.nope")).toBe(false);
      expect(g().remember("coach:rowing")).toBe(true);
      g().setKit("basketball.ball", "sunset");
      g().setKit("bad slot", "x");
      expect(g().recordDaily("home.toss", 3, 500)).toMatchObject({ changed: true, completed: false });
      const saved = JSON.parse(store.get(SAVE_KEY)!);
      expect(saved.memories).toEqual(["stamp:home.cat", "coach:rowing"]);
      expect(saved.kit).toEqual({ "basketball.ball": "sunset" });
      expect(saved.daily).toEqual({ day: 500, done: ["home.toss"], streak: 0, best: 0, last: 0 });
      g().setKit("basketball.ball", null);
      expect(JSON.parse(store.get(SAVE_KEY)!).kit).toBeUndefined();
      vi.resetModules();
      const again = await import("../src/game/core/store");
      expect(stampsEarned(again.useGame.getState().save).has("home.cat")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
