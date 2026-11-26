import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import {
  allCrowns,
  crownVersion,
  layoutCards,
  leafAtlas,
  leafDepthMaterial,
  leafMaterial,
  leafUniforms,
  subscribeCrowns,
} from "./foliage";
import { ENV_DENSITY, useEnvTier } from "./tier";

const CAPACITY = 24_000;
const material = leafMaterial();
const depthMaterial = leafDepthMaterial();
const noRaycast = () => undefined;

/** One instanced draw of leaf-cluster cards for every registered crown. */
export function LeafShell() {
  const version = useSyncExternalStore(subscribeCrowns, crownVersion, crownVersion);
  const tier = useEnvTier();
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.setAttribute(
      "aLeaf",
      new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4),
    );
    plane.setAttribute(
      "aCell",
      new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1),
    );
    return plane;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    if (!leafUniforms.uLeafAtlas.value) leafUniforms.uLeafAtlas.value = leafAtlas();
  }, []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    void version;
    if (!mesh.instanceColor)
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(CAPACITY * 3),
        3,
      );
    const cards = layoutCards(allCrowns()).slice(0, CAPACITY);
    const leaf = geometry.getAttribute("aLeaf") as THREE.InstancedBufferAttribute;
    const cell = geometry.getAttribute("aCell") as THREE.InstancedBufferAttribute;
    const matrix = new THREE.Matrix4(),
      scale = new THREE.Vector3();
    cards.forEach((card, i) => {
      scale.setScalar(card.size);
      matrix.compose(card.p, card.q, scale);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, card.color);
      leaf.setXYZW(i, card.centre.x, card.centre.y, card.centre.z, card.phase);
      cell.setX(i, card.cell);
    });
    mesh.count = Math.round(cards.length * ENV_DENSITY[tier].leaves);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    leaf.needsUpdate = true;
    cell.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [version, geometry, tier]);
  return (
    <instancedMesh
      ref={ref}
      name="env-leaf-shell"
      args={[geometry, material, CAPACITY]}
      customDepthMaterial={depthMaterial}
      castShadow
      receiveShadow
      frustumCulled={false}
      raycast={noRaycast}
      dispose={null}
    />
  );
}
