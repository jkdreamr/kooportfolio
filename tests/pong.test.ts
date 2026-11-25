import { describe, expect, it } from "vitest";
import {
  newPong,
  PONG_CUPS,
  pongPower,
  pongReducer,
  pongSwipe,
  type Pong,
} from "../src/game/core/pong";
function toss(game: Pong, x: number, z: number) {
  game = pongReducer(game, { type: "throw", aim: x, power: pongPower(z) });
  game = pongReducer(game, { type: "settle" });
  return pongReducer(game, { type: "next" });
}
describe("cup pong", () => {
  it("clears each physical cup using its aim and depth", () => {
    let game = newPong();
    for (const cup of PONG_CUPS) game = toss(game, cup.x, cup.z);
    expect(game.cups).toHaveLength(0);
    expect(game.shots).toBe(6);
    expect(game.phase).toBe("over");
    expect(game.message).toBe("Cleared in 6.");
    expect(pongReducer(game, { type: "throw", aim: 0, power: 0.5 })).toBe(game);
  });
  it("separates sinks, rim outs and misses", () => {
    const rim = pongReducer(
      pongReducer(newPong(), {
        type: "throw",
        aim: 0.26,
        power: pongPower(-1.5),
      }),
      { type: "settle" },
    );
    expect(rim.last).toEqual({ result: "rim", cup: 0 });
    expect(rim.cups).toHaveLength(6);
    const miss = pongReducer(
      pongReducer(newPong(), { type: "throw", aim: 1.2, power: 0 }),
      { type: "settle" },
    );
    expect(miss.last).toEqual({ result: "miss", cup: null });
  });
  it("holds the landed result until the next throw is allowed", () => {
    const landed = pongReducer(
      pongReducer(newPong(), { type: "throw", aim: 0, power: pongPower(-1.5) }),
      { type: "settle" },
    );
    expect(landed.phase).toBe("landed");
    expect(pongReducer(landed, { type: "settle" })).toBe(landed);
    expect(pongReducer(landed, { type: "reset" })).toBe(landed);
    expect(pongReducer(landed, { type: "throw", aim: 0, power: 0.5 })).toBe(
      landed,
    );
    expect(pongReducer(landed, { type: "next" }).phase).toBe("ready");
  });
  it("does not hit an empty position twice", () => {
    let game = toss(newPong(), 0, -1.5);
    game = toss(game, 0, -1.5);
    expect(game.cups).toHaveLength(5);
    expect(game.streak).toBe(0);
  });
  it("widens the cup after two sinks in a row and cools off on a miss", () => {
    let game = toss(toss(newPong(), 0, -1.5), -0.24, -1.96);
    expect(game.streak).toBe(2);
    expect(game.message).toBe("On fire.");
    // 0.25 from the cup: a rim out normally, a sink while on fire.
    game = toss(game, 0.24 + 0.25, -1.96);
    expect(game.cups).not.toContain(2);
    game = toss(game, 1.2, -1.1);
    expect(game.streak).toBe(0);
  });
  it("ends after ten misses and starts a clean rack", () => {
    let game = newPong();
    for (let i = 0; i < 10; i++) game = toss(game, 1.2, -1.1);
    expect(game.phase).toBe("over");
    expect(game.shots).toBe(10);
    expect(game.message).toBe("0 of 6.");
    expect(pongReducer(game, { type: "reset" })).toEqual(newPong());
  });
  it("locks throws and reset while a ball is in flight", () => {
    const flying = pongReducer(newPong(), {
      type: "throw",
      aim: 0,
      power: 0.5,
    });
    expect(pongReducer(flying, { type: "throw", aim: 0, power: 0.5 })).toBe(
      flying,
    );
    expect(pongReducer(flying, { type: "reset" })).toBe(flying);
  });
  it("aims a swipe from where it was released", () => {
    expect(pongSwipe(0, -29, 180)).toEqual({ aim: 0, power: 29 / 180 });
    expect(pongSwipe(50, -90, 180)).toEqual({ aim: 0.5, power: 0.5 });
    expect(pongSwipe(-900, 400, 180)).toEqual({ aim: -1.2, power: 0 });
  });
});
