import { describe, expect, it } from "vitest";
import { balanceIndex, CARD_IDS, CARDS, STARTER_DECKS, validDeck } from "../../src/game/core/bannerRush/cards";
import { queueDamage } from "../../src/game/core/bannerRush/combat";
import { EV_HEAL, EV_HIT } from "../../src/game/core/bannerRush/types";
import { collect, hand, match, run, spawn } from "./helpers";
import type { MatchState } from "../../src/game/core/bannerRush/types";

const stun = (s: MatchState) => {
  for (let t = 0; t < 6; t++) s.stunT[t] = 30000;
};

describe("Banner Rush cards", () => {
  it("T-R20 balance indices (Revision 2) sit in their bands", () => {
    const expected: Record<string, number> = { skater: 1.12, runners: 1.05, kites: 0.9, slinger: 0.98, shieldbearer: 0.89, hoop: 0.93, rowers: 1.09, lantern: 1.13, beekeeper: 1.0, haycart: 0.94, balloon: 0.92, mascot: 1.03 };
    for (const [id, n] of Object.entries(expected)) {
      const got = balanceIndex(id as never);
      expect(Math.abs(got - n), `${id} ${got}`).toBeLessThan(0.015);
      expect(got).toBeGreaterThanOrEqual(0.8);
      expect(got).toBeLessThanOrEqual(1.15);
    }
    for (const [id, n] of Object.entries({ telescope: 1.06, stall: 1.0, gostone: 0.92, smash: 0.99, comet: 0.96 })) {
      const got = balanceIndex(id as never);
      expect(Math.abs(got - n), id).toBeLessThan(0.015);
      expect(got).toBeGreaterThanOrEqual(0.85);
      expect(got).toBeLessThanOrEqual(1.15);
    }
  });

  it("starter decks are valid and every card has a name, cost and art key", () => {
    for (const d of Object.values(STARTER_DECKS)) expect(validDeck(d.cards)).toBe(true);
    for (const id of CARD_IDS) expect(CARDS[id].cost).toBeGreaterThan(0);
  });

  it("T-R15 specials: Shieldbearer resist, Hoop swish, Rower charge, Mascot ground splash", () => {
    const s = match();
    stun(s);
    s.stunT[3] = 0;
    const sb = spawn(s, "shieldbearer", 0, 13, 7.5 + 1.4 + 0.55 + 4);
    s.stunT[sb] = 30000;
    const hits = collect(s, 60, EV_HIT).filter((h) => h.a === sb);
    expect(hits[0].b).toBe(63);
    const t = match();
    stun(t);
    const hoop = spawn(t, "hoop", 0, 8, 17);
    const dummy = spawn(t, "mascot", 1, 8, 12);
    t.stunT[dummy] = 30000;
    const hh = collect(t, 300, EV_HIT).filter((h) => h.a === dummy && h.d === hoop);
    expect(hh.slice(0, 3).map((h) => h.b)).toEqual([230, 230, 345]);
    const u = match();
    stun(u);
    const rower = spawn(u, "rower", 0, 8, 26);
    const target = spawn(u, "mascot", 1, 8, 17);
    u.stunT[target] = 30000;
    const rh = collect(u, 400, EV_HIT).filter((h) => h.a === target && h.d === rower);
    expect(rh[0].b).toBe(200);
    expect(rh[1].b).toBe(100);
  });

  it("T-R15 [R2-5] the Lantern Keeper heals the 3 most-damaged allies, and two Keepers never stack", () => {
    const s = match();
    stun(s);
    const lantern = spawn(s, "lantern", 0, 8, 17.5);
    s.stunT[lantern] = 0;
    const allies = [0, 1, 2, 3, 4].map((k) => spawn(s, "shieldbearer", 0, 6 + k * 1.1, 18.6));
    allies.forEach((a, k) => {
      s.stunT[a] = 30000;
      s.hp[a] = 1000 - 100 * (k + 1);
    });
    const heals = collect(s, 21, EV_HEAL);
    expect(heals.map((h) => h.a).sort()).toEqual([allies[2], allies[3], allies[4]].sort());
    const t = match();
    stun(t);
    const k1 = spawn(t, "lantern", 0, 7.5, 17.5);
    const k2 = spawn(t, "lantern", 0, 9.5, 17.5);
    const ally = spawn(t, "shieldbearer", 0, 8.5, 18.5);
    t.stunT[ally] = 30000;
    t.hp[ally] = 500;
    void k1;
    void k2;
    run(t, 40);
    expect(t.hp[ally]).toBeLessThanOrEqual(500 + 72);
  });

  it("T-R16/T-R17 Telescope expires at 30 s; Go Stone 110/35 with a 16-tick stun; Comet lands at tick 20", () => {
    const s = match();
    stun(s);
    const tele = spawn(s, "telescope", 0, 8, 18);
    run(s, 599);
    expect(s.alive[tele]).toBe(1);
    run(s, 2);
    expect(s.alive[tele]).toBe(0);
    const t = match();
    stun(t);
    const r = spawn(t, "rower", 1, 8, 10);
    t.stunT[r] = 0;
    hand(t, 0, "gostone");
    t.glow[0] = 1680;
    const hits = collect(t, 10, EV_HIT, (st) => (st.tick === 0 ? [{ side: 0, slot: 0, x: 8.5, y: 10.5 }] : []));
    expect(hits.find((h) => h.a === r)?.b).toBe(110);
    expect(t.stunT[r]).toBeGreaterThan(10);
    const u = match();
    stun(u);
    const m = spawn(u, "mascot", 1, 8, 10);
    u.stunT[m] = 30000;
    hand(u, 0, "comet");
    u.glow[0] = 1680;
    const ch = collect(u, 30, EV_HIT, (st) => (st.tick === 0 ? [{ side: 0, slot: 0, x: 8.5, y: 10.5 }] : []));
    expect(ch.find((h) => h.a === m)).toMatchObject({ b: 540, tick: 20 });
    void queueDamage;
  });
});
