import { sampleDaylight } from "./daylight";

export type SkyStar = {
  x: number;
  y: number;
  radius: number;
  color: string;
  name?: string;
};
export type SkyPattern = {
  name: string;
  stars: SkyStar[];
  lines: [number, number][];
  nebula?: [number, number];
};

/** Hand-plotted, schematic patterns, not a location/date-specific sky prediction. */
export const SKY_PATTERNS: SkyPattern[] = [
  {
    name: "Orion",
    stars: [
      { x: -110, y: -115, radius: 4.2, color: "#ffc49b", name: "Betelgeuse" },
      { x: 83, y: -127, radius: 3.2, color: "#d0e6ff", name: "Bellatrix" },
      { x: -43, y: 12, radius: 2.8, color: "#d7e8ff", name: "Alnitak" },
      { x: 0, y: 0, radius: 3.2, color: "#d7e8ff", name: "Alnilam" },
      { x: 43, y: -12, radius: 2.7, color: "#d7e8ff", name: "Mintaka" },
      { x: -92, y: 137, radius: 3, color: "#d2e6ff", name: "Saiph" },
      { x: 116, y: 117, radius: 4.7, color: "#d0e4ff", name: "Rigel" },
      { x: -4, y: -182, radius: 2, color: "#d7e8ff", name: "Meissa" },
      { x: -10, y: 67, radius: 1.9, color: "#ebdce9" },
    ],
    lines: [
      [7, 0],
      [7, 1],
      [0, 2],
      [1, 4],
      [2, 3],
      [3, 4],
      [2, 5],
      [4, 6],
      [5, 6],
      [3, 8],
    ],
    nebula: [-10, 67],
  },
  {
    name: "Cassiopeia",
    stars: [
      { x: -174, y: -60, radius: 3, color: "#d6e7ff", name: "Caph" },
      { x: -90, y: 64, radius: 3.8, color: "#f6cf9c", name: "Schedar" },
      { x: 0, y: -30, radius: 3.8, color: "#d6e7ff", name: "Navi" },
      { x: 84, y: 66, radius: 3.1, color: "#e5ecff", name: "Ruchbah" },
      { x: 173, y: -91, radius: 2.7, color: "#d6e7ff", name: "Segin" },
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  },
  {
    name: "Big Dipper",
    stars: [
      { x: -198, y: -54, radius: 3.1, color: "#d7e8ff", name: "Alkaid" },
      { x: -113, y: -15, radius: 3.2, color: "#e6edff", name: "Mizar" },
      { x: -32, y: 39, radius: 3.7, color: "#e5ecff", name: "Alioth" },
      { x: 43, y: 72, radius: 2.4, color: "#e5ecff", name: "Megrez" },
      { x: 146, y: 64, radius: 3.8, color: "#ffd4a2", name: "Dubhe" },
      { x: 155, y: -40, radius: 3.1, color: "#d7e8ff", name: "Merak" },
      { x: 58, y: -49, radius: 3.4, color: "#d7e8ff", name: "Phecda" },
      { x: -103, y: -25, radius: 1.5, color: "#e6edff", name: "Alcor" },
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 3],
    ],
  },
];

export function starsVisible(hour: number) {
  return Number.isFinite(hour) && sampleDaylight(hour).night > 0.5;
}

export const MIN_ZOOM = 0.8;
export const MAX_ZOOM = 2.4;
export const PAN_LIMIT = 300;
export const clampPan = (value: number) =>
  Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, value));
export const clampZoom = (value: number) =>
  Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));

/** Fixed seed: the field stays still when aiming, zooming or changing daylight. */
export function makeStarField(seed: number, count = 430): SkyStar[] {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    x: (random() - 0.5) * 1500,
    y: (random() - 0.5) * 1500,
    radius: 0.5 + random() ** 4 * 1.6,
    color: random() > 0.85 ? "#e8caa5" : "#d0deef",
  }));
}
