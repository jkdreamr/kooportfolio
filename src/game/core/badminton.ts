/** Local quick singles. Court units are enlarged for the village's toy scale. */
export const BADMINTON = {
  halfWidth: 3.4,
  halfLength: 8.5,
  net: 2.05,
  floor: 0.2,
  gravity: 7.5,
  winningScore: 7,
} as const;
export type BadmintonSide = "player" | "opponent";
export type BadmintonShot = "clear" | "drop" | "smash";
export type BadmintonInput = {
  x: number;
  z: number;
  swing: boolean;
  aim: -1 | 0 | 1;
  shot: BadmintonShot;
};
export type BadmintonGame = {
  phase: "ready" | "rally" | "point" | "over";
  player: { x: number; z: number; swing: number };
  opponent: { x: number; z: number; swing: number };
  shuttle: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
  };
  score: [number, number];
  server: BadmintonSide;
  lastHit: BadmintonSide;
  winner: BadmintonSide | null;
  rally: number;
  longestRally: number;
  pointTime: number;
  playerCooldown: number;
  flightTime: number;
  message: string;
};
export function newBadmintonGame(): BadmintonGame {
  return {
    phase: "ready",
    player: { x: 0, z: 5.7, swing: 0 },
    opponent: { x: 0, z: -5.7, swing: 0 },
    shuttle: { x: 0, y: 1.5, z: 5.3, vx: 0, vy: 0, vz: 0 },
    score: [0, 0],
    server: "player",
    lastHit: "player",
    winner: null,
    rally: 0,
    longestRally: 0,
    pointTime: 0,
    playerCooldown: 0,
    flightTime: 0,
    message: "Your serve",
  };
}
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
const other = (side: BadmintonSide): BadmintonSide =>
  side === "player" ? "opponent" : "player";

/** Shared by the racket and its timing cue so a lit cue always means a legal hit. */
export function canReturnBadminton(game: BadmintonGame): boolean {
  const s = game.shuttle;
  return (
    game.phase === "rally" &&
    game.lastHit === "opponent" &&
    game.playerCooldown === 0 &&
    s.z > 0.25 &&
    s.y >= 0.5 &&
    s.y <= 4.7 &&
    Math.hypot(s.x - game.player.x, s.z - game.player.z) <= 1.65
  );
}

function launch(
  game: BadmintonGame,
  side: BadmintonSide,
  aim: number,
  shot: BadmintonShot,
) {
  const s = game.shuttle;
  // A low contact cannot become a steep smash. The clear remains playable.
  if (shot === "smash" && s.y < 2.5) shot = "clear";
  const sign = side === "player" ? -1 : 1;
  const targetZ = sign * (shot === "drop" ? 2.1 : shot === "smash" ? 5.1 : 7.1);
  const time = shot === "drop" ? 1.35 : shot === "smash" ? 0.88 : 1.85;
  s.vx = (aim * 2.85 - s.x) / time;
  s.vz = (targetZ - s.z) / time;
  s.vy = (0.9 - s.y + 0.5 * BADMINTON.gravity * time * time) / time;
  game.lastHit = side;
  game[side].swing = 0.28;
  if (side === "player") game.playerCooldown = 0.27;
  game.flightTime = 0;
  game.rally++;
  game.longestRally = Math.max(game.longestRally, game.rally);
  game.message = "";
}

function point(game: BadmintonGame, side: BadmintonSide, reason: string) {
  game.score[side === "player" ? 0 : 1]++;
  game.server = side;
  game.pointTime = 0;
  const [you, opponent] = game.score;
  const high = Math.max(you, opponent);
  const won =
    high >= BADMINTON.winningScore &&
    (Math.abs(you - opponent) >= 2 || high >= 11);
  game.phase = won ? "over" : "point";
  game.winner = won ? side : null;
  game.message = won
    ? side === "player"
      ? "You win"
      : "Match over"
    : `${reason} · ${side === "player" ? "Your" : "Their"} point`;
  game.shuttle.vx = game.shuttle.vy = game.shuttle.vz = 0;
}

/** Mutates only the match passed in; no storage, rendering, or wall-clock reads. */
export function stepBadminton(
  game: BadmintonGame,
  input: BadmintonInput,
  elapsed: number,
) {
  if (!Number.isFinite(elapsed) || elapsed <= 0 || game.phase === "over")
    return;
  // Fixed-size substeps make net/ground contacts safe even after a dropped frame.
  let remaining = Math.min(elapsed, 0.1);
  let swing = input.swing;
  while (remaining > 0.00001) {
    if (game.winner) break;
    const dt = Math.min(1 / 120, remaining);
    remaining -= dt;
    if (game.phase === "point") {
      game.pointTime += dt;
      if (game.pointTime >= 1.4) {
        game.phase = "ready";
        game.rally = 0;
        game.player.x = game.opponent.x = 0;
        game.player.z = 5.7;
        game.opponent.z = -5.7;
        game.message = game.server === "player" ? "Your serve" : "Their serve";
      }
      continue;
    }
    game.playerCooldown = Math.max(0, game.playerCooldown - dt);
    game.player.swing = Math.max(0, game.player.swing - dt);
    game.opponent.swing = Math.max(0, game.opponent.swing - dt);
    if (game.phase === "ready") {
      const server = game[game.server];
      Object.assign(game.shuttle, {
        x: server.x,
        y: 1.7,
        z: server.z + (game.server === "player" ? -0.6 : 0.6),
        vx: 0,
        vy: 0,
        vz: 0,
      });
      if (game.server === "player" ? swing : (game.pointTime += dt) >= 2.2) {
        game.phase = "rally";
        launch(
          game,
          game.server,
          game.server === "player" ? input.aim : game.score[1] % 2 ? -1 : 1,
          "clear",
        );
      }
      swing = false;
      continue;
    }
    const length = Math.max(1, Math.hypot(input.x, input.z));
    game.player.x = clamp(
      game.player.x + (input.x / length) * dt * 5.4,
      -3.9,
      3.9,
    );
    game.player.z = clamp(
      game.player.z + (input.z / length) * dt * 5.4,
      0.75,
      8.3,
    );
    const s = game.shuttle;
    if (swing && game.playerCooldown === 0) {
      const reachable = canReturnBadminton(game);
      game.player.swing = 0.28;
      game.playerCooldown = 0.27;
      if (reachable) {
        launch(game, "player", input.aim, input.shot);
      } else {
        game.message =
          game.lastHit !== "opponent" || s.z <= 0.25
            ? "Wait for return"
            : s.y > 4.7
              ? "Too early"
              : s.y < 0.5
                ? "Too late"
                : "Move to shuttle";
      }
    }
    swing = false;
    game.flightTime += dt;
    // The opponent tracks the descending contact point, but has finite speed.
    const contactTime = Math.max(
      0,
      (s.vy +
        Math.sqrt(
          Math.max(0, s.vy * s.vy + 2 * BADMINTON.gravity * (s.y - 1.8)),
        )) /
        BADMINTON.gravity,
    );
    const attacking = game.lastHit === "player" && game.flightTime > 0.3;
    const recovering = game.lastHit === "opponent" && game.flightTime > 0.65;
    const tx = attacking ? clamp(s.x + s.vx * contactTime, -3.5, 3.5) : 0;
    const tz = attacking ? clamp(s.z + s.vz * contactTime, -8, -1.1) : -5.5;
    const ax = tx - game.opponent.x,
      az = tz - game.opponent.z;
    const distance = Math.hypot(ax, az);
    // Slow recovery leaves space to attack; the guest cannot cover every corner.
    const step = Math.min(
      distance,
      dt * (attacking ? 3.2 : recovering ? 1.3 : 0),
    );
    if (distance > 0) {
      game.opponent.x += (ax / distance) * step;
      game.opponent.z += (az / distance) * step;
    }
    if (
      attacking &&
      s.z < -0.3 &&
      s.vy < 0 &&
      s.y < 2.8 &&
      s.y > 0.6 &&
      Math.hypot(s.x - game.opponent.x, s.z - game.opponent.z) < 1.05
    ) {
      const aim =
        game.player.x > 0.5
          ? -1
          : game.player.x < -0.5
            ? 1
            : game.rally % 2
              ? 1
              : -1;
      launch(game, "opponent", aim, game.rally % 4 === 0 ? "drop" : "clear");
    }
    const oldZ = s.z,
      oldY = s.y;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.y += s.vy * dt - 0.5 * BADMINTON.gravity * dt * dt;
    s.vy -= BADMINTON.gravity * dt;
    if (oldZ * s.z < 0) {
      const netY = oldY + (s.y - oldY) * Math.abs(oldZ / (s.z - oldZ));
      if (netY <= BADMINTON.net) {
        s.z = 0;
        point(game, other(game.lastHit), "Net");
        continue;
      }
    }
    if (s.y <= BADMINTON.floor) {
      s.y = BADMINTON.floor;
      const inBounds =
        Math.abs(s.x) <= BADMINTON.halfWidth &&
        Math.abs(s.z) <= BADMINTON.halfLength;
      const correctHalf = game.lastHit === "player" ? s.z < 0 : s.z > 0;
      point(
        game,
        inBounds && correctHalf ? game.lastHit : other(game.lastHit),
        inBounds ? "Down" : "Out",
      );
    }
  }
}
