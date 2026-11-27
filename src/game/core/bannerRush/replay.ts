/** Replays (§2.13): the seed, config and the outside inputs reproduce a match. */
import { RULES_VERSION } from "./constants";
import { createMatch } from "./state";
import { step } from "./step";
import { PH_OVER } from "./constants";
import type { DeployInput, MatchConfig, MatchState, Side } from "./types";

/** [tick, side, slot, x × 100, y × 100] */
export type ReplayInput = [number, number, number, number, number];
export type Replay = { v: number; seed: number; config: MatchConfig; inputs: ReplayInput[] };

export class Recorder {
  readonly inputs: ReplayInput[] = [];
  constructor(readonly config: MatchConfig) {}
  record(tick: number, input: DeployInput) {
    this.inputs.push([tick, input.side, input.slot, Math.round(input.x * 100), Math.round(input.y * 100)]);
  }
  replay(): Replay {
    return { v: RULES_VERSION, seed: this.config.seed, config: this.config, inputs: this.inputs.slice() };
  }
}

/** Inputs are quantised to hundredths of a tile, so live play should send quantised values too. */
export const quantise = (v: number) => Math.round(v * 100) / 100;

export function runReplay(replay: Replay, maxTicks = 6000): MatchState {
  const s = createMatch(replay.config);
  let k = 0;
  const batch: DeployInput[] = [];
  while (s.phase !== PH_OVER && s.tick < maxTicks) {
    batch.length = 0;
    while (k < replay.inputs.length && replay.inputs[k][0] === s.tick) {
      const [, side, slot, x, y] = replay.inputs[k++];
      batch.push({ side: side as Side, slot, x: x / 100, y: y / 100 });
    }
    step(s, batch);
  }
  return s;
}
