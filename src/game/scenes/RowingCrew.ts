import * as THREE from "three";
import { chamferBoxGeometry } from "../world/chamferBox";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type Vec3 = [number, number, number];

/** One colored mesh per rower, rather than a draw call for every small detail. */
export function makeRower(jersey: string, skin: string, cap: string) {
  const box = chamferBoxGeometry(0.1);
  const ball = new THREE.SphereGeometry(1, 10, 8);
  const parts: THREE.BufferGeometry[] = [];
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const add = (unit: THREE.BufferGeometry, p: Vec3, s: Vec3, c: string) => {
    const geometry = unit.index ? unit.toNonIndexed() : unit.clone();
    matrix.compose(new THREE.Vector3(...p), rotation, new THREE.Vector3(...s));
    geometry.applyMatrix4(matrix);
    const color = new THREE.Color(c);
    const colors = new Float32Array(
      geometry.getAttribute("position").count * 3,
    );
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    parts.push(geometry);
  };
  add(box, [0, 0.02, 0], [0.4, 0.13, 0.35], "#263e46");
  add(ball, [0, 0.3, 0], [0.26, 0.3, 0.2], jersey);
  add(box, [0, 0.15, 0], [0.4, 0.22, 0.29], jersey);
  add(box, [0, 0.34, 0.18], [0.38, 0.075, 0.045], "#eee3c6");
  add(ball, [0, 0.54, 0], [0.09, 0.1, 0.09], skin);
  add(ball, [0, 0.65, 0], [0.2, 0.23, 0.2], skin);
  add(ball, [0, 0.64, 0.18], [0.055, 0.06, 0.055], skin);
  add(ball, [0, 0.78, 0], [0.205, 0.12, 0.21], cap);
  add(box, [0, 0.79, 0.19], [0.32, 0.045, 0.23], cap);
  for (const side of [-1, 1]) {
    add(ball, [side * 0.075, 0.7, 0.18], [0.025, 0.025, 0.018], "#253b40");
    add(ball, [side * 0.24, 0.41, 0.04], [0.135, 0.14, 0.145], jersey);
    add(box, [side * 0.23, 0.3, 0.23], [0.11, 0.13, 0.48], skin);
    add(ball, [side * 0.23, 0.3, 0.45], [0.085, 0.085, 0.09], skin);
    add(box, [side * 0.13, 0.03, 0.3], [0.13, 0.13, 0.51], "#29434c");
    add(box, [side * 0.13, 0.04, 0.58], [0.15, 0.14, 0.23], "#e2d9bb");
  }
  const result = mergeGeometries(parts);
  for (const geometry of [...parts, box, ball]) geometry.dispose();
  if (!result) throw new Error("Unable to build rowing crew geometry");
  return result;
}
