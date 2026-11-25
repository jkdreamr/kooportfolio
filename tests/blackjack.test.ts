import { describe, expect, it } from "vitest";
import {
  blackjackReducer,
  handValue,
  newBlackjack,
  shuffledDeck,
  type Card,
} from "../src/game/core/blackjack";
const cards = (...ranks: number[]): Card[] =>
  ranks.map((rank) => ({ rank, suit: "♠" }));
const deal = (...ranks: number[]) =>
  blackjackReducer(newBlackjack(), { type: "deal", deck: cards(...ranks) });
describe("blackjack", () => {
  it("values aces flexibly and face cards at ten", () => {
    expect(handValue(cards(1, 1, 9))).toBe(21);
    expect(handValue(cards(1, 13, 5))).toBe(16);
    expect(
      new Set(shuffledDeck().map((card) => `${card.rank}${card.suit}`)).size,
    ).toBe(52);
  });
  it("deducts a valid bet once and prevents mid-hand wager/deal/refill", () => {
    const state = deal(10, 8, 7, 9, 2);
    expect(state.bank).toBe(90);
    for (const action of [
      { type: "wager", amount: -10 },
      { type: "wager", amount: 50 },
      { type: "deal", deck: cards(1, 2, 3, 4) },
      { type: "refill" },
    ] as const)
      expect(blackjackReducer(state, action)).toBe(state);
  });
  it("pays natural blackjack at 3:2, pushes double naturals and loses to dealer natural", () => {
    expect(deal(1, 9, 13, 8).bank).toBe(115);
    expect(deal(1, 1, 13, 12).bank).toBe(100);
    expect(deal(10, 1, 8, 13).bank).toBe(90);
  });
  it("busts on hit and ignores repeated actions after settlement", () => {
    const state = blackjackReducer(deal(10, 9, 8, 7, 5), { type: "hit" });
    expect(state.result).toBe("lose");
    expect(state.bank).toBe(90);
    expect(blackjackReducer(state, { type: "dealer" })).toBe(state);
    expect(blackjackReducer(state, { type: "hit" })).toBe(state);
  });
  it("runs the dealer to seventeen and settles a bust or push exactly once", () => {
    let state = blackjackReducer(deal(10, 9, 8, 6, 10), { type: "stand" });
    state = blackjackReducer(state, { type: "dealer" });
    state = blackjackReducer(state, { type: "dealer" });
    expect(state.result).toBe("win");
    expect(state.bank).toBe(110);
    expect(blackjackReducer(state, { type: "dealer" })).toBe(state);
    let push = blackjackReducer(deal(10, 10, 8, 8), { type: "stand" });
    push = blackjackReducer(push, { type: "dealer" });
    expect(push.bank).toBe(100);
  });
  it("only refills a broke practice bank and refuses unaffordable bets", () => {
    const broke = { ...newBlackjack(), bank: 0 };
    expect(
      blackjackReducer(broke, { type: "deal", deck: cards(1, 2, 3, 4) }),
    ).toBe(broke);
    expect(blackjackReducer(broke, { type: "refill" }).bank).toBe(100);
    expect(blackjackReducer(newBlackjack(), { type: "refill" }).bank).toBe(100);
  });
  it("doubles once on two cards for one card, then pays the doubled stake", () => {
    let state = deal(5, 10, 6, 7, 10, 9);
    expect(state.bank).toBe(90);
    state = blackjackReducer(state, { type: "double" });
    expect(state.bank).toBe(80);
    expect(state.stake).toBe(20);
    expect(state.player).toHaveLength(3);
    expect(state.phase).toBe("dealer");
    expect(blackjackReducer(state, { type: "double" })).toBe(state);
    state = blackjackReducer(state, { type: "dealer" });
    state = blackjackReducer(state, { type: "dealer" });
    expect(state.result).toBe("win");
    expect(state.bank).toBe(120);
    expect(state.bet).toBe(10);
    const hit = blackjackReducer(deal(5, 10, 6, 7, 2, 9), { type: "hit" });
    expect(blackjackReducer(hit, { type: "double" })).toBe(hit);
    const bust = blackjackReducer(deal(10, 10, 6, 7, 10), { type: "double" });
    expect(bust.result).toBe("lose");
    expect(bust.bank).toBe(80);
  });
});
