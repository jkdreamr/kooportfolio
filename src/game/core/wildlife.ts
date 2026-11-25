import { sampleDaylight } from "./daylight";
import { POND } from "./pond";
import { sampleWeather } from "./weather";
import type { WorldId } from "./worlds";

type Point = readonly [number, number];
export const HOME_ANIMALS: readonly Animal[] = [
  {
    kind: "dog",
    route: [
      [0, 7],
      [2, 7],
      [2, 2],
      [0, 2],
    ],
    speed: 0.9,
    rest: 2.5,
    offset: 0,
    color: "#bd824a",
  },
  {
    kind: "cat",
    route: [
      [-29, -4],
      [-24, -3],
      [-17, -3],
      [-24, -4],
    ],
    speed: 0.65,
    rest: 3,
    offset: 4,
    color: "#dba962",
  },
];
const DUCK_ROUTE: readonly Point[] = [
  [POND.x - 3, POND.z],
  [POND.x, POND.z - 2],
  [POND.x + 4, POND.z],
  [POND.x, POND.z + 2],
];
export type AnimalKind = "rabbit" | "cat" | "dog" | "duck";
export type Animal = {
  kind: AnimalKind;
  route: readonly Point[];
  speed: number;
  rest: number;
  offset: number;
  color: string;
};

// Hand-placed lawn circuits stay away from doors, courts and planted beds.
export const ANIMALS: readonly Animal[] = [
  {
    kind: "dog",
    route: [
      [5, 3],
      [10, 2],
      [12, -2],
      [7, -5],
    ],
    speed: 0.9,
    rest: 2.5,
    offset: 0,
    color: "#bd824a",
  },
  {
    kind: "cat",
    route: [
      [-10, -4],
      [-9, 1],
      [-13, 2],
      [-15, -2],
    ],
    speed: 0.65,
    rest: 3,
    offset: 4,
    color: "#dba962",
  },
  {
    kind: "cat",
    route: [
      [17, 6],
      [17, 9],
      [13, 9],
      [13, 6],
    ],
    speed: 0.6,
    rest: 4,
    offset: 9,
    color: "#727c83",
  },
  {
    kind: "rabbit",
    route: [
      [-15, 18],
      [-12, 20],
      [-14, 23],
      [-16, 21],
    ],
    speed: 0.95,
    rest: 2,
    offset: 1,
    color: "#ede0bb",
  },
  {
    kind: "rabbit",
    route: [
      [-11, 5],
      [-7, 6],
      [-6, 8],
      [-10, 7],
    ],
    speed: 1.1,
    rest: 3,
    offset: 6,
    color: "#b5a28a",
  },
  {
    kind: "rabbit",
    route: [
      [10, -10],
      [8, -13],
      [5, -11],
      [7, -8],
    ],
    speed: 1,
    rest: 2.5,
    offset: 11,
    color: "#f1e8cf",
  },
  {
    kind: "duck",
    route: DUCK_ROUTE,
    speed: 0.55,
    rest: 0,
    offset: 0,
    color: "#eee3c5",
  },
  {
    kind: "duck",
    route: DUCK_ROUTE,
    speed: 0.55,
    rest: 0,
    offset: 2,
    color: "#765a3e",
  },
  {
    kind: "duck",
    route: DUCK_ROUTE,
    speed: 0.55,
    rest: 0,
    offset: 4,
    color: "#c6aa70",
  },
];

// Keep the existing animals on the compact Stanford parcels, not the removed lawn.
const stanfordOffsets = [
  [-8, 8],
  [12, 8],
  [-3, 16],
  [0, 0],
  [0, 11],
  [-11, 19],
];
const stanfordAnimals = ANIMALS.map((animal, i): Animal => {
  const [dx, dz] = stanfordOffsets[i] ?? [0, 0];
  return { ...animal, route: animal.route.map(([x, z]) => [x + dx, z + dz]) };
});
export const animalsInWorld = (world: WorldId) =>
  world === "home"
    ? HOME_ANIMALS
    : world === "stanford"
      ? stanfordAnimals
      : ANIMALS;

/** Constant-speed legs with a sniff/graze at each waypoint; loops without teleporting. */
export function animalPose(animal: Animal, seconds: number) {
  const durations = animal.route.map((from, i) => {
    const to = animal.route[(i + 1) % animal.route.length];
    return Math.hypot(to[0] - from[0], to[1] - from[1]) / animal.speed;
  });
  const cycle = durations.reduce(
    (sum, duration) => sum + duration + animal.rest,
    0,
  );
  let t = (((seconds + animal.offset) % cycle) + cycle) % cycle;
  for (let i = 0; i < animal.route.length; i++) {
    const duration = durations[i];
    if (t <= duration + animal.rest || i === animal.route.length - 1) {
      const from = animal.route[i],
        to = animal.route[(i + 1) % animal.route.length];
      const progress = Math.min(t / duration, 1);
      return {
        x: from[0] + (to[0] - from[0]) * progress,
        z: from[1] + (to[1] - from[1]) * progress,
        heading: Math.atan2(to[0] - from[0], to[1] - from[1]),
        moving: t < duration,
      };
    }
    t -= duration + animal.rest;
  }
  throw new Error("An animal needs a nonempty route");
}

export function birdPose(seconds: number, index: number) {
  const t = seconds * 0.13 + index * 0.12;
  return {
    x: Math.sin(t) * 21 + Math.sin(index * 2.4) * 1.8,
    y: 9 + Math.sin(t * 1.7 + index) * 0.7 + index * 0.15,
    z: Math.cos(t) * 14 + index * 0.65,
    heading: Math.atan2(Math.cos(t) * 21, -Math.sin(t) * 14),
    bank: Math.sin(t) * 0.12,
  };
}

// One crossing every 110 active seconds. The first arrives soon after entry.
export function planePose(seconds: number) {
  const progress = ((seconds + 14) % 110) / 32;
  return {
    visible: progress <= 1,
    x: -72 + progress * 144,
    y: 15,
    z: 17 - progress * 24,
    heading: Math.atan2(144, -24),
    // A quiet, smoothly approaching/departing propeller, not a constant engine.
    volume: progress <= 1 ? Math.sin(progress * Math.PI) ** 4 : 0,
  };
}

export const wildlifeClock = { seconds: 0 };

/** Separate, testable audio policy: no outdoor sound leaks into the houses. */
export function ambientMix(hour: number, x: number, z: number, scene: string) {
  const outside =
    scene === "hub" || scene === "rowing" || scene === "basketball";
  const night = sampleDaylight(hour).night;
  const weather = sampleWeather(hour);
  const riverDistance =
    scene === "rowing"
      ? 0
      : Math.max(
          0,
          Math.hypot(((x - POND.x) * POND.radiusZ) / POND.radiusX, z - POND.z) -
            POND.radiusZ,
        );
  return {
    birds: outside
      ? (1 - night) *
        (scene === "hub" ? 0.23 : 0.13) *
        (1 - weather.rain * 0.9) *
        (1 - weather.snow)
      : 0,
    crickets: outside ? night * 0.16 * (1 - weather.snow) : 0,
    water: outside ? Math.max(0, 1 - riverDistance / 14) * 0.23 : 0,
    rain: outside ? weather.rain * 0.3 : 0,
    wind: outside ? weather.wind * 0.12 : 0,
  };
}
