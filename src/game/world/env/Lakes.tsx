import { useMemo } from "react";
import * as THREE from "three";
import type { P2 } from "../../core/coast";
import type { WorldId } from "../../core/worlds";
import { bakeShoreMap, waterMaterial } from "../GlossKit";
import { sculptedMaterial } from "../Surface";
import { lakesFor, lipLoop, type Lake } from "./placement";

/**
 * Home's lowered cove shelves become still lakes held by a low granite lip:
 * the reference's lakeside, set into land nobody walks on. Each lake gets a
 * baked shore map (depth tint, lapping foam, bank reflections) and one draw;
 * every lip of the island is one merged mesh.
 */

function surface(lake: Lake) {
  const shape = new THREE.Shape(lake.outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, lake.y, 0);
  return geometry;
}

const lipColor = new THREE.Color("#9d9b94"),
  lipTop = new THREE.Color("#b1ada2");
function lips(lakes: readonly Lake[]) {
  const positions: number[] = [],
    colors: number[] = [];
  const push = (a: number[], b: number[], c: number[], color: THREE.Color, shade: number) => {
    positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) colors.push(color.r * shade, color.g * shade, color.b * shade);
  };
  for (const lake of lakes) {
    const inner = lake.outline;
    const outer: readonly P2[] = lipLoop(inner);
    const top = lake.y + 0.09,
      foot = lake.floorY - 0.04;
    const n = inner.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const shade = 0.9 + 0.12 * Math.sin(i * 2.7) * Math.sin(i * 0.9);
      const [ax, az] = inner[i],
        [bx, bz] = inner[j],
        [cx, cz] = outer[i],
        [dx, dz] = outer[j];
      // Inner wall (faces the water), top coping, outer wall.
      push([ax, foot, az], [ax, top, az], [bx, foot, bz], lipColor, shade * 0.86);
      push([bx, foot, bz], [ax, top, az], [bx, top, bz], lipColor, shade * 0.86);
      push([ax, top, az], [cx, top + 0.03, cz], [bx, top, bz], lipTop, shade);
      push([bx, top, bz], [cx, top + 0.03, cz], [dx, top + 0.03, dz], lipTop, shade);
      push([cx, foot - 0.1, cz], [dx, foot - 0.1, dz], [cx, top + 0.03, cz], lipColor, shade * 0.8);
      push([dx, foot - 0.1, dz], [dx, top + 0.03, dz], [cx, top + 0.03, cz], lipColor, shade * 0.8);
    }
  }
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const lipMaterial = sculptedMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 });
const noRaycast = () => undefined;

type Built = { lakes: { geometry: THREE.BufferGeometry; material: THREE.Material }[]; lip: THREE.BufferGeometry | null };
const built = new Map<WorldId, Built>();
function build(world: WorldId): Built {
  let value = built.get(world);
  if (value) return value;
  const lakes = lakesFor(world);
  value = {
    lakes: lakes.map((lake) => ({
      geometry: surface(lake),
      material: waterMaterial({
        color: "#3f9db0",
        deep: "#1f5f78",
        shallow: "#86cbbf",
        bank: "#5a6e3c",
        shore: "map",
        shoreMap: bakeShoreMap(lake.outline, 3.2),
        scale: 0.8,
        flow: [0.22, 0.14],
        foam: 0.85,
      }),
    })),
    lip: lips(lakes),
  };
  built.set(world, value);
  return value;
}

export function Lakes({ world }: { world: WorldId }) {
  const { lakes, lip } = useMemo(() => build(world), [world]);
  return (
    <group name="env-lakes">
      {lakes.map(({ geometry, material }, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={material}
          receiveShadow
          raycast={noRaycast}
          dispose={null}
        />
      ))}
      {lip && (
        <mesh
          geometry={lip}
          material={lipMaterial}
          castShadow
          receiveShadow
          raycast={noRaycast}
          dispose={null}
        />
      )}
    </group>
  );
}
