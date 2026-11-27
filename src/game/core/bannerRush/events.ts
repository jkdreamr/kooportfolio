/**
 * The per-tick event ring (128 entries, reset at the start of each step).
 * Writers never allocate; a full ring drops further events (the stress test
 * asserts it never fills).
 */
import { EVENT_CAP } from "./constants";
import { ST_MAX_EVENTS, type MatchState } from "./types";

// @hot
export function emit(s: MatchState, type: number, a: number, b: number, c: number, d: number, x: number, y: number) {
  const i = s.eventCount;
  if (i >= EVENT_CAP) return;
  s.evType[i] = type;
  s.evA[i] = a;
  s.evB[i] = b;
  s.evC[i] = c;
  s.evD[i] = d;
  s.evX[i] = x;
  s.evY[i] = y;
  s.eventCount = i + 1;
  if (i + 1 > s.stats[ST_MAX_EVENTS]) s.stats[ST_MAX_EVENTS] = i + 1;
}
