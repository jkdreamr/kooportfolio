import { canWalk, findPath, moveWorld, type PlaceId } from "./world";
import type { WorldId } from "./worlds";
import { extraLocals, routines } from "./npcRoutines";
import { islandLocals } from "./npcPopulation";

type Point = [number, number];
export const TALK_DISTANCE = 2.7;

export type NpcSeat = { position: Point; height: number };
export type NpcStop = {
  duration: number;
  heading: number;
  seat?: NpcSeat;
};
export type Villager = {
  id: string;
  name: string;
  color: string;
  skin: string;
  hat: boolean;
  place: PlaceId | "photo" | "campus" | "bridge";
  lines: string[];
  route: Point[];
  stops?: Record<number, NpcStop>;
};
// Fictional village locals, not claims about people in Joshua's life.
const locals: Villager[] = [
  {
    id: "rower",
    name: "Rower",
    color: "#ae4e3d",
    skin: "#d9a578",
    hat: true,
    place: "boathouse",
    lines: [
      "Heading to the water?",
      "Boathouse is over there. Come get a race in.",
    ],
    route: [
      [-2.4, 5],
      [-12, 5],
      [-20, 9],
      [-13, 10],
      [-6, 8],
    ],
  },
  {
    id: "cook",
    name: "Cook",
    color: "#e0c883",
    skin: "#b7805f",
    hat: false,
    place: "kitchen",
    lines: ["Just taking a break.", "If you're hungry, the kitchen's open."],
    route: [
      [-8, 17],
      [-15, 17],
      [-16, 11],
      [-10, 8],
      [-3, 12],
    ],
  },
  {
    id: "hooper",
    name: "Hooper",
    color: "#6d859f",
    skin: "#a77151",
    hat: false,
    place: "basketball",
    lines: ["You play?", "Court's free if you want to shoot."],
    route: [
      [19, 9],
      [13, 8],
      [7, 6],
      [12, 2],
      [20, 1],
    ],
  },
  {
    id: "neighbor",
    name: "Neighbor",
    color: "#9184a5",
    skin: "#e3b796",
    hat: true,
    place: "kappa",
    lines: [
      "Hey, good to see you.",
      "We're hanging out at the house. Stop by.",
    ],
    route: [
      [-13, -8],
      [-7, -8],
      [-5, -3],
      [-11, -2],
      [-20, -7],
    ],
  },
  {
    id: "maker",
    name: "Maker",
    color: "#577f73",
    skin: "#cc956e",
    hat: false,
    place: "cognition",
    lines: ["Needed some fresh air.", "Back to the workshop in a minute."],
    route: [
      [14, -8],
      [8, -8],
      [5, -3],
      [11, -2],
      [21, -7],
    ],
  },
  {
    id: "student",
    name: "Student",
    color: "#b77a50",
    skin: "#ddb08c",
    hat: false,
    place: "math",
    lines: [
      "I've been stuck on this all morning.",
      "Might try the math lab again.",
    ],
    route: [
      [6, -18],
      [0, -16],
      [-7, -18],
      [0, -11],
      [8, -14],
    ],
  },
  {
    id: "runner",
    name: "Runner",
    color: "#6b8d9c",
    skin: "#bd8d68",
    hat: true,
    place: "gym",
    lines: ["One more lap.", "Then I'm heading to the gym."],
    route: [
      [-6, 21],
      [-12, 22],
      [-14, 28],
      [-8, 30],
      [-5, 26],
    ],
  },
  {
    id: "gardener",
    name: "Gardener",
    color: "#899751",
    skin: "#e5bc99",
    hat: true,
    place: "kitchen",
    lines: [
      "These needed a bit of water.",
      "Taking the herbs to the kitchen next.",
    ],
    route: [
      [-4, -1],
      [-3, 4],
      [4, 3],
      [4, -3],
      [-2, -5],
    ],
  },
  {
    id: "musician",
    name: "Musician",
    color: "#b6a563",
    skin: "#b98762",
    hat: false,
    place: "music",
    lines: [
      "Got a tune stuck in my head.",
      "Going to try it out at the beat lab.",
    ],
    route: [
      [-15, -21],
      [-19, -20],
      [-26, -16],
      [-25, -8],
      [-14, -9],
    ],
  },
  {
    id: "reader",
    name: "Reader",
    color: "#827698",
    skin: "#d5aa87",
    hat: false,
    place: "office",
    lines: ["Lost my place again.", "The study's quieter than out here."],
    route: [
      [-4, -18],
      [-5, -24],
      [0, -28],
      [5, -28],
      [5, -20],
    ],
  },
  {
    id: "classmate",
    name: "Classmate",
    color: "#ad6250",
    skin: "#a97651",
    hat: false,
    place: "math",
    lines: ["Late again.", "Math lab. Wish me luck."],
    route: [
      [16, -21],
      [22, -21],
      [24, -16],
      [24, -10],
      [12, -8],
    ],
  },
  {
    id: "visitor",
    name: "Visitor",
    color: "#5d8691",
    skin: "#e9c09c",
    hat: true,
    place: "kappa",
    lines: [
      "Nice day for a walk.",
      "I was looking for the house. Found it eventually.",
    ],
    route: [
      [-27, -3],
      [-29, 2],
      [-26, 11],
      [-20, 13],
      [-17, 1],
    ],
  },
  {
    id: "coxswain",
    name: "Coxswain",
    color: "#956347",
    skin: "#d2a780",
    hat: true,
    place: "boathouse",
    lines: ["Crew's warming up.", "There's time for a quick race."],
    route: [
      [-30, 8],
      [-31, 1],
      [-28, -5],
      [-22, -2],
      [-24, 10],
    ],
  },
  {
    id: "regular",
    name: "Regular",
    color: "#8a995d",
    skin: "#ba865e",
    hat: false,
    place: "kitchen",
    lines: ["Smells good, right?", "I get lunch here most days."],
    route: [
      [-17, 23],
      [-22, 19],
      [-25, 16],
      [-17, 15],
      [-10, 22],
    ],
  },
  {
    id: "teammate",
    name: "Teammate",
    color: "#b88959",
    skin: "#ad7a59",
    hat: false,
    place: "basketball",
    lines: ["Taking the long way back.", "See you on the court?"],
    route: [
      [30, 8],
      [32, 2],
      [29, -4],
      [24, -2],
      [27, 10],
    ],
  },
  {
    id: "lifter",
    name: "Lifter",
    color: "#56796b",
    skin: "#e1b593",
    hat: false,
    place: "gym",
    lines: ["Leg day's tomorrow.", "Today I'm just going for a walk."],
    route: [
      [-20, 25],
      [-18, 29],
      [-12, 28],
      [-9, 23],
      [-15, 21],
    ],
  },
  {
    id: "researcher",
    name: "Researcher",
    color: "#8896a5",
    skin: "#c99c76",
    hat: false,
    place: "cognition",
    lines: ["Had to get away from my screen.", "Workshop's just up the path."],
    route: [
      [28, -12],
      [30, -17],
      [26, -23],
      [22, -26],
      [19, -21],
    ],
  },
  {
    id: "producer",
    name: "Producer",
    color: "#a37893",
    skin: "#ad7f62",
    hat: true,
    place: "music",
    lines: ["Listen to those birds.", "Might have to put that in a track."],
    route: [
      [-23, -24],
      [-20, -29],
      [-13, -30],
      [-6, -28],
      [-7, -20],
    ],
  },
];

export const villagers: Villager[] = [
  ...locals.map((npc) => ({ ...npc, ...routines[npc.id] })),
  ...extraLocals,
  ...islandLocals,
];

export type NpcActor = {
  id: string;
  x: number;
  z: number;
  heading: number;
  moving: boolean;
  stride: number;
  waypoint: number;
  wait: number;
  path: Point[];
  stopIndex: number | null;
  pose: "stand" | "sit";
  posture: number;
  seat: NpcSeat | null;
};
export function createNpcActors(): NpcActor[] {
  return villagers.map((npc, i) => ({
    id: npc.id,
    x: npc.route[0][0],
    z: npc.route[0][1],
    heading: npc.stops?.[0]?.heading ?? i,
    moving: false,
    stride: i,
    waypoint: 1,
    wait: (npc.stops?.[0]?.duration ?? 0) + i * 0.4,
    path: [],
    stopIndex: 0,
    pose: npc.stops?.[0]?.seat ? "sit" : "stand",
    posture: npc.stops?.[0]?.seat ? 1 : 0,
    seat: npc.stops?.[0]?.seat ?? null,
  }));
}

export function nearestNpc(
  actors: NpcActor[],
  x: number,
  z: number,
  world?: WorldId,
) {
  let best: NpcActor | undefined,
    distance = TALK_DISTANCE;
  for (const actor of actors) {
    const d = Math.hypot(actor.x - x, actor.z - z);
    if (d < distance && canTalkToNpc(actor, x, z, world)) {
      best = actor;
      distance = d;
    }
  }
  return best;
}

export function canTalkToNpc(
  actor: NpcActor,
  x: number,
  z: number,
  world?: WorldId,
) {
  const distance = Math.hypot(actor.x - x, actor.z - z);
  if (distance >= TALK_DISTANCE) return false;
  const steps = Math.max(1, Math.ceil(distance / 0.2));
  for (let i = 1; i <= steps; i++) {
    if (
      !canWalk(
        x + ((actor.x - x) * i) / steps,
        z + ((actor.z - z) * i) / steps,
        world,
      )
    )
      return false;
  }
  return true;
}

/** Uses the same collision grid as the player; no per-frame path searches. */
export function stepNpc(
  actor: NpcActor,
  npc: Villager,
  delta: number,
  player: Point,
  frozen = false,
  selected = false,
  world?: WorldId,
) {
  actor.moving = false;
  if (frozen) return;
  const dt = Math.max(0, Math.min(delta, 0.04));
  const targetPosture = actor.pose === "sit" ? 1 : 0;
  actor.posture +=
    Math.sign(targetPosture - actor.posture) *
    Math.min(Math.abs(targetPosture - actor.posture), dt * 3);
  if (selected || canTalkToNpc(actor, ...player, world)) {
    actor.pose = "stand";
    actor.heading = Math.atan2(player[0] - actor.x, player[1] - actor.z);
    return;
  }
  if (actor.wait > 0) {
    actor.wait -= dt;
    const stop =
      actor.stopIndex === null ? undefined : npc.stops?.[actor.stopIndex];
    actor.pose = stop?.seat ? "sit" : "stand";
    if (stop) actor.heading = stop.heading;
    if (stop?.seat) actor.seat = stop.seat;
    return;
  }
  actor.pose = "stand";
  if (!actor.path.length) {
    actor.stopIndex = null;
    actor.path = findPath([actor.x, actor.z], npc.route[actor.waypoint], world);
    actor.waypoint = (actor.waypoint + 1) % npc.route.length;
    if (!actor.path.length) actor.wait = 1.5;
    return;
  }
  const [tx, tz] = actor.path[0],
    dx = tx - actor.x,
    dz = tz - actor.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.0001) {
    actor.path.shift();
    if (!actor.path.length) {
      actor.stopIndex =
        (actor.waypoint + npc.route.length - 1) % npc.route.length;
      actor.wait =
        npc.stops?.[actor.stopIndex]?.duration ?? 1.2 + npc.id.length * 0.17;
    }
    return;
  }
  const step = Math.min(distance, dt * 1.35),
    oldX = actor.x,
    oldZ = actor.z;
  [actor.x, actor.z] = moveWorld(
    actor.x,
    actor.z,
    (dx / distance) * step,
    (dz / distance) * step,
    world,
  );
  actor.moving = Math.hypot(actor.x - oldX, actor.z - oldZ) > 0.00001;
  if (actor.moving) {
    actor.heading = Math.atan2(dx, dz);
    actor.stride += step * 7;
  } else if (dt > 0) {
    // Layout changes cannot trap a local in an endless wall-walking animation.
    actor.path = [];
    actor.wait = 1.5;
  }
}

export function approachNpc(
  actor: NpcActor,
  player: Point,
  world?: WorldId,
): Point[] {
  const angle = Math.atan2(player[0] - actor.x, player[1] - actor.z);
  for (let i = 0; i < 8; i++) {
    const a = angle + (i * Math.PI) / 4;
    const point: Point = [
      actor.x + Math.sin(a) * 1.6,
      actor.z + Math.cos(a) * 1.6,
    ];
    if (!canWalk(point[0], point[1], world)) continue;
    const path = findPath(player, point, world);
    if (path.length && canTalkToNpc(actor, ...path.at(-1)!, world)) return path;
  }
  return [];
}
