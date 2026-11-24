import { useEffect, useMemo } from "react";
import type { ComponentProps } from "react";
import * as THREE from "three";
import {
  campusDistrictOffsetZ,
  campusDistrictScale,
} from "../core/campusDistrict";
import { campusDistrictParts } from "./CampusDistrictArt";
import { CampusDistrictParts } from "./CampusDistrictParts";
import { Sign } from "./Models";

/** Locally drawn block-S identifier; no downloaded university artwork. */
function CampusIdentifier() {
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
  return (
    <group position={[23, 8.2, -16]}>
      {[0, 1, 2, 3].map((side) => (
        <group key={side} rotation={[0, (side * Math.PI) / 2, 0]}>
          <mesh position={[0, 0, 2.3]}>
            <planeGeometry args={[2.6, 2.6]} />
            <meshBasicMaterial map={texture} transparent alphaTest={0.1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Two independent readable faces, never mirrored text on a DoubleSide plane. */
function CampusSign({ p, ...props }: ComponentProps<typeof Sign>) {
  return (
    <group position={p}>
      <Sign {...props} p={[0, 0, 0.025]} />
      <group rotation={[0, Math.PI, 0]}>
        <Sign {...props} p={[0, 0, 0.025]} />
      </group>
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
      <CampusIdentifier />
      <CampusSign
        text="STANFORD"
        p={[0, 0.95, 31]}
        size={[5.8, 0.9]}
        color="#8c332b"
        ink="#f0dba7"
      />
      <CampusSign
        text="STANFORD"
        p={[0, 7.1, -28]}
        size={[5.8, 0.9]}
        color="#8c332b"
        ink="#f0dba7"
      />
      <CampusSign text="MAIN QUAD" p={[0, 0.65, 4.5]} size={[3.8, 0.6]} />
      <CampusSign text="MAIN QUAD" p={[9.6, 3.3, -25.4]} size={[3.8, 0.6]} />
      <CampusSign
        text="HOOVER TOWER"
        p={[23, 10.1, -18.2]}
        size={[3.7, 0.55]}
      />
      <CampusSign text="LIBRARY" p={[-23, 3, -5.9]} size={[3.8, 0.6]} />
      <CampusSign text="LIBRARY" p={[-23, 3.8, -22.5]} size={[3.8, 0.6]} />
      <CampusSign text="THE OVAL" p={[0, 0.65, 12.2]} size={[3.3, 0.6]} />
    </group>
  );
}
