import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { HALF_WIDTH, SHALLOWS, toPlan, type Course } from "../core/rowCourse";

/** A course-space ribbon: (s, d) → world (x, z = −y), built once. */
export function courseRibbon(course: Course, d0: number, d1: number, step = 2, y = 0, extra = 0) {
  const p = { x: 0, y: 0 };
  const rows = Math.ceil((course.length + (course.closed ? 0 : extra * 2)) / step) + 1;
  const pos = new Float32Array(rows * 2 * 3),
    river = new Float32Array(rows * 2 * 2);
  for (let i = 0; i < rows; i++) {
    const s = course.closed ? Math.min(course.length, i * step) : i * step - extra;
    for (let k = 0; k < 2; k++) {
      const d = k ? d1 : d0;
      toPlan(course, Math.max(0, Math.min(course.length, s)), d, p);
      // Past the ends of a point-to-point course, run straight on.
      let x = p.x,
        z = -p.y;
      if (!course.closed && (s < 0 || s > course.length)) {
        const at = s < 0 ? 0 : course.length;
        const h = course.h[s < 0 ? 0 : course.n - 1];
        const over = s - at;
        x += Math.cos(h) * over;
        z -= Math.sin(h) * over;
      }
      pos.set([x, y, z], (i * 2 + k) * 3);
      river.set([d, s], (i * 2 + k) * 2);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < rows - 1; i++) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aRiver", new THREE.BufferAttribute(river, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** The course water: deep in the channel, pale over the shallows, ripples. */
export function RowingWater({ course, time }: { course: Course; time: () => number }) {
  const uniforms = useMemo(
    () => ({
      uRaceTime: { value: 0 },
      uDeep: { value: new THREE.Color("#0b5a70") },
      uShallow: { value: new THREE.Color("#5fa7a0") },
      uEdges: { value: new THREE.Vector2(SHALLOWS, HALF_WIDTH) },
    }),
    [],
  );
  const geometry = useMemo(() => courseRibbon(course, -HALF_WIDTH - 5, HALF_WIDTH + 5, 2, -0.1, 80), [course]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    uniforms.uRaceTime.value = Math.max(0, time());
  });
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        color="#ffffff"
        roughness={0.33}
        metalness={0.05}
        side={THREE.DoubleSide}
        onBeforeCompile={(shader) => {
          Object.assign(shader.uniforms, uniforms);
          shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nattribute vec2 aRiver;\nvarying vec2 vRiver;")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRiver = aRiver;");
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nvarying vec2 vRiver;\nuniform float uRaceTime;\nuniform vec3 uDeep;\nuniform vec3 uShallow;\nuniform vec2 uEdges;",
            )
            .replace(
              "#include <color_fragment>",
              `#include <color_fragment>
          float ad = abs(vRiver.x);
          float shoal = smoothstep(uEdges.x - 0.6, uEdges.x + 0.4, ad);
          float ripples = sin(vRiver.x * 2.4 + vRiver.y * 0.73 + uRaceTime * 2.2) * sin(vRiver.y * 1.8 - vRiver.x * 0.9 + uRaceTime * 1.3);
          float lane = 1.0 - smoothstep(0.0, 0.08, abs(fract(vRiver.y / 6.0) - 0.5) - 0.42);
          diffuseColor.rgb = mix(uDeep, uShallow, shoal * 0.75);
          diffuseColor.rgb *= 0.96 + ripples * 0.045;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.9, 0.78), lane * step(uEdges.y - 0.25, ad) * step(ad, uEdges.y + 0.05));`,
            )
            .replace(
              "#include <normal_fragment_begin>",
              `#include <normal_fragment_begin>
          normal = normalize(normal + vec3(sin(vRiver.x * 1.7 + vRiver.y * 0.8 + uRaceTime * 1.8) * 0.10, cos(vRiver.y * 1.9 - uRaceTime * 2.0) * 0.055, 0.0));`,
            );
        }}
      />
    </mesh>
  );
}
