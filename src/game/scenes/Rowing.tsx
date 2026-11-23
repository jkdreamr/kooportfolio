import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { create } from "zustand";
import * as THREE from "three";
import { Ball, Box, Cylinder, Sign, Tree } from "../world/Models";
import { runtime, useGame } from "../core/store";
import { keys } from "../core/input";
import {
  newRace,
  newRivals,
  currentLine,
  racePlace,
  raceTime,
  riverCenter,
  riverTangent,
  rivalInput,
  stepRace,
  TICK,
  type RaceState,
} from "../core/rowing";
import { sound } from "../core/sound";
import { newRunId } from "../../shared/run-id";
import {
  readRaceRecord,
  saveRaceRecord,
  type RaceRecord,
} from "../core/rowingRecords";
import { RowingShell } from "./RowingShell";
export const useRaceHud = create<{
  race: RaceState;
  place: number;
  rivals: RaceState[];
  record: RaceRecord | null;
  splitDelta: number | null;
}>(() => ({
  race: newRace(),
  place: 1,
  rivals: newRivals(),
  record: null,
  splitDelta: null,
}));
function CurrentFlow({
  state,
  seed,
}: {
  state: () => RaceState;
  seed: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const transform = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    if (!ref.current) return;
    const race = state();
    for (let i = 0; i < 72; i++) {
      const distance =
        race.distance - 25 + ((i * 5.7 + Math.max(0, race.time) * 4) % 130);
      transform.position.set(
        currentLine(Math.max(0, distance), seed) + ((i % 3) - 1) * 0.95,
        -0.055,
        -distance,
      );
      transform.rotation.set(
        -Math.PI / 2,
        0,
        -Math.atan(riverTangent(Math.max(0, distance), seed)),
      );
      transform.scale.set(0.5, 1.5 + (i % 4) * 0.5, 1);
      transform.updateMatrix();
      ref.current.setMatrixAt(i, transform.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, 72]}
      frustumCulled={false}
    >
      <planeGeometry args={[0.1, 1]} />
      <meshBasicMaterial
        color="#d0f6e7"
        transparent
        opacity={0.55}
        depthWrite={false}
      />
    </instancedMesh>
  );
}
function River({ length, seed }: { length: number; seed: number }) {
  const geometry = useMemo(() => {
    const vertices = [],
      indices = [];
    for (let s = -30; s <= length + 80; s += 5) {
      const c = riverCenter(Math.max(0, s), seed);
      vertices.push(c - 12, -0.1, -s, c + 12, -0.1, -s);
    }
    for (let i = 0; i < vertices.length / 3 - 2; i += 2)
      indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [length, seed]);
  const channel = useMemo(() => {
    const vertices = [],
      indices = [];
    for (let s = -30; s <= length + 80; s += 4) {
      const c = currentLine(Math.max(0, s), seed);
      vertices.push(c - 2.4, -0.08, -s, c + 2.4, -0.08, -s);
    }
    for (let i = 0; i < vertices.length / 3 - 2; i += 2)
      indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    g.setIndex(indices);
    return g;
  }, [length, seed]);
  return (
    <group>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial
          color="#237f88"
          roughness={0.36}
          metalness={0.18}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={channel}>
        <meshBasicMaterial
          color="#71d6c4"
          transparent
          opacity={0.21}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {Array.from({ length: Math.ceil(length / 9) + 8 }, (_, i) => {
        const s = i * 9 - 20,
          c = riverCenter(Math.max(0, s), seed);
        return (
          <group key={i}>
            {[-1, 1].map((side) => (
              <group key={side}>
                <Box
                  p={[c + side * 21, -0.5, -s]}
                  s={[18, 1, 9.2]}
                  c={i % 3 ? "#86ac64" : "#96b671"}
                />
                <Box
                  p={[c + side * 12.7, -0.12, -s]}
                  s={[1.3, 0.7, 9.2]}
                  c="#c8b98a"
                />
                {i % 2 === 0 && (
                  <Tree
                    p={[c + side * (16 + (i % 4)), 0, -s]}
                    size={0.8 + (i % 3) * 0.15}
                    variant={i}
                  />
                )}
                <Cylinder
                  p={[c + side * 9.1, 0.12, -s]}
                  s={[0.19, 0.34, 0.19]}
                  c={i % 2 ? "#f2e8c8" : "#dc7554"}
                />
                <Ball
                  p={[c + side * 9.1, 0.29, -s]}
                  s={[0.2, 0.17, 0.2]}
                  c={i % 2 ? "#f2e8c8" : "#dc7554"}
                />
                {i % 3 === 1 && (
                  <group>
                    <Ball
                      p={[c + side * 13.2, 0.2, -s + 2]}
                      s={[0.7, 0.5, 1.1]}
                      c="#8a9989"
                    />
                    <Ball
                      p={[c + side * 14.1, 0.35, -s + 2.7]}
                      s={[0.9, 0.7, 0.75]}
                      c="#a6af98"
                    />
                  </group>
                )}
              </group>
            ))}
          </group>
        );
      })}
      {[
        0,
        ...Array.from(
          { length: Math.ceil(length / 100) - 1 },
          (_, i) => (i + 1) * 100,
        ),
        length,
      ].map((s) => (
        <group key={s} position={[riverCenter(s, seed), 0, -s]}>
          <Box
            p={[0, -0.035, 0]}
            s={[19, 0.02, s === length ? 0.8 : 0.18]}
            c="#f7e6b9"
          />
          {[-10.5, 10.5].map((x) => (
            <group key={x}>
              <Cylinder p={[x, 2.5, 0]} s={[0.11, 5, 0.11]} c="#a38d66" />
              <Box
                p={[x + (x < 0 ? 1 : -1), 4.5, 0]}
                s={[2, 0.8, 0.08]}
                c={s === length ? "#e7aa47" : "#e7d5ad"}
              />
            </group>
          ))}
          {s === length && (
            <>
              <Box p={[0, 5, 0]} s={[21, 0.15, 0.15]} c="#b3a17c" />
              <Sign text="FINISH" p={[0, 4.6, 0.15]} size={[5, 1]} />
              {Array.from({ length: 16 }, (_, i) => (
                <Box
                  key={i}
                  p={[-9.4 + i * 1.25, 4.6, 0]}
                  s={[0.9, 0.55, 0.07]}
                  c={i % 2 ? "#edc564" : "#345a58"}
                />
              ))}
            </>
          )}
          {s > 0 && s < length && (
            <Sign text={`${s}`} p={[-11.5, 2.7, 0.15]} size={[1.7, 0.85]} />
          )}
        </group>
      ))}
    </group>
  );
}
export function Rowing() {
  const state = useRef({ ...newRace(), x: 2.5 }),
    rivals = useRef(newRivals()),
    accumulator = useRef(0),
    nextHud = useRef(0),
    done = useRef(false),
    id = useRef(newRunId());
  const length = runtime.raceLength,
    seed = runtime.raceSeed;
  const record = useRef(
    readRaceRecord(length, seed, undefined, useGame.getState().save.bestRace),
  );
  const look = useRef(new THREE.Vector3(0, 0, -8));
  const desired = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }, delta) => {
    const game = useGame.getState();
    if (game.paused || game.result || game.panel !== "none" || !runtime.active)
      return;
    accumulator.current += Math.min(delta, 0.1);
    while (accumulator.current >= TICK) {
      const steer =
        Number(keys.has("d") || keys.has("arrowright")) -
          Number(keys.has("a") || keys.has("arrowleft")) || runtime.steer;
      state.current = stepRace(
        state.current,
        {
          steer,
          cadence: runtime.raceCadence,
          burst: keys.has(" ") || runtime.burst,
        },
        length,
        seed,
      );
      rivals.current = rivals.current.map((rival, i) =>
        stepRace(rival, rivalInput(rival, i, length, seed), length, seed),
      );
      accumulator.current -= TICK;
    }
    const s = state.current;
    const place = racePlace(s, rivals.current);
    desired.set(s.x * 0.65 + 1.5, 10.5, -s.distance + 19);
    camera.position.lerp(desired, 1 - Math.exp(-delta * 4));
    desired.set(
      s.x * 0.55 + riverCenter(s.distance + 22, seed) * 0.45,
      0,
      -s.distance - 10,
    );
    look.current.lerp(desired, 1 - Math.exp(-delta * 5));
    camera.lookAt(look.current);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = window.innerWidth < 700 ? 72 : 55;
      camera.updateProjectionMatrix();
    }
    if (s.time > nextHud.current || s.time < 0 || s.finished) {
      const split = s.splits.length - 1;
      useRaceHud.setState({
        race: { ...s },
        place,
        rivals: rivals.current,
        record: record.current,
        splitDelta:
          split >= 0 && record.current?.splits[split] !== undefined
            ? s.splits[split] - record.current.splits[split]
            : null,
      });
      nextHud.current = s.time + 0.1;
    }
    if (s.finished && !done.current) {
      done.current = true;
      const coins = 45 + (4 - place) * 10 + (length > 400 ? 25 : 0),
        best = game.save.bestRace;
      const personalBest =
        (!record.current || s.time < record.current.time) &&
        saveRaceRecord(s, length, seed);
      game.award(id.current, coins, 30, {
        bestRace:
          length === 360 && seed === 1
            ? Math.min(best ?? Infinity, s.time)
            : best,
      });
      useGame.setState({
        result: {
          game: "rowing",
          title: place === 1 ? "Race won" : "Race complete",
          score: raceTime(s.time),
          coins,
          detail: `${place}${["st", "nd", "rd", "th"][place - 1]} · ${length} m${personalBest ? " · Personal best" : ""}`,
        },
      });
      sound("win");
    }
  });
  return (
    <>
      <River length={length} seed={seed} />
      <CurrentFlow state={() => state.current} seed={seed} />
      <RowingShell state={() => state.current} color="#efc259" player />
      {["#dc7656", "#4a9485", "#7186bd"].map((color, i) => (
        <RowingShell
          key={color}
          state={() => rivals.current[i]}
          color={color}
        />
      ))}
    </>
  );
}
