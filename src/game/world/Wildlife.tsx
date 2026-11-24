import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { runtime, useGame } from "../core/store";
import { daylightClock } from "../core/timeOfDay";
import { sampleDaylight } from "../core/daylight";
import {
  ANIMALS,
  animalPose,
  birdPose,
  planePose,
  wildlifeClock,
  type Animal,
} from "../core/wildlife";

// A small fixed geometry/material cache, shared by all wildlife and remounts.
const sphere = new THREE.SphereGeometry(1, 10, 7);
const box = new THREE.BoxGeometry();
const cone = new THREE.ConeGeometry(1, 1, 5);
const materials = new Map<string, THREE.MeshStandardMaterial>();
function Part({
  p = [0, 0, 0],
  s,
  c,
  shape = "round",
  r = [0, 0, 0],
  shadow = true,
}: {
  p?: [number, number, number];
  s: [number, number, number];
  c: string;
  shape?: "round" | "box" | "cone";
  r?: [number, number, number];
  shadow?: boolean;
}) {
  if (!materials.has(c))
    materials.set(
      c,
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.88 }),
    );
  return (
    <mesh
      position={p}
      scale={s}
      rotation={r}
      geometry={shape === "round" ? sphere : shape === "cone" ? cone : box}
      material={materials.get(c)}
      castShadow={shadow}
      receiveShadow={shadow}
      dispose={null}
    />
  );
}

function Eyes({
  width = 0.19,
  z = 0.84,
  y = 0.87,
}: {
  width?: number;
  z?: number;
  y?: number;
}) {
  return (
    <>
      {[-1, 1].map((side) => (
        <Part
          key={side}
          p={[side * width, y, z]}
          s={[0.035, 0.045, 0.035]}
          c="#29342f"
        />
      ))}
    </>
  );
}

function LandAnimal({ animal }: { animal: Animal }) {
  const group = useRef<THREE.Group>(null);
  const rabbit = animal.kind === "rabbit",
    dog = animal.kind === "dog";
  const c = animal.color;
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const t = wildlifeClock.seconds,
      pose = animalPose(animal, t);
    g.position.set(
      pose.x,
      0.23 + (rabbit && pose.moving ? Math.abs(Math.sin(t * 7)) * 0.18 : 0),
      pose.z,
    );
    const difference = Math.atan2(
      Math.sin(pose.heading - g.rotation.y),
      Math.cos(pose.heading - g.rotation.y),
    );
    g.rotation.y += difference * (1 - Math.exp(-Math.min(delta, 0.05) * 8));
    const legs = g.getObjectByName("legs");
    legs?.children.forEach((leg, i) => {
      leg.rotation.x = pose.moving
        ? Math.sin(t * (dog ? 8 : 7) + (i % 3 ? Math.PI : 0)) * 0.45
        : 0;
    });
    const head = g.getObjectByName("head");
    if (head)
      head.rotation.x = pose.moving
        ? 0
        : Math.sin(t * 1.7 + animal.offset) * 0.14 + 0.12;
    const tail = g.getObjectByName("tail");
    if (tail) tail.rotation.z = Math.sin(t * (dog ? 8 : 2)) * (dog ? 0.3 : 0.1);
  });
  return (
    <group
      ref={group}
      name={`wildlife-${animal.kind}`}
      scale={rabbit ? 0.75 : dog ? 0.95 : 0.85}
    >
      <Part
        p={[0, 0.52, 0]}
        s={[rabbit ? 0.35 : 0.29, 0.35, rabbit ? 0.45 : 0.62]}
        c={c}
      />
      <Part
        p={[0, 0.42, 0.27]}
        s={[0.24, 0.21, 0.31]}
        c={rabbit ? "#f5edda" : c}
      />
      <group name="legs">
        {[-1, 1].flatMap((side) =>
          [-1, 1].map((end) => (
            <group
              key={`${side}:${end}`}
              position={[side * 0.22, 0.35, end * 0.36]}
            >
              <Part p={[0, -0.13, 0]} s={[0.085, 0.22, 0.1]} c={c} />
              <Part
                p={[0, -0.29, 0.06]}
                s={[0.1, 0.07, 0.18]}
                c={rabbit ? "#f5edda" : c}
              />
            </group>
          )),
        )}
      </group>
      <group name="head" position={[0, 0, 0.05]}>
        <Part p={[0, 0.83, 0.59]} s={[0.27, 0.28, 0.3]} c={c} />
        <Part
          p={[0, 0.72, 0.83]}
          s={[0.17, 0.13, dog ? 0.22 : 0.14]}
          c={dog ? "#f1dbb3" : "#f5edda"}
        />
        <Part
          p={[0, 0.78, dog ? 1.02 : 0.96]}
          s={[0.06, 0.04, 0.045]}
          c={rabbit ? "#c78e85" : "#39433a"}
        />
        <Eyes />
        {[-1, 1].map((side) => (
          <group key={side}>
            <Part
              p={[side * 0.18, rabbit ? 1.22 : dog ? 0.87 : 1.08, 0.56]}
              s={
                rabbit
                  ? [0.09, 0.38, 0.1]
                  : dog
                    ? [0.1, 0.25, 0.17]
                    : [0.15, 0.27, 0.13]
              }
              r={[0, 0, side * (rabbit ? -0.14 : 0.2)]}
              c={dog ? "#694c36" : c}
              shape={rabbit || dog ? "round" : "cone"}
            />
            {rabbit && (
              <Part
                p={[side * 0.18, 1.25, 0.646]}
                s={[0.04, 0.26, 0.025]}
                c="#d8a39a"
              />
            )}
          </group>
        ))}
        {dog && <Part p={[0, 0.57, 0.47]} s={[0.31, 0.07, 0.17]} c="#347b77" />}
      </group>
      <group name="tail" position={[0, 0.65, -0.56]}>
        <Part
          p={[0, rabbit ? 0 : 0.25, rabbit ? 0 : -0.12]}
          s={rabbit ? [0.17, 0.17, 0.17] : [0.08, 0.37, 0.08]}
          r={[-0.4, 0, 0]}
          c={rabbit ? "#f8efd9" : c}
        />
      </group>
    </group>
  );
}

function Duck({ animal }: { animal: Animal }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!group.current) return;
    const t = wildlifeClock.seconds,
      pose = animalPose(animal, t);
    group.current.position.set(
      pose.x,
      0.08 + Math.sin(t * 2 + animal.offset) * 0.025,
      pose.z,
    );
    group.current.rotation.y = pose.heading;
  });
  return (
    <group ref={group} name="wildlife-duck">
      <Part p={[0, 0.26, 0]} s={[0.3, 0.25, 0.48]} c={animal.color} />
      <Part p={[0, 0.56, 0.31]} s={[0.19, 0.26, 0.19]} c="#365e49" />
      <Part p={[0, 0.56, 0.54]} s={[0.15, 0.06, 0.18]} c="#d9a13d" />
      {[-1, 1].map((side) => (
        <Part
          key={side}
          p={[side * 0.27, 0.32, -0.04]}
          s={[0.075, 0.15, 0.31]}
          c="#9b8060"
        />
      ))}
      <Eyes width={0.15} z={0.43} y={0.64} />
    </group>
  );
}

function Bird({ index }: { index: number }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = wildlifeClock.seconds,
      pose = birdPose(t, index);
    g.visible = sampleDaylight(daylightClock.hour).night < 0.7;
    g.position.set(pose.x, pose.y, pose.z);
    g.rotation.set(0, pose.heading, pose.bank);
    const flap = Math.sin(t * 6 + index) * 0.5;
    g.children[1].rotation.z = flap;
    g.children[2].rotation.z = -flap;
  });
  return (
    <group ref={group} name="wildlife-bird">
      <Part s={[0.12, 0.13, 0.38]} c="#e9e4d2" shadow={false} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Part
            p={[side * 0.43, 0.03, -0.03]}
            s={[0.5, 0.045, 0.18]}
            r={[0, side * 0.2, 0]}
            c="#56615d"
            shadow={false}
          />
        </group>
      ))}
      <Part
        p={[0, 0, 0.4]}
        s={[0.055, 0.045, 0.15]}
        c="#d9aa50"
        shadow={false}
      />
    </group>
  );
}

function Plane() {
  const group = useRef<THREE.Group>(null),
    prop = useRef<THREE.Group>(null);
  useFrame(() => {
    const pose = planePose(wildlifeClock.seconds);
    if (group.current) {
      group.current.visible = pose.visible;
      group.current.position.set(pose.x, pose.y, pose.z);
      group.current.rotation.set(0, pose.heading, -0.04);
    }
    if (prop.current) prop.current.rotation.z = wildlifeClock.seconds * 48;
  });
  return (
    <group ref={group} name="wildlife-plane">
      <Part s={[0.37, 0.4, 1.8]} c="#e7dec5" shadow={false} />
      <Part
        p={[0, 0.12, 0.35]}
        s={[3.6, 0.1, 0.7]}
        c="#b84534"
        shape="box"
        shadow={false}
      />
      <Part
        p={[0, 0.4, 0.56]}
        s={[0.25, 0.28, 0.4]}
        c="#547d89"
        shadow={false}
      />
      <Part
        p={[0, 0.1, -1.35]}
        s={[1.5, 0.08, 0.45]}
        c="#b84534"
        shape="box"
        shadow={false}
      />
      <Part
        p={[0, 0.48, -1.28]}
        s={[0.09, 0.75, 0.6]}
        c="#b84534"
        shape="box"
        shadow={false}
      />
      <group ref={prop} position={[0, 0, 1.8]}>
        <Part s={[0.07, 1.25, 0.07]} c="#554e42" shape="box" shadow={false} />
        <Part s={[0.12, 0.12, 0.16]} c="#d3a64c" shadow={false} />
      </group>
      {[-1, 1].map((side) => (
        <Part
          key={side}
          p={[side * 0.4, -0.46, 0.45]}
          s={[0.13, 0.18, 0.18]}
          c="#39433a"
          shadow={false}
        />
      ))}
    </group>
  );
}

export function Wildlife() {
  const quality = useGame((s) => s.quality);
  useFrame((_, delta) => {
    if (runtime.active && !useGame.getState().paused && !document.hidden)
      wildlifeClock.seconds += Math.min(delta, 0.05);
  }, -1);
  return (
    <group name="ambient-wildlife">
      {ANIMALS.filter((_, i) => quality === "high" || i % 2 === 0).map(
        (animal, i) =>
          animal.kind === "duck" ? (
            <Duck key={`${animal.kind}:${i}`} animal={animal} />
          ) : (
            <LandAnimal key={`${animal.kind}:${i}`} animal={animal} />
          ),
      )}
      {Array.from({ length: quality === "high" ? 7 : 3 }, (_, i) => (
        <Bird key={i} index={i} />
      ))}
      <Plane />
    </group>
  );
}
