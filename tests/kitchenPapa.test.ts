import { describe, expect, it } from "vitest";
import {
  cookTarget,
  dayGoal,
  gradeBurger,
  newPapaGame,
  papaReducer,
  selectedOrder,
  shiftPassed,
  type PapaGame,
  type Topping,
} from "../src/game/scenes/kitchenPapa";

const act = papaReducer;
const start = (burners = 2) =>
  act(newPapaGame(0, 1, burners), { type: "start" });
function tick(game: PapaGame, seconds: number) {
  for (let left = seconds; left > 0.00001; left -= 0.1)
    game = act(game, { type: "tick", dt: Math.min(0.1, left) });
  return game;
}
function cooked() {
  let game = act(start(), { type: "take", id: 0 });
  const target = cookTarget(selectedOrder(game)!.ticket);
  game = act(game, { type: "drop" });
  game = act(tick(game, target), { type: "flip" });
  return act(tick(game, target), { type: "lift" });
}
function build(
  game: PapaGame,
  ingredients: Topping[] = selectedOrder(game)!.ticket.toppings,
  offset = 0,
) {
  for (const ingredient of ingredients)
    game = act(game, { type: "layer", ingredient, offset });
  return game;
}

describe("Papa-style kitchen service", () => {
  it("keeps an earned next day after Back to room without paying the tip again", () => {
    const ready = { ...build(cooked()), served: 3, score: 270, tips: 18 };
    const passed = act(ready, { type: "serve" });
    expect(passed.unlockedDay).toBe(2);
    const closed = act(passed, { type: "stop" });
    expect(closed.tips).toBe(passed.tips);
    const reopened = act(closed, { type: "start" });
    expect(reopened).toMatchObject({
      day: 2,
      unlockedDay: 2,
      phase: "service",
      tips: 0,
    });
  });

  it("requires explicit play and a real top bun before serving", () => {
    const idle = newPapaGame();
    expect(act(idle, { type: "tick", dt: 1 })).toBe(idle);
    const game = cooked();
    expect(act(game, { type: "serve" })).toBe(game);
    expect(game.tips).toBe(0);
  });

  it("grades both cooked faces, requested stack order and centering, then banks a tip once", () => {
    const game = build(cooked());
    expect(gradeBurger(selectedOrder(game)!)).toMatchObject({
      wait: 100,
      grill: 100,
      build: 100,
      total: 100,
    });
    const served = act(game, { type: "serve" });
    expect(served.served).toBe(1);
    expect(served.tips).toBe(7);
    expect(served.orders).toHaveLength(0);
    expect(act(served, { type: "serve" })).toBe(served);
    expect(act(served, { type: "stop" }).tips).toBe(7);
  });

  it("cooks two patties independently while taking and switching tickets", () => {
    let game = act(start(), { type: "take", id: 0 });
    game = act(game, { type: "drop" });
    game = act(tick(game, 2), { type: "take", id: 1 });
    game = act(game, { type: "drop" });
    game = tick(game, 1);
    expect(game.orders[0].sideTime).toBeCloseTo(3);
    expect(game.orders[1].sideTime).toBeCloseTo(1);
    expect(game.orders.map((order) => order.slot)).toEqual([0, 1]);
    game = act(game, { type: "select", id: 0 });
    game = act(game, { type: "flip" });
    game = act(tick(game, 1), { type: "lift" });
    expect(game.orders[0].stage).toBe("build");
    expect(game.orders[1]).toMatchObject({ onGrill: true, slot: 1 });
    expect(game.orders[1].sideTime).toBeCloseTo(2);
  });

  it("does not put a third patty into an occupied two-slot grill", () => {
    let game = act(start(), { type: "take", id: 0 });
    game = act(game, { type: "drop" });
    game = act(game, { type: "take", id: 1 });
    game = act(game, { type: "drop" });
    game = act(tick(game, 12.1), { type: "take", id: 2 });
    const full = act(game, { type: "drop" });
    expect(full).toBe(game);
    expect(selectedOrder(full)?.onGrill).toBe(false);
    expect(full.orders.filter((order) => order.onGrill)).toHaveLength(2);
  });

  it("fits one patty per kitchen burner", () => {
    const fill = (burners: number) => {
      let game = start(burners);
      for (const id of [0, 1, 2]) {
        if (id === 2) game = tick(game, 12.1);
        game = act(game, { type: "take", id });
        game = act(game, { type: "drop" });
      }
      return game.orders.filter((order) => order.onGrill).map((o) => o.slot);
    };
    expect(fill(1)).toEqual([0]);
    expect(fill(2)).toEqual([0, 1]);
    expect(fill(3)).toEqual([0, 1, 2]);
  });

  it("penalizes rushed, uneven and burnt patties, with a usable bin/retry", () => {
    let game = act(start(), { type: "take", id: 0 });
    game = act(game, { type: "drop" });
    game = act(tick(game, 3.8), { type: "flip" });
    game = act(game, { type: "lift" });
    expect(selectedOrder(game)?.grillScore).toBeLessThan(50);
    const waited = selectedOrder(game)!.ticket.waited;
    game = act(game, { type: "bin" });
    expect(selectedOrder(game)).toMatchObject({
      stage: "grill",
      onGrill: false,
      layers: [],
      ticket: { waited },
    });
    game = act(game, { type: "drop" });
    game = act(tick(game, 12), { type: "flip" });
    game = act(tick(game, 12), { type: "lift" });
    expect(selectedOrder(game)?.grillScore).toBe(0);
  });

  it("scores incorrect ingredients and off-center drops below the requested centered stack", () => {
    const base = cooked();
    const good = gradeBurger(selectedOrder(build(base))!);
    const wrong = gradeBurger(
      selectedOrder(build(base, ["onion", "cheese", "top"], 0.8))!,
    );
    const crooked = gradeBurger(selectedOrder(build(base, undefined, 0.65))!);
    expect(good.build).toBe(100);
    expect(wrong.build).toBeLessThan(30);
    expect(crooked.build).toBe(80);
    expect(wrong.total).toBeLessThan(80);
  });

  it("locks a topped burger until undo, and ignores invalid placements", () => {
    const ready = build(cooked());
    expect(act(ready, { type: "layer", ingredient: "onion", offset: 0 })).toBe(
      ready,
    );
    const undone = act(ready, { type: "undo" });
    expect(selectedOrder(undone)!.layers.at(-1)?.ingredient).not.toBe("top");
    expect(act(undone, { type: "layer", ingredient: "top", offset: NaN })).toBe(
      undone,
    );
  });

  it("lets impatient waiting customers leave once and keeps accepted orders cookable", () => {
    let game = act(start(), { type: "take", id: 0 });
    game = tick(game, 62.1);
    expect(game.missed).toBe(1);
    expect(game.orders[0].ticket.waited).toBeCloseTo(62.1);
    const missed = game.missed;
    game = tick(game, 1);
    expect(game.missed).toBe(missed);
    expect(act(game, { type: "drop" }).orders[0].onGrill).toBe(true);
  });

  it("does not award anything or advance clocks when an unfinished kitchen is closed", () => {
    let game = act(start(), { type: "take", id: 0 });
    game = act(game, { type: "drop" });
    game = act(tick(game, 1), { type: "stop" });
    expect(game.tips).toBe(0);
    expect(game.orders[0].onGrill).toBe(false);
    expect(act(game, { type: "tick", dt: 1 })).toBe(game);
  });

  it("ends an empty timed-out shift and retries without advancing the day", () => {
    const failed = tick(start(), 121);
    expect(failed.phase).toBe("results");
    expect(shiftPassed(failed)).toBe(false);
    expect(act(failed, { type: "start", nextDay: true })).toBe(failed);
    expect(act(failed, { type: "start" })).toMatchObject({
      phase: "service",
      day: 1,
      tips: 0,
      served: 0,
    });
  });

  it("unlocks a harder next shift only after the goal and grade threshold", () => {
    const completed: PapaGame = {
      ...start(),
      phase: "results",
      served: 4,
      score: 360,
    };
    expect(shiftPassed(completed)).toBe(true);
    const next = act(completed, { type: "start", nextDay: true });
    expect(next.day).toBe(2);
    expect(dayGoal(next.day)).toBe(5);
    expect(next.queue[0].toppings).toContain("sauce");
    expect(next.run).toBe(completed.run + 1);
    expect(
      act({ ...completed, score: 280 }, { type: "start", nextDay: true }).day,
    ).toBe(1);
  });
});
