import { useEffect, useMemo } from "react";
import * as THREE from "three";

type Nation = "us" | "kr" | "stanford";

function star(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
) {
  ctx.beginPath();
  for (let point = 0; point < 10; point++) {
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    const r = point % 2 ? radius * 0.382 : radius;
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fill();
}

/** Original drawing from the national construction guides, not emoji glyphs. */
function drawFlag(nation: Nation) {
  const canvas = document.createElement("canvas");
  canvas.width = nation === "us" ? 760 : 600;
  canvas.height = 400;
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  if (nation === "stanford") {
    // Cardinal field with a white block S and the campus evergreen.
    ctx.fillStyle = "#8c1515";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 270px Georgia, 'Times New Roman', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("S", width / 2, height / 2 + 12);
    const tx = width / 2,
      ty = height / 2;
    ctx.fillStyle = "#175e54";
    ctx.fillRect(tx - 9, ty + 40, 18, 62);
    for (let layer = 0; layer < 4; layer++) {
      const spread = 78 - layer * 14,
        top = ty - 130 + layer * 42,
        base = top + 62;
      ctx.beginPath();
      ctx.moveTo(tx, top);
      ctx.lineTo(tx - spread, base);
      ctx.lineTo(tx + spread, base);
      ctx.closePath();
      ctx.fill();
    }
  } else if (nation === "us") {
    // 13 stripes, and nine alternating rows of six/five stars: exactly 50.
    ctx.fillStyle = "#b31942";
    for (let stripe = 0; stripe < 13; stripe += 2)
      ctx.fillRect(0, (stripe * height) / 13, width, height / 13);
    const cantonW = height * 0.76;
    const cantonH = (height * 7) / 13;
    ctx.fillStyle = "#0a3161";
    ctx.fillRect(0, 0, cantonW, cantonH);
    ctx.fillStyle = "#ffffff";
    for (let row = 0; row < 9; row++)
      for (let col = 0; col < (row % 2 ? 5 : 6); col++)
        star(
          ctx,
          ((col * 2 + (row % 2 ? 2 : 1)) * cantonW) / 12,
          ((row + 1) * cantonH) / 10,
          height * 0.0308,
        );
  } else {
    // Taegeuk: diameter H/2, on the flag's descending diagonal.
    const angle = Math.atan2(height, width);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(angle);
    ctx.fillStyle = "#cd2e3a";
    ctx.beginPath();
    ctx.arc(0, 0, 100, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0047a0";
    ctx.beginPath();
    ctx.arc(0, 0, 100, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = "#cd2e3a";
    ctx.beginPath();
    ctx.arc(-50, 0, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0047a0";
    ctx.beginPath();
    ctx.arc(50, 0, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Geon (NW), gon (SE), gam (NE), ri (SW). 1 = a broken bar.
    const trigrams = [
      { x: -1, y: -1, bars: [0, 0, 0] },
      { x: 1, y: 1, bars: [1, 1, 1] },
      { x: 1, y: -1, bars: [1, 0, 1] },
      { x: -1, y: 1, bars: [0, 1, 0] },
    ];
    ctx.fillStyle = "#111111";
    for (const { x, y, bars } of trigrams) {
      ctx.save();
      ctx.translate(width / 2 + x * 152.55, height / 2 + y * 101.7);
      ctx.rotate(x === y ? angle - Math.PI / 2 : Math.PI / 2 - angle);
      bars.forEach((broken, row) => {
        const barY = -100 / 3 + row * 25;
        if (broken) {
          ctx.fillRect(-50, barY, 45.833, 100 / 6);
          ctx.fillRect(4.167, barY, 45.833, 100 / 6);
        } else ctx.fillRect(-50, barY, 100, 100 / 6);
      });
      ctx.restore();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function NationalFlag({
  nation,
  p = [0, 0, 0],
  height = 2.8,
}: {
  nation: Nation;
  p?: [number, number, number];
  height?: number;
}) {
  const texture = useMemo(() => drawFlag(nation), [nation]);
  const flag = useMemo(() => {
    const h = height * 0.33;
    const w = h * (nation === "us" ? 1.9 : 1.5);
    const geometry = new THREE.PlaneGeometry(w, h, 16, 4);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const along = positions.getX(i) / w + 0.5;
      positions.setXYZ(
        i,
        along * w,
        positions.getY(i) - along * along * h * 0.08,
        Math.sin(along * Math.PI * 2.5) * along * h * 0.12,
      );
    }
    geometry.computeVertexNormals();
    return geometry;
  }, [height, nation]);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => () => flag.dispose(), [flag]);
  return (
    <group
      position={p}
      name={`${
        nation === "us"
          ? "United States"
          : nation === "kr"
            ? "South Korea"
            : "Stanford"
      } flag`}
    >
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.045, height, 10]} />
        <meshStandardMaterial
          color="#d4d6ca"
          roughness={0.5}
          metalness={0.35}
        />
      </mesh>
      <mesh position={[0, height + 0.04, 0]} castShadow>
        <sphereGeometry args={[0.085, 10, 8]} />
        <meshStandardMaterial
          color="#d7b35d"
          roughness={0.55}
          metalness={0.35}
        />
      </mesh>
      <mesh position={[0.035, height * 0.78, 0]} geometry={flag} castShadow>
        <meshStandardMaterial
          map={texture}
          roughness={0.88}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
