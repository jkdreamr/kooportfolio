import { describe, expect, it } from 'vitest';
import { freshSave, parseSave, reward, upgrade } from '../src/shared/save';
import { canWalk, doors, findPath, moveWorld } from '../src/game/core/world';
import { dailySeed, newRace, riverCenter, stepRace } from '../src/game/core/rowing';
import { launchBall, stepBall, type BallState } from '../src/game/core/basketball';

describe('guest save trust boundary', () => {
  it('round trips actual progress and rejects corrupt or unknown schema', () => {
    const save = upgrade(reward(freshSave(), 'finish-1', 90, 30), 'garden');
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    for (const raw of ['{bad', 'null', '{}', JSON.stringify({ ...save, version: 2 }), JSON.stringify({ ...save, coins: -1 }), JSON.stringify({ ...save, position: [Infinity, 0] })]) expect(() => parseSave(raw)).toThrow();
    expect(parseSave(null).coins).toBe(0);
  });
  it('does not duplicate rewards or spend beyond a balance or max tier', () => {
    let s = freshSave();
    expect(upgrade(s, 'boathouse')).toBe(s);
    s = reward(s, 'a', 200, 25);
    expect(reward(s, 'a', 200, 25)).toBe(s);
    expect(reward(s, 'b', -10, 0)).toBe(s);
    s = upgrade(upgrade(s, 'garden'), 'garden');
    expect(s.coins).toBe(20); expect(s.upgrades.garden).toBe(3);
    expect(upgrade(s, 'garden')).toBe(s);
  });
});
describe('walkable physical world', () => {
  it('cannot tunnel through a building or leave the island', () => {
    expect(moveWorld(-7.2, 5, 0, -8)[1]).toBeGreaterThan(1.3);
    const p = moveWorld(0, 5, 100, 100); expect(canWalk(...p)).toBe(true);
  });
  it('finds collision-free paths to every door', () => {
    for (const door of doors) { const path = findPath([0, 5], [door.x, door.z]); expect(path.length).toBeGreaterThan(0); expect(path.every(p => canWalk(...p))).toBe(true); expect(Math.hypot(path.at(-1)![0] - door.x, path.at(-1)![1] - door.z)).toBeLessThan(1.2); }
  });
});
describe('rowing simulation', () => {
  const run = (burst = false) => { let s = newRace(); for (let i = 0; i < 120 * 60 && !s.finished; i++) { const target = riverCenter(s.distance + 6, 7); s = stepRace(s, { cadence: 30, steer: Math.max(-1, Math.min(1, (target - s.x) * .5)), burst }, 360, 7); } return s; };
  it('is repeatable and completes a steered race with splits', () => {
    const a = run(); expect(a).toEqual(run()); expect(a.finished).toBe(true); expect(a.distance).toBe(360); expect(a.splits).toHaveLength(3); expect(a.time).toBeGreaterThan(25); expect(a.stamina).toBeGreaterThanOrEqual(0);
  });
  it('penalizes bank contact and spends stamina for burst', () => {
    expect(stepRace({ ...newRace(), time: 1, x: 11 }, { cadence: 36, steer: 1, burst: true }, 360).bank).toBe(true);
    expect(run(true).stamina).toBeLessThan(run().stamina);
  });
  it('uses the UTC calendar date for daily practice', () => { expect(dailySeed(new Date('2026-11-23T00:01Z'))).toBe(dailySeed(new Date('2026-11-23T23:59Z'))); expect(dailySeed(new Date('2026-11-24T00:00Z'))).not.toBe(dailySeed(new Date('2026-11-23T23:59Z'))); });
});
describe('basketball physics', () => {
  const shoot = (charge: number, aim = 0) => { let b = launchBall(0, 5, charge, aim), scores = 0; for (let i = 0; i < 480; i++) { const next = stepBall(b, 1 / 120); b = next.ball; scores += Number(next.score); } return { b, scores }; };
  it('scores a timed shot only once and misses underpowered or mis-aimed shots', () => {
    expect(shoot(.62).scores).toBe(1); expect(shoot(.05).scores).toBe(0); expect(shoot(.62, .5).scores).toBe(0);
  });
  it('bounces off floor, solid board and rim', () => {
    const make = (p: BallState['p'], v: BallState['v']): BallState => ({ p, v, age: 0, bounced: false, scored: false });
    expect(stepBall(make({ x: 0, y: .24, z: 0 }, { x: 0, y: -3, z: 0 }), 1 / 60).ball.v.y).toBeGreaterThan(0);
    expect(stepBall(make({ x: 0, y: 4, z: -5.4 }, { x: 0, y: 0, z: -5 }), 1 / 60).ball.v.z).toBeGreaterThan(0);
    expect(stepBall(make({ x: .53, y: 3.3, z: -5 }, { x: 0, y: -1, z: 0 }), 1 / 120).collision).toBe(true);
  });
});
