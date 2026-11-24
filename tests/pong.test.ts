import { describe, expect, it } from "vitest";
import {
  newPong,
  PONG_CUPS,
  pongReducer,
  type Pong,
} from "../src/game/core/pong";
function toss(game: Pong, x: number, z: number) {
  game = pongReducer(game, { type: "aim", x });
  game = pongReducer(game, { type: "throw", power: (-z - 1.1) / 1.6 });
  return pongReducer(game, { type: "settle" });
}
describe("cup pong", () => {
  it("clears each physical cup using its aim and depth", () => {
    let game = newPong();
    for (const cup of PONG_CUPS) game = toss(game, cup.x, cup.z);
    expect(game.cups).toHaveLength(0);
    expect(game.shots).toBe(6);
    expect(game.phase).toBe("over");
    expect(pongReducer(game, { type: "throw", power: 0.5 })).toBe(game);
  });
  it("does not hit an empty position twice or settle a throw twice", () => {
    let game = toss(newPong(), 0, -1.5);
    expect(pongReducer(game, { type: "settle" })).toBe(game);
    game = toss(game, 0, -1.5);
    expect(game.cups).toHaveLength(5);
    expect(game.message).toBe("Miss.");
  });
  it("ends after ten misses and starts a clean rack", () => {
    let game = newPong();
    for (let i = 0; i < 10; i++) game = toss(game, 1.2, -1.5);
    expect(game.phase).toBe("over");
    expect(game.shots).toBe(10);
    expect(pongReducer(game, { type: "reset" })).toEqual(newPong());
  });
  it("locks aim, reset and repeated throws while a ball is in flight", () => {
    const flying = pongReducer(newPong(), { type: "throw", power: 0.5 });
    expect(pongReducer(flying, { type: "throw", power: 0.5 })).toBe(flying);
    expect(pongReducer(flying, { type: "aim", x: 1 })).toBe(flying);
    expect(pongReducer(flying, { type: "reset" })).toBe(flying);
  });
});
