import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { create } from 'zustand';
import * as THREE from 'three';
import { Boat, Box, Cylinder, Ring, Sign, Tree } from '../world/Models';
import { runtime, useGame } from '../core/store';
import { keys } from '../core/input';
import { newRace, raceTime, riverCenter, stepRace, TICK, type RaceState } from '../core/rowing';
import { sound } from '../core/sound';
export const useRaceHud = create<{ race: RaceState; place: number }>(() => ({ race: newRace(), place: 1 }));
function River({ length, seed }: { length: number; seed: number }) {
  const geometry = useMemo(() => {
    const vertices = [], indices = [];
    for (let s = -30; s <= length + 80; s += 5) { const c = riverCenter(Math.max(0, s), seed); vertices.push(c - 12, -.1, -s, c + 12, -.1, -s); }
    for (let i = 0; i < vertices.length / 3 - 2; i += 2) indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
  }, [length, seed]);
  return <group><mesh geometry={geometry} receiveShadow><meshStandardMaterial color="#6ca6a5" roughness={.4} metalness={.12} side={THREE.DoubleSide} /></mesh>
    {Array.from({ length: Math.ceil(length / 9) + 8 }, (_, i) => { const s = i * 9 - 20, c = riverCenter(Math.max(0, s), seed); return <group key={i}>
      {[-1, 1].map(side => <group key={side}><Box p={[c + side * 21, -.5, -s]} s={[18, 1, 9.2]} c={i % 3 ? '#a6b68b' : '#aeb88f'} /><Box p={[c + side * 12.7, -.12, -s]} s={[1.3, .7, 9.2]} c="#c9c19c" />{i % 2 === 0 && <Tree p={[c + side * (16 + i % 4), 0, -s]} size={.8 + i % 3 * .15} variant={i} />}<Cylinder p={[c + side * 9.1, .12, -s]} s={[.17, .3, .17]} c={i % 2 ? '#f2e8c8' : '#c77d62'} /></group>)}
      <Box p={[c + Math.sin(i * 5) * 7, -.04, -s]} s={[1.7, .02, .06]} c="#bad6cb" />
    </group>; })}
    {[0, 100, 200, 300, 400, 500, 600, length].filter((n, i, arr) => n <= length && arr.indexOf(n) === i).map(s => <group key={s} position={[riverCenter(s, seed), 0, -s]}><Box p={[0, .01, 0]} s={[19, .02, .2]} c="#f7e6b9" />{[-10.5, 10.5].map(x => <group key={x}><Cylinder p={[x, 2.5, 0]} s={[.11, 5, .11]} c="#a38d66" /><Box p={[x + (x < 0 ? 1 : -1), 4.5, 0]} s={[2, .8, .08]} c={s === length ? '#bf7d61' : '#e7d5ad'} /></group>)}{s === length && <><Box p={[0, 5, 0]} s={[21, .15, .15]} c="#b3a17c" /><Sign text="FINISH" p={[0, 4.6, .15]} size={[5, 1]} /></>}</group>)}
  </group>;
}
export function Rowing() {
  const player = useRef<THREE.Group>(null), ai = useRef<THREE.Group>(null);
  const state = useRef(newRace()), accumulator = useRef(0), nextHud = useRef(0), done = useRef(false), id = useRef(crypto.randomUUID());
  const length = runtime.raceLength, seed = runtime.raceSeed;
  useFrame(({ camera }, delta) => {
    const game = useGame.getState(); if (game.paused || game.result || game.panel !== 'none' || !runtime.active) return;
    accumulator.current += Math.min(delta, .1);
    while (accumulator.current >= TICK) {
      const steer = (Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'))) || runtime.steer;
      state.current = stepRace(state.current, { steer, cadence: runtime.raceCadence, burst: keys.has(' ') || runtime.burst }, length, seed);
      accumulator.current -= TICK;
    }
    const s = state.current;
    if (player.current) { player.current.position.set(s.x, Math.sin(s.time * 4) * .025, -s.distance); player.current.rotation.y = -s.heading; }
    let place = 1;
    ai.current?.children.forEach((boat, i) => { const t = Math.max(0, s.time), speed = [10.3, 11.05, 9.75][i], dist = Math.min(length + 12, Math.max(0, t * speed - (1 - Math.exp(-t * .7)) * speed / .7 + Math.sin(t * .12 + i) * .7)); if (dist > s.distance) place++; boat.position.set(riverCenter(dist, seed) + (i - 1) * 5 + 1, Math.sin(t * 4 + i) * .025, -dist); boat.rotation.y = -Math.atan((riverCenter(dist + .2, seed) - riverCenter(dist, seed)) / .2); });
    const desired = new THREE.Vector3(s.x * .55 + 3, 9.5, -s.distance + 17);
    camera.position.lerp(desired, 1 - Math.exp(-delta * 4)); camera.lookAt(s.x * .6, 0, -s.distance - 9);
    if (camera instanceof THREE.PerspectiveCamera) { camera.fov = window.innerWidth < 700 ? 68 : 55; camera.updateProjectionMatrix(); }
    if (s.time > nextHud.current || s.time < 0) { useRaceHud.setState({ race: { ...s }, place }); nextHud.current = s.time + .1; }
    if (s.finished && !done.current) {
      done.current = true; const coins = 45 + (4 - place) * 10 + (length > 400 ? 25 : 0), best = game.save.bestRace;
      game.award(id.current, coins, 30, { bestRace: length === 360 ? Math.min(best ?? Infinity, s.time) : best });
      useGame.setState({ result: { game: 'rowing', title: place === 1 ? 'A very good day on the river.' : 'Every stroke, a little better.', score: raceTime(s.time), coins, detail: `${place}${['st', 'nd', 'rd', 'th'][place - 1]} place · ${length} m · Local, unranked run` } }); sound('win');
    }
  });
  return <><River length={length} seed={seed} /><group ref={player}><Boat color="#f0ce81" pace={runtime.raceCadence} race /><Ring p={[0, -.02, 0]} radius={.65} tube={.025} c="#f6dfa0" /></group><group ref={ai}>{['#c48068', '#778f79', '#8c88a2'].map(color => <group key={color}><Boat color={color} pace={30} race /></group>)}</group></>;
}
