import { freshInput, newHoops, stepHoops, type HoopsMode } from "../src/game/core/hoops";
import { botInput, botMemory, type BotName } from "../src/game/core/hoopsBots";
import type { RivalId } from "../src/game/core/hoopsRival";

export type SimResult = { won: boolean; seconds: number; score: [number, number]; points: number; shots: number; makes: number; blocks: number; bites: number; turnovers: number };
/** Plays one seeded game with a bot; 8 minutes of game time at most. */
export function playGame(bot: BotName, rival: RivalId, seed: number, mode: HoopsMode = "1v1", jitter = 0.04): SimResult {
  const g = newHoops(mode, rival, seed);
  const m = botMemory(jitter);
  const input = freshInput();
  let blocks = 0, bites = 0, turnovers = 0;
  for (let i = 0; i < 60 * 480 && !g.over; i++) {
    botInput(g, bot, m, input);
    stepHoops(g, input);
    for (const e of g.events) {
      if (e.k === "block") blocks++;
      if (e.k === "bite") bites++;
      if (e.k === "turnover") turnovers++;
    }
  }
  return { won: g.winner === 0, seconds: g.t, score: [g.score[0], g.score[1]], points: g.points, shots: g.shots, makes: g.makes, blocks, bites, turnovers };
}
export const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
