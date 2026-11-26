/**
 * The page as a WebGL sheet, drawn as a screen-space pass over the world in
 * the engine's one canvas. Owns its own scene and a perspective camera that
 * maps z = 0 exactly onto the viewport in CSS pixels.
 */
import * as THREE from "three";
import { paperFragment, paperVertex } from "./paperShader";
import type { PaperFrameOut } from "./controller";
import type { PageRaster } from "./raster";
import { seamTextureData, type Seam } from "./tear";

export type PaperFrame = PaperFrameOut;

export const IDLE_FRAME: PaperFrame = {
  mode: "off",
  letterX: 0,
  letterY: 0,
  angle: 0,
  scale: 1,
  pullX: 0,
  pullY: 0,
  tension: 0,
  relax: 1,
  holeOpen: 0,
  gap: 0,
  fronts: { back: 0, front: 0 },
  creaseFronts: { back: 0, front: 0 },
  crease: 0,
  axisPlus: -40,
  axisMinus: -40,
  curlR: 60,
};

const FOV = 28;

export class PaperLayer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 1, 10000);
  private material: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry | null = null;
  private page: THREE.CanvasTexture | null = null;
  private glyph: THREE.DataTexture | null = null;
  private seamTex: THREE.DataTexture | null = null;
  private gridKey = "";
  raster: PageRaster | null = null;
  seam: Seam | null = null;
  /** Letter box in CSS px (for scissoring the counter mode). */
  glyphBox = { x: 0, y: 0, width: 0, height: 0 };

  constructor() {
    const u = {
      uView: { value: new THREE.Vector2(1, 1) },
      uRest: { value: new THREE.Vector2() },
      uLetter: { value: new THREE.Vector2() },
      uAngle: { value: 0 },
      uScale: { value: 1 },
      uPull: { value: new THREE.Vector2() },
      uSigmaCore: { value: 40 },
      uSigmaWide: { value: 200 },
      uTension: { value: 0 },
      uLift: { value: 18 },
      uRelax: { value: 1 },
      uHoleOpen: { value: 0 },
      uFlap: { value: 0 },
      uSeamO: { value: new THREE.Vector2() },
      uSeamD: { value: new THREE.Vector2(1, 0) },
      uSeamRange: { value: new THREE.Vector2(0, 0) },
      uFronts: { value: new THREE.Vector2(0, 0) },
      uCreaseFronts: { value: new THREE.Vector2(0, 0) },
      uCrease: { value: 0 },
      uGap: { value: 0 },
      uAxis: { value: -40 },
      uCurlR: { value: 60 },
      uCurlRamp: { value: 160 },
      uPage: { value: null as THREE.Texture | null },
      uGlyph: { value: null as THREE.Texture | null },
      uGlyphBox: { value: new THREE.Vector4(0, 0, 1, 1) },
      uSpread: { value: 24 },
      uInk: { value: new THREE.Color("#232724") },
      uBack: { value: new THREE.Color("#ecebe6") },
      uSeam: { value: null as THREE.Texture | null },
      uSeed: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: paperVertex,
      fragmentShader: paperFragment,
      side: THREE.DoubleSide,
      transparent: true,
      depthTest: true,
      depthWrite: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /** A program to compile during warmup (so the first drag never links). */
  get warmScene() {
    return this.scene;
  }

  setRaster(raster: PageRaster) {
    this.raster = raster;
    const u = this.material.uniforms;
    u.uView.value.set(raster.width, raster.height);
    this.page?.dispose();
    const page = new THREE.CanvasTexture(raster.canvas);
    page.colorSpace = THREE.SRGBColorSpace;
    page.minFilter = THREE.LinearFilter;
    page.magFilter = THREE.LinearFilter;
    page.generateMipmaps = false;
    page.anisotropy = 4;
    this.page = page;
    u.uPage.value = page;
    const L = raster.letter;
    if (L) {
      this.glyph?.dispose();
      const g = new THREE.DataTexture(L.data, L.size, L.size, THREE.RGBAFormat);
      g.minFilter = THREE.LinearFilter;
      g.magFilter = THREE.LinearFilter;
      g.needsUpdate = true;
      this.glyph = g;
      u.uGlyph.value = g;
      u.uGlyphBox.value.set(L.box.x, L.box.y, L.box.width, L.box.height);
      u.uSpread.value = L.spread;
      u.uRest.value.set(L.center.x, L.center.y);
      (u.uInk.value as THREE.Color).setStyle(L.ink);
      // Rigid core: the letter's own ink radius (its box is padded).
      // Rigid core ≈ the letter's outer ink radius (counter radius + stem).
      u.uSigmaCore.value = Math.max(L.radius.x * 3.2, L.radius.y * 2.4);
      this.glyphBox = { ...L.box };
    }
    (u.uBack.value as THREE.Color).setStyle("#e9e8e2");
    this.buildGrid(raster.width, raster.height);
    // Camera: z = 0 is the viewport at 1 CSS px per unit.
    this.camera.aspect = raster.width / raster.height;
    this.camera.fov = FOV;
    const dist = raster.height / 2 / Math.tan((FOV * Math.PI) / 360);
    this.camera.position.set(0, 0, dist);
    this.camera.near = dist * 0.2;
    this.camera.far = dist * 3;
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  private buildGrid(w: number, h: number) {
    const cell = w < 700 ? 8 : 9;
    const cols = Math.max(8, Math.ceil(w / cell));
    const rows = Math.max(8, Math.ceil(h / cell));
    const key = `${w}x${h}`;
    if (key === this.gridKey) return;
    this.gridKey = key;
    // Pad past the edges so a lifted, perspective-grown sheet still covers.
    const pad = 24;
    const rest = new Float32Array((cols + 1) * (rows + 1) * 2);
    let k = 0;
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= cols; i++) {
        rest[k++] = -pad + ((w + 2 * pad) * i) / cols;
        rest[k++] = -pad + ((h + 2 * pad) * j) / rows;
      }
    const index: number[] = [];
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const a = j * (cols + 1) + i;
        const b = a + 1;
        const c = a + cols + 1;
        const d = c + 1;
        // Rest space is y-down and the shader flips y, so a clockwise
        // winding in rest space is counter-clockwise (front) on screen.
        index.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("rest", new THREE.BufferAttribute(rest, 2));
    // three needs a position attribute for bounds; the shader ignores it.
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((cols + 1) * (rows + 1) * 3), 3));
    g.setIndex(index);
    this.geometry?.dispose();
    this.geometry = g;
    this.mesh.geometry = g;
  }

  setSeam(seam: Seam | null) {
    this.seam = seam;
    const u = this.material.uniforms;
    if (!seam) {
      u.uSeamRange.value.set(0, 0);
      return;
    }
    const data = seamTextureData(seam);
    this.seamTex?.dispose();
    const t = new THREE.DataTexture(data, seam.offsets.length, 1, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    this.seamTex = t;
    u.uSeam.value = t;
    u.uSeamO.value.set(seam.origin.x, seam.origin.y);
    u.uSeamD.value.set(seam.dir.x, seam.dir.y);
    u.uSeamRange.value.set(seam.sMin, seam.sMax);
    u.uSeed.value = (seam.seed % 97) * 1.37;
  }

  /** Viewport sizing the current raster was made for. */
  matches(w: number, h: number) {
    return !!this.raster && this.raster.width === w && this.raster.height === h;
  }

  private frame: PaperFrame = IDLE_FRAME;
  update(f: PaperFrame) {
    this.frame = f;
    const u = this.material.uniforms;
    u.uLetter.value.set(f.letterX, f.letterY);
    u.uAngle.value = f.angle;
    u.uScale.value = f.scale;
    u.uPull.value.set(f.pullX, f.pullY);
    u.uTension.value = f.tension;
    u.uRelax.value = f.relax;
    u.uHoleOpen.value = f.holeOpen;
    // r0 of the pinned falloff grows as the page gives.
    u.uSigmaWide.value = u.uSigmaCore.value * (1.6 + 1.2 * Math.min(f.tension, 1.2));
    u.uGap.value = f.gap;
    u.uFronts.value.set(f.fronts.back, f.fronts.front);
    u.uCreaseFronts.value.set(f.creaseFronts.back, f.creaseFronts.front);
    u.uCrease.value = f.crease;
    u.uCurlR.value = f.curlR;
  }

  /** Draw into the current framebuffer (the engine's canvas). */
  render(gl: THREE.WebGLRenderer) {
    const f = this.frame;
    if (f.mode === "off" || !this.raster) return;
    const u = this.material.uniforms;
    const prevScissor = gl.getScissorTest();
    const size = gl.getSize(new THREE.Vector2());
    gl.setViewport(0, 0, size.x, size.y);
    if (f.mode === "counter") {
      const b = this.glyphBox;
      gl.setScissor(b.x, size.y - (b.y + b.height), b.width, b.height);
      gl.setScissorTest(true);
    } else gl.setScissorTest(false);
    gl.clearDepth();
    const tearing = !!this.seam && (f.fronts.front > f.fronts.back || f.crease > 0);
    if (tearing) {
      u.uFlap.value = 1;
      u.uAxis.value = f.axisPlus;
      gl.render(this.scene, this.camera);
      u.uFlap.value = -1;
      u.uAxis.value = f.axisMinus;
      gl.render(this.scene, this.camera);
    } else {
      u.uFlap.value = 0;
      gl.render(this.scene, this.camera);
    }
    gl.setScissorTest(prevScissor);
  }

  /** Compile the program now (warmup) rather than on the first drag. */
  compile(gl: THREE.WebGLRenderer) {
    return gl.compileAsync(this.scene, this.camera);
  }

  dispose() {
    this.geometry?.dispose();
    this.page?.dispose();
    this.glyph?.dispose();
    this.seamTex?.dispose();
    this.material.dispose();
  }
}
