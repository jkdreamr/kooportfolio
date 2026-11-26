import * as THREE from "three";
import { gloss } from "../GlossKit";

/**
 * Korea signage: one procedural canvas atlas (Hangul shop signs, the
 * apartment numbers, a white cell for lit windows) and ONE self-lit material
 * for every sign, window and light strip in the district. Night comes from
 * the shared `gloss.night` uniform, so nothing here runs per frame.
 *
 * Per-vertex `aLight` = (day brightness, night brightness, warm window glow):
 * signs stay softly lit by day and brighten a little after dusk; windows are
 * dark glass by day and pick up a warm interior colour at night. No bloom is
 * needed (or wanted) for any of it.
 */

type Cell = readonly [number, number, number, number];
const W = 1024,
  H = 512;
const cells = {
  store: [0, 0, 384, 96],
  pocha: [384, 0, 384, 96],
  subway: [768, 0, 256, 96],
  n101: [0, 96, 160, 96],
  n102: [160, 96, 160, 96],
  n103: [320, 96, 160, 96],
  bus: [480, 96, 160, 96],
  ad: [640, 96, 192, 96],
  white: [840, 104, 48, 48],
  cafe: [896, 96, 128, 96],
  gate: [0, 192, 96, 256],
  ddp: [96, 192, 256, 64],
  stripes: [96, 256, 256, 64],
} as const satisfies Record<string, Cell>;
export type SignCell = keyof typeof cells;

const FONT =
  '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR","Noto Sans CJK KR","WenQuanYi Zen Hei","Nanum Gothic",sans-serif';

function paint(ctx: CanvasRenderingContext2D) {
  const fill = ([x, y, w, h]: Cell, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  const text = (
    [x, y, w, h]: Cell,
    value: string,
    color: string,
    size: number,
    dx = 0,
    weight = 700,
  ) => {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(value, x + w / 2 + dx, y + h / 2 + size * 0.04);
  };
  fill([0, 0, W, H], "#f4efe4");
  // Convenience store fascia: a quiet teal band, no chain branding.
  fill(cells.store, "#1f6f73");
  fill([0, 78, 384, 18], "#f2b84b");
  text(cells.store, "편의점", "#fbf7ec", 54, -46);
  text(cells.store, "24", "#f2b84b", 50, 112, 800);
  // Pojangmacha: the classic white-on-red tent sign.
  fill(cells.pocha, "#b8352b");
  text(cells.pocha, "포장마차", "#fff4dc", 58);
  // Subway: navy panel, white Hangul, a violet line roundel.
  fill(cells.subway, "#23314f");
  text(cells.subway, "지하철", "#ffffff", 46, -36);
  ctx.fillStyle = "#8b4fb3";
  ctx.beginPath();
  ctx.arc(768 + 206, 48, 32, 0, Math.PI * 2);
  ctx.fill();
  text([768 + 174, 16, 64, 64], "5", "#ffffff", 44, 0, 800);
  // Painted apartment block numbers on the warm white render.
  for (const [cell, label] of [
    [cells.n101, "101"],
    [cells.n102, "102"],
    [cells.n103, "103"],
  ] as const) {
    fill(cell, "#ece5d8");
    text(cell, label, "#5b6a74", 74, 0, 800);
  }
  fill(cells.bus, "#2f68b0");
  text(cells.bus, "버스", "#ffffff", 50);
  // Bus-shelter light box: a soft painted landscape, no words.
  const [ax, ay, aw, ah] = cells.ad;
  const sky = ctx.createLinearGradient(0, ay, 0, ay + ah);
  sky.addColorStop(0, "#f7c98b");
  sky.addColorStop(1, "#e9876b");
  ctx.fillStyle = sky;
  ctx.fillRect(ax, ay, aw, ah);
  ctx.fillStyle = "#6f8f7a";
  ctx.beginPath();
  ctx.moveTo(ax, ay + ah);
  ctx.lineTo(ax + 50, ay + 50);
  ctx.lineTo(ax + 96, ay + 70);
  ctx.lineTo(ax + 140, ay + 40);
  ctx.lineTo(ax + aw, ay + 64);
  ctx.lineTo(ax + aw, ay + ah);
  ctx.fill();
  ctx.fillStyle = "#fff3d6";
  ctx.beginPath();
  ctx.arc(ax + 142, ay + 26, 12, 0, Math.PI * 2);
  ctx.fill();
  fill(cells.white, "#ffffff");
  fill(cells.cafe, "#3a2c26");
  text(cells.cafe, "카페", "#ffd9a0", 48);
  // Sungnyemun's vertical name board.
  fill(cells.gate, "#2c2a2e");
  ctx.strokeStyle = "#c79a4b";
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 198, 84, 244);
  ["崇", "禮", "門"].forEach((glyph, i) =>
    text([0, 212 + i * 74, 96, 74], glyph, "#e9c77b", 56, 0, 600),
  );
  fill(cells.ddp, "#cfd3d1");
  // Lotte-style crown and seam light texture: pale, even.
  fill(cells.stripes, "#f6f1e3");
}

let atlas: THREE.CanvasTexture | null = null;
function atlasTexture() {
  if (atlas || typeof document === "undefined") return atlas;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  paint(ctx);
  atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  return atlas;
}

let material: THREE.MeshBasicMaterial | null = null;
/** The district's one self-lit material (created on first render). */
export function signMaterial() {
  if (material) return material;
  material = new THREE.MeshBasicMaterial({
    map: atlasTexture(),
    vertexColors: true,
    toneMapped: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlossNight = gloss.night;
    shader.uniforms.uGlossWarm = gloss.warm;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec3 aLight;\nvarying vec3 vLight;",
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLight = aLight;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vLight;\nuniform float uGlossNight;\nuniform vec3 uGlossWarm;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        diffuseColor.rgb *= mix(vLight.x, vLight.y, uGlossNight);
        diffuseColor.rgb += uGlossWarm * vLight.z * uGlossNight;`,
      );
  };
  material.customProgramCacheKey = () => "korea-signs-v1";
  return material;
}

/** Light presets for `aLight`. */
export const LIGHT = {
  sign: [0.92, 1.18, 0],
  paint: [0.86, 0.5, 0],
  dim: [0.8, 0.95, 0],
  strip: [0.55, 1.05, 0],
} as const;
export const windowLight = (lit: number) => [1, 0.32, lit] as const;

/** Accumulates quads into one geometry (one draw call for every sign). */
export class SignBuilder {
  private positions: number[] = [];
  private uvs: number[] = [];
  private colors: number[] = [];
  private lights: number[] = [];
  private color = new THREE.Color();

  /**
   * A flat quad centred at (x, y, z), `w` wide and `h` tall, facing the
   * direction `rotY` (0 = +z). `tilt` lays it back toward the sky.
   */
  quad(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    rotY: number,
    cell: SignCell,
    color: string,
    light: readonly [number, number, number],
    tilt = 0,
  ) {
    const [cx, cy, cw, ch] = cells[cell];
    // Inset the window cell so filtering never bleeds a neighbour in.
    const pad = cell === "white" ? 8 : 1;
    const u0 = (cx + pad) / W,
      u1 = (cx + cw - pad) / W,
      v0 = 1 - (cy + ch - pad) / H,
      v1 = 1 - (cy + pad) / H;
    const rx = Math.cos(rotY),
      rz = -Math.sin(rotY);
    const ux = Math.sin(rotY) * -Math.sin(tilt),
      uy = Math.cos(tilt),
      uz = Math.cos(rotY) * -Math.sin(tilt);
    const corner = (sx: number, sy: number) => [
      x + rx * (w / 2) * sx + ux * (h / 2) * sy,
      y + uy * (h / 2) * sy,
      z + rz * (w / 2) * sx + uz * (h / 2) * sy,
    ];
    const a = corner(-1, -1),
      b = corner(1, -1),
      c = corner(1, 1),
      d = corner(-1, 1);
    this.positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    this.uvs.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    this.color.set(color);
    for (let i = 0; i < 6; i++) {
      this.colors.push(this.color.r, this.color.g, this.color.b);
      this.lights.push(...light);
    }
  }

  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(this.positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(this.colors, 3),
    );
    geometry.setAttribute(
      "aLight",
      new THREE.Float32BufferAttribute(this.lights, 3),
    );
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
