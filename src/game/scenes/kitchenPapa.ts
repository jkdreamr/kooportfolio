export type Topping =
  | "lettuce"
  | "tomato"
  | "cheese"
  | "onion"
  | "pickle"
  | "sauce"
  | "top";
export type Ticket = {
  id: number;
  name: string;
  toppings: Topping[];
  doneness: "medium" | "well";
  waited: number;
};
export type Layer = { ingredient: Topping; offset: number };
export type WorkOrder = {
  ticket: Ticket;
  stage: "grill" | "build";
  onGrill: boolean;
  slot: number | null;
  flipped: boolean;
  sideTime: number;
  firstSide: number;
  grillScore: number;
  layers: Layer[];
};
export type Grade = {
  name: string;
  wait: number;
  grill: number;
  build: number;
  total: number;
  tip: number;
};
export type PapaGame = {
  run: number;
  day: number;
  unlockedDay: number;
  phase: "idle" | "service" | "grade" | "results";
  station: "orders" | "grill" | "build";
  remaining: number;
  arrival: number;
  nextId: number;
  queue: Ticket[];
  orders: WorkOrder[];
  selected: number | null;
  grade: Grade | null;
  served: number;
  tips: number;
  score: number;
  combo: number;
  missed: number;
  burners: number;
};
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
export const names = ["Sam", "Jules", "Max", "Ari", "Leo", "Kai"];
export const TOPPINGS: Topping[] = [
  "lettuce",
  "tomato",
  "cheese",
  "onion",
  "pickle",
  "sauce",
];
export const ingredientName = (t: Topping) =>
  t === "top" ? "Top bun" : t[0].toUpperCase() + t.slice(1);
export function makeTicket(id: number, day = 1): Ticket {
  const sets: Topping[][] = [
    ["lettuce", "tomato", "top"],
    ["cheese", "pickle", "top"],
    ["cheese", "onion", "sauce", "top"],
    ["lettuce", "cheese", "tomato", "top"],
  ];
  const toppings = [...sets[id % sets.length]];
  if (day > 1 && id % 2 === 0) toppings.splice(toppings.length - 1, 0, "sauce");
  return {
    id,
    name: names[id % names.length],
    toppings,
    doneness: id % 3 === 1 ? "well" : "medium",
    waited: 0,
  };
}
export const cookTarget = (ticket: Ticket) =>
  ticket.doneness === "well" ? 5.4 : 3.8;
export const dayGoal = (day: number) => Math.min(6, day + 3);
export const shiftPassed = (game: PapaGame) =>
  game.served >= dayGoal(game.day) && game.score / game.served >= 80;
export const selectedOrder = (game: PapaGame) =>
  game.orders.find((o) => o.ticket.id === game.selected);
const freshOrder = (ticket: Ticket): WorkOrder => ({
  ticket,
  stage: "grill",
  onGrill: false,
  slot: null,
  flipped: false,
  sideTime: 0,
  firstSide: 0,
  grillScore: 0,
  layers: [],
});
export function newPapaGame(run = 0, day = 1, burners = 1): PapaGame {
  return {
    run,
    day,
    unlockedDay: day,
    phase: "idle",
    station: "orders",
    remaining: 120,
    arrival: 12,
    nextId: 2,
    queue: [makeTicket(0, day), makeTicket(1, day)],
    orders: [],
    selected: null,
    grade: null,
    served: 0,
    tips: 0,
    score: 0,
    combo: 0,
    missed: 0,
    burners,
  };
}
export type PapaAction =
  | { type: "start"; nextDay?: boolean; burners?: number }
  | { type: "stop" }
  | { type: "tick"; dt: number }
  | { type: "station"; station: PapaGame["station"] }
  | { type: "take" | "select"; id: number }
  | { type: "drop" | "flip" | "lift" | "bin" | "serve" | "next" | "undo" }
  | { type: "layer"; ingredient: Topping; offset: number };
export function gradeBurger(order: WorkOrder): Grade {
  const wanted = order.ticket.toppings;
  const matches = wanted.filter(
    (ingredient, i) => order.layers[i]?.ingredient === ingredient,
  ).length;
  const accuracy = matches / Math.max(wanted.length, order.layers.length);
  const placement = order.layers.length
    ? order.layers.reduce(
        (n, layer) => n + Math.max(0, 1 - Math.abs(layer.offset) / 0.65),
        0,
      ) / order.layers.length
    : 0;
  const build = clamp(accuracy * 80 + placement * 20);
  const wait = clamp(110 - order.ticket.waited * 1.1);
  const grill = clamp(order.grillScore);
  const total = clamp(wait * 0.2 + grill * 0.4 + build * 0.4);
  return {
    name: order.ticket.name,
    wait,
    grill,
    build,
    total,
    tip: Math.max(0, Math.round((total - 40) / 9)),
  };
}
export function papaReducer(game: PapaGame, action: PapaAction): PapaGame {
  if (action.type === "start") {
    if (action.nextDay && (game.phase !== "results" || !shiftPassed(game)))
      return game;
    return {
      ...newPapaGame(
        game.run + 1,
        action.nextDay ? game.day + 1 : game.unlockedDay,
        action.burners ?? game.burners,
      ),
      phase: "service",
    };
  }
  if (action.type === "stop")
    return {
      ...game,
      phase: "idle",
      orders: game.orders.map((o) => ({ ...o, onGrill: false })),
    };
  if (game.phase === "idle" || game.phase === "results") return game;
  if (action.type === "tick") {
    if (!Number.isFinite(action.dt) || action.dt <= 0) return game;
    const dt = Math.min(action.dt, 1);
    const expired = game.queue.filter((order) => order.waited + dt >= 62);
    const remaining = Math.max(0, game.remaining - dt);
    const queue =
      remaining > 0
        ? game.queue
            .filter((order) => order.waited + dt < 62)
            .map((order) => ({ ...order, waited: order.waited + dt }))
        : [];
    let arrival = game.arrival - dt,
      nextId = game.nextId;
    if (
      remaining > 0 &&
      arrival <= 0 &&
      queue.length < 3 &&
      game.served + game.orders.length + queue.length < dayGoal(game.day)
    ) {
      queue.push(makeTicket(nextId++, game.day));
      arrival = 12;
    }
    const orders = game.orders.map((order) => ({
      ...order,
      ticket: { ...order.ticket, waited: order.ticket.waited + dt },
      sideTime: order.sideTime + (order.onGrill ? dt : 0),
    }));
    return {
      ...game,
      remaining,
      arrival,
      queue,
      nextId,
      orders,
      missed: game.missed + expired.length,
      combo: expired.length ? 0 : game.combo,
      phase:
        remaining === 0 && !orders.length && game.phase === "service"
          ? "results"
          : game.phase,
    };
  }
  if (action.type === "next" && game.phase === "grade")
    return {
      ...game,
      grade: null,
      phase:
        game.served >= dayGoal(game.day) ||
        (game.remaining === 0 && !game.orders.length)
          ? "results"
          : "service",
      station: "orders",
    };
  if (game.phase !== "service") return game;
  if (action.type === "station") return { ...game, station: action.station };
  if (
    action.type === "select" &&
    game.orders.some((o) => o.ticket.id === action.id)
  )
    return { ...game, selected: action.id };
  if (action.type === "take" && game.orders.length < 3) {
    const ticket = game.queue.find((o) => o.id === action.id);
    return ticket
      ? {
          ...game,
          orders: [...game.orders, freshOrder(ticket)],
          selected: ticket.id,
          queue: game.queue.filter((o) => o.id !== ticket.id),
          station: "grill",
        }
      : game;
  }
  const order = selectedOrder(game);
  if (!order) return game;
  const update = (
    patch: Partial<WorkOrder>,
    extra: Partial<PapaGame> = {},
  ) => ({
    ...game,
    ...extra,
    orders: game.orders.map((o) => (o === order ? { ...o, ...patch } : o)),
  });
  const freeSlot = Array.from({ length: game.burners }, (_, i) => i).find(
    (slot) => !game.orders.some((o) => o.onGrill && o.slot === slot),
  );
  if (
    action.type === "drop" &&
    order.stage === "grill" &&
    !order.onGrill &&
    freeSlot !== undefined
  )
    return update({
      onGrill: true,
      slot: freeSlot,
      flipped: false,
      sideTime: 0,
      firstSide: 0,
    });
  if (action.type === "flip" && order.onGrill && !order.flipped)
    return update({ flipped: true, firstSide: order.sideTime, sideTime: 0 });
  if (action.type === "lift" && order.onGrill && order.flipped) {
    const target = cookTarget(order.ticket);
    return update(
      {
        stage: "build",
        onGrill: false,
        slot: null,
        grillScore: clamp(
          100 -
            (Math.abs(order.firstSide - target) +
              Math.abs(order.sideTime - target)) *
              14,
        ),
        layers: [],
      },
      { station: "build" },
    );
  }
  if (action.type === "bin")
    return update(
      { ...freshOrder(order.ticket) },
      { combo: 0, station: "grill" },
    );
  if (
    action.type === "layer" &&
    order.stage === "build" &&
    order.layers.length < 10 &&
    [...TOPPINGS, "top"].includes(action.ingredient) &&
    Number.isFinite(action.offset) &&
    order.layers.at(-1)?.ingredient !== "top"
  )
    return update({
      layers: [
        ...order.layers,
        {
          ingredient: action.ingredient,
          offset: Math.max(-0.8, Math.min(0.8, action.offset)),
        },
      ],
    });
  if (action.type === "undo" && order.stage === "build")
    return update({ layers: order.layers.slice(0, -1) });
  if (
    action.type === "serve" &&
    order.stage === "build" &&
    order.layers.at(-1)?.ingredient === "top"
  ) {
    const grade = gradeBurger(order),
      combo = grade.total >= 85 ? game.combo + 1 : 0,
      tip = grade.tip + Math.max(0, combo - 1);
    const orders = game.orders.filter((o) => o !== order),
      served = game.served + 1,
      score = game.score + grade.total;
    return {
      ...game,
      phase: "grade",
      station: "orders",
      grade: { ...grade, tip },
      orders,
      selected: orders[0]?.ticket.id ?? null,
      served,
      score,
      unlockedDay: shiftPassed({ ...game, served, score })
        ? Math.max(game.unlockedDay, game.day + 1)
        : game.unlockedDay,
      tips: game.tips + tip,
      combo,
    };
  }
  return game;
}
