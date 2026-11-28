import { freshRowInput, newRace, stepRace, type Cup, type RaceOptions } from "../src/game/core/rowing";
import { botInput, rivalInput, rowBotMemory, type RowBot } from "../src/game/core/rowRival";

export type RowResult = { place: number; time: number; winner: number; passes: number; slingPasses: number; perfects: number; cleans: number; maxRivalV: number; leadAtLastCp: number };
export function playRace(bot: RowBot, cup: Cup, seed: number, o: RaceOptions = {}): RowResult {
  const r = newRace({ mode: "gp", cup, seed, ...o });
  const inputs = r.boats.map(() => freshRowInput());
  const m = rowBotMemory();
  let maxRivalV = 0;
  for (let i = 0; i < 60 * 400 && !r.over; i++) {
    botInput(r, bot, m, inputs[0]);
    for (let j = 1; j < r.boats.length; j++) rivalInput(r, r.boats[j], inputs[j]);
    stepRace(r, inputs);
    for (let j = 1; j < r.boats.length; j++) maxRivalV = Math.max(maxRivalV, r.boats[j].v);
  }
  const p = r.boats[0];
  const winner = Math.min(...r.boats.filter((b) => b.finished).map((b) => b.finishTime));
  return { place: p.place, time: p.finished ? p.finishTime : Infinity, winner, passes: p.passes, slingPasses: p.slingPasses, perfects: p.perfects, cleans: p.cleans, maxRivalV, leadAtLastCp: 0 };
}
