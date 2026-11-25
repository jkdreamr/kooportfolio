export const PONG_CUPS = [
  { x: 0, z: -1.5 },
  { x: -0.24, z: -1.96 },
  { x: 0.24, z: -1.96 },
  { x: -0.48, z: -2.42 },
  { x: 0, z: -2.42 },
  { x: 0.48, z: -2.42 },
] as const;
export const PONG_THROWS = 10;
export const PONG_AIM = 1.2;
export const PONG_SINK = 0.21;
export const PONG_SINK_ON_FIRE = 0.27;
export const PONG_RIM = 0.31;
export type PongResult = "cup" | "rim" | "miss";
export type Pong = {
  phase: "ready" | "flying" | "landed" | "over";
  cups: number[];
  shots: number;
  streak: number;
  landing: { x: number; z: number };
  last: { result: PongResult; cup: number | null } | null;
  message: string;
};
export const newPong = (): Pong => ({
  phase: "ready",
  cups: [0, 1, 2, 3, 4, 5],
  shots: 0,
  streak: 0,
  landing: { x: 0, z: 0 },
  last: null,
  message: "",
});
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
export const pongDepth = (power: number) => -1.1 - clamp(power, 0, 1) * 1.6;
export const pongPower = (z: number) => clamp((-z - 1.1) / 1.6, 0, 1);
export const onFire = (game: Pong) => game.streak >= 2;
// dx/dy are the pointer's travel in px; up is negative dy.
export const pongSwipe = (dx: number, dy: number, size: number) => ({
  aim: clamp((dx / size) * 1.8, -PONG_AIM, PONG_AIM),
  power: clamp(-dy / size, 0, 1),
});
type Action =
  | { type: "throw"; aim: number; power: number }
  | { type: "settle" }
  | { type: "next" }
  | { type: "reset" };
export function pongReducer(state: Pong, action: Action): Pong {
  if (action.type === "reset")
    return state.phase === "ready" || state.phase === "over"
      ? newPong()
      : state;
  if (action.type === "throw")
    return state.phase === "ready" &&
      Number.isFinite(action.aim) &&
      Number.isFinite(action.power)
      ? {
          ...state,
          phase: "flying",
          landing: {
            x: clamp(action.aim, -PONG_AIM, PONG_AIM),
            z: pongDepth(action.power),
          },
          last: null,
          message: "",
        }
      : state;
  if (action.type === "next" && state.phase === "landed") {
    const done = state.cups.length === 0 || state.shots >= PONG_THROWS;
    return {
      ...state,
      phase: done ? "over" : "ready",
      message:
        state.cups.length === 0
          ? `Cleared in ${state.shots}.`
          : done
            ? `${6 - state.cups.length} of 6.`
            : state.message,
    };
  }
  if (action.type === "settle" && state.phase === "flying") {
    const distance = (id: number) =>
      Math.hypot(
        PONG_CUPS[id].x - state.landing.x,
        PONG_CUPS[id].z - state.landing.z,
      );
    const nearest = [...state.cups].sort(
      (a, b) => distance(a) - distance(b),
    )[0];
    const gap = nearest === undefined ? Infinity : distance(nearest);
    const result: PongResult =
      gap <= (onFire(state) ? PONG_SINK_ON_FIRE : PONG_SINK)
        ? "cup"
        : gap <= PONG_RIM
          ? "rim"
          : "miss";
    const streak = result === "cup" ? state.streak + 1 : 0;
    return {
      ...state,
      phase: "landed",
      cups:
        result === "cup"
          ? state.cups.filter((id) => id !== nearest)
          : state.cups,
      shots: state.shots + 1,
      streak,
      last: { result, cup: result === "miss" ? null : nearest },
      message:
        result === "cup"
          ? streak === 2
            ? "On fire."
            : ""
          : result === "rim"
            ? "Rim."
            : "",
    };
  }
  return state;
}
export const PONG_BEST_KEY = "joshua-exe-pong-best";
export function readPongBest(storage?: Pick<Storage, "getItem">) {
  try {
    const value = Number((storage ?? localStorage).getItem(PONG_BEST_KEY));
    return Number.isInteger(value) && value >= 6 && value <= PONG_THROWS
      ? value
      : null;
  } catch {
    return null;
  }
}
export function savePongBest(
  shots: number,
  storage?: Pick<Storage, "getItem" | "setItem">,
) {
  const best = readPongBest(storage);
  if (best !== null && best <= shots) return best;
  try {
    (storage ?? localStorage).setItem(PONG_BEST_KEY, String(shots));
  } catch {
    /* Best score is optional. */
  }
  return shots;
}
