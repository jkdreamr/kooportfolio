export const PONG_CUPS = [
  { x: 0, z: -1.5 },
  { x: -0.24, z: -1.96 },
  { x: 0.24, z: -1.96 },
  { x: -0.48, z: -2.42 },
  { x: 0, z: -2.42 },
  { x: 0.48, z: -2.42 },
] as const;
export type Pong = {
  phase: "ready" | "flying" | "over";
  cups: number[];
  shots: number;
  aim: number;
  landing: { x: number; z: number };
  message: string;
};
export const newPong = (): Pong => ({
  phase: "ready",
  cups: [0, 1, 2, 3, 4, 5],
  shots: 0,
  aim: 0,
  landing: { x: 0, z: 0 },
  message: "Six cups. Ten throws.",
});
export const pongDepth = (power: number) =>
  -1.1 - Math.max(0, Math.min(1, power)) * 1.6;
type Action =
  | { type: "aim"; x: number }
  | { type: "throw"; power: number }
  | { type: "settle" }
  | { type: "reset" };
export function pongReducer(state: Pong, action: Action): Pong {
  if (action.type === "reset")
    return state.phase !== "flying" ? newPong() : state;
  if (action.type === "aim")
    return state.phase === "ready" && Number.isFinite(action.x)
      ? { ...state, aim: Math.max(-1.2, Math.min(1.2, action.x)) }
      : state;
  if (action.type === "throw")
    return state.phase === "ready" && Number.isFinite(action.power)
      ? {
          ...state,
          phase: "flying",
          landing: { x: state.aim, z: pongDepth(action.power) },
          message: "",
        }
      : state;
  if (action.type === "settle" && state.phase === "flying") {
    const nearest = [...state.cups].sort(
      (a, b) =>
        Math.hypot(
          PONG_CUPS[a].x - state.landing.x,
          PONG_CUPS[a].z - state.landing.z,
        ) -
        Math.hypot(
          PONG_CUPS[b].x - state.landing.x,
          PONG_CUPS[b].z - state.landing.z,
        ),
    )[0];
    const hit =
      nearest !== undefined &&
      Math.hypot(
        PONG_CUPS[nearest].x - state.landing.x,
        PONG_CUPS[nearest].z - state.landing.z,
      ) <= 0.24;
    const cups = hit ? state.cups.filter((id) => id !== nearest) : state.cups;
    const shots = state.shots + 1;
    return {
      ...state,
      cups,
      shots,
      phase: cups.length === 0 || shots === 10 ? "over" : "ready",
      message:
        cups.length === 0
          ? "Rack cleared."
          : shots === 10
            ? `${6 - cups.length} of 6. Another rack?`
            : hit
              ? "Cup down."
              : "Miss.",
    };
  }
  return state;
}
