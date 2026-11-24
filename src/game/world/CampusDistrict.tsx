import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  campusDistrictOffsetZ,
  campusDistrictScale,
} from "../core/campusDistrict";
import { campusDistrictParts } from "./CampusDistrictArt";
import { CampusDistrictParts } from "./CampusDistrictParts";
import { HooverTowerDoor } from "./HooverTowerDoor";
import { sculptedMaterial } from "./Surface";

type CampusPlaque = {
  text: string;
  p: [number, number, number];
  size: [number, number];
  color?: string;
  ink?: string;
};
const plaques: CampusPlaque[] = [
  {
    text: "STANFORD",
    p: [0, 0.95, 31],
    size: [5.8, 0.9],
    color: "#8c332b",
    ink: "#f0dba7",
  },
  {
    text: "STANFORD",
    p: [0, 7.1, -28],
    size: [5.8, 0.9],
    color: "#8c332b",
    ink: "#f0dba7",
  },
  { text: "MAIN QUAD", p: [-7, 3.25, 5.65], size: [3.8, 0.6] },
  { text: "MAIN QUAD", p: [9.6, 3.3, -25.4], size: [3.8, 0.6] },
  { text: "HOOVER TOWER", p: [23, 10.1, -18.2], size: [3.7, 0.55] },
  { text: "LIBRARY", p: [-23, 3, -5.9], size: [3.8, 0.6] },
  { text: "LIBRARY", p: [-23, 3.8, -22.5], size: [3.8, 0.6] },
  { text: "THE OVAL", p: [0, 0.65, 12.2], size: [3.3, 0.6] },
];
const plaqueBatches = [...new Set(plaques.map((plaque) => plaque.text))].map(
  (text) => plaques.filter((plaque) => plaque.text === text),
);

// Same rounded geometry/material as Models.Sign; merge static backings only.
const backingPieces = plaques.flatMap(({ p: [x, y, z], size }) =>
  [0, 1].map((side) => {
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z + (side ? -0.025 : 0.025)),
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        side * Math.PI,
      ),
      new THREE.Vector3(1, 1, 1),
    );
    return new RoundedBoxGeometry(
      size[0] + 0.1,
      size[1] + 0.1,
      0.14,
      2,
      0.14 * 0.22,
    ).applyMatrix4(transform);
  }),
);
const plaqueBacking = mergeGeometries(backingPieces);
backingPieces.forEach((geometry) => geometry.dispose());
const plaqueBackingMaterial = sculptedMaterial({ color: "#493d2e" });

/** Identical shared Sign lettering and lighting, one draw per distinct label. */
function PlaqueFaces({ batch }: { batch: CampusPlaque[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { texture, geometry, material } = useMemo(() => {
    const { text, size, color = "#faf0d7", ink = "#414e3b" } = batch[0];
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = color;
    ctx.fillRect(6, 6, 500, 116);
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 3;
    ctx.strokeRect(15, 15, 482, 98);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '700 42px "Trebuchet MS", sans-serif';
    ctx.fillText(text, 256, 67, 458);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const geometry = new THREE.PlaneGeometry(...size);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.75,
      transparent: true,
    });
    return { texture, geometry, material };
  }, [batch]);
  useEffect(
    () => () => {
      texture.dispose();
      geometry.dispose();
      material.dispose();
    },
    [texture, geometry, material],
  );
  useLayoutEffect(() => {
    const object = new THREE.Object3D();
    const mesh = ref.current!;
    batch.forEach(({ p: [x, y, z] }, i) => {
      for (const side of [0, 1]) {
        // Shared Sign face sits 0.076 beyond its ±0.025 backing origin.
        object.position.set(x, y, z + (side ? -0.101 : 0.101));
        object.rotation.set(0, side * Math.PI, 0);
        object.updateMatrix();
        mesh.setMatrixAt(i * 2 + side, object.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [batch]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, batch.length * 2]}
      dispose={null}
    />
  );
}

/** Locally drawn block-S identifier; no downloaded university artwork. */
function CampusIdentifier() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#8c1515";
    ctx.beginPath();
    [
      [78, 26],
      [177, 26],
      [200, 50],
      [200, 92],
      [155, 92],
      [155, 70],
      [103, 70],
      [103, 108],
      [177, 108],
      [200, 131],
      [200, 207],
      [177, 230],
      [78, 230],
      [55, 207],
      [55, 163],
      [100, 163],
      [100, 187],
      [155, 187],
      [155, 150],
      [78, 150],
      [55, 127],
      [55, 50],
    ].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    [
      [129, 30],
      [157, 93],
      [145, 93],
      [176, 139],
      [157, 139],
      [192, 188],
      [142, 188],
      [142, 235],
      [119, 235],
      [119, 188],
      [70, 188],
      [105, 139],
      [86, 139],
      [117, 93],
      [105, 93],
    ].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.lineWidth = 9;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#f6ead1";
    ctx.stroke();
    ctx.fillStyle = "#28664d";
    ctx.fill();
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    return result;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  useLayoutEffect(() => {
    const object = new THREE.Object3D();
    const mesh = ref.current!;
    for (let side = 0; side < 4; side++) {
      const angle = (side * Math.PI) / 2;
      object.position.set(Math.sin(angle) * 2.3, 0, Math.cos(angle) * 2.3);
      object.rotation.set(0, angle, 0);
      object.updateMatrix();
      mesh.setMatrixAt(side, object.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);
  return (
    <group position={[23, 8.2, -16]}>
      <instancedMesh ref={ref} args={[undefined, undefined, 4]}>
        <planeGeometry args={[2.6, 2.6]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.1} />
      </instancedMesh>
    </group>
  );
}

/** Local parcel only: mounting, orientation and world bounds belong to Landscape. */
export function CampusDistrict() {
  return (
    <group
      position={[0, 0, campusDistrictOffsetZ]}
      scale={[...campusDistrictScale]}
    >
      <CampusDistrictParts parts={campusDistrictParts} />
      <HooverTowerDoor />
      <CampusIdentifier />
      <mesh
        geometry={plaqueBacking}
        material={plaqueBackingMaterial}
        castShadow
        receiveShadow
        dispose={null}
      />
      {plaqueBatches.map((batch) => (
        <PlaqueFaces key={batch[0].text} batch={batch} />
      ))}
    </group>
  );
}
