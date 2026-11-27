import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Box } from "./Models";

/** Greedy word wrap with a measuring function (pure; tested). */
export function wrapWords(text: string, width: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * An engraved brass plaque in a timber frame, carrying a paragraph. The
 * face uses the same material recipe as the village's painted signs (a
 * canvas map on a standard material), so it compiles nothing new.
 */
export function Plaque({
  text,
  title,
  p,
  size,
}: {
  text: string;
  title?: string;
  p: [number, number, number];
  size: [number, number];
}) {
  const texture = useMemo(() => {
    const w = 1024,
      h = Math.round((w * size[1]) / size[0]);
    const el = document.createElement("canvas");
    el.width = w;
    el.height = h;
    const ctx = el.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#d9b46a");
    g.addColorStop(0.5, "#c69a4f");
    g.addColorStop(1, "#a97f3c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#7a5a2a";
    ctx.lineWidth = 10;
    ctx.strokeRect(22, 22, w - 44, h - 44);
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 40, w - 80, h - 80);
    ctx.fillStyle = "#3e2c14";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    let y = 70;
    if (title) {
      ctx.font = '700 64px Georgia, "Times New Roman", serif';
      y += 64;
      ctx.fillText(title, w / 2, y, w - 140);
      ctx.fillRect(w / 2 - 120, y + 22, 240, 4);
      y += 40;
    }
    const size2 = title ? 44 : 48;
    ctx.font = `500 ${size2}px Georgia, "Times New Roman", serif`;
    const lines = wrapWords(text, w - 170, (s) => ctx.measureText(s).width);
    const lead = size2 * 1.32;
    y = Math.max(y + lead, (h - lines.length * lead) / 2 + size2 + (title ? 50 : 0));
    for (const line of lines) {
      ctx.fillText(line, w / 2, y, w - 150);
      y += lead;
    }
    const t = new THREE.CanvasTexture(el);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [text, title, size]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={p}>
      <Box s={[size[0] + 0.28, size[1] + 0.28, 0.16]} c="#4f3a28" />
      <mesh position={[0, 0, 0.085]}>
        <planeGeometry args={size} />
        <meshStandardMaterial map={texture} roughness={0.75} transparent />
      </mesh>
    </group>
  );
}
