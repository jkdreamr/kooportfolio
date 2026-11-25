import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { surfaceSky } from "./Surface";

/** Shared gloss rig. One frame driver (Game's Sun) feeds every glossy
 * material; nothing here adds a light, a post pass or a scene environment. */
export const gloss = {
  time: { value: 0 },
  night: { value: 0 },
  /** 1 on the high tier, 0 on low power: water keeps its colour, no ripple. */
  ripple: { value: 1 },
  sky: { value: new THREE.Color("#bcd8ee") },
  warm: { value: new THREE.Color("#ffb45e") },
};

type Glossy = THREE.MeshStandardMaterial & {
  userData: { glossEnv?: number; glossNight?: number };
};
const registry: Glossy[] = [];
let environment: THREE.Texture | null = null;
let environmentTarget: THREE.WebGLRenderTarget | null = null;
let environmentFor: THREE.WebGLRenderer | null = null;

function register<T extends THREE.MeshStandardMaterial>(
  material: T,
  envIntensity: number,
  nightEnv = 0.22,
) {
  material.userData.glossEnv = envIntensity;
  material.userData.glossNight = nightEnv;
  material.envMapIntensity = envIntensity;
  if (environment) material.envMap = environment;
  registry.push(material as Glossy);
  return material;
}

/** A tiny studio sky: zenith-to-horizon gradient, a warm ground bounce and
 * two soft light cards. Baked once into a 64px PMREM, used per material only. */
function bakeEnvironment(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  const dome = new THREE.SphereGeometry(40, 24, 16);
  const position = dome.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const zenith = new THREE.Color("#4f8fd0"),
    horizon = new THREE.Color("#eef5f2"),
    ground = new THREE.Color("#6d7458"),
    color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i) / 40;
    if (y >= 0) color.copy(horizon).lerp(zenith, Math.pow(y, 0.55));
    else color.copy(horizon).lerp(ground, Math.min(1, -y * 3.2));
    color.toArray(colors, i * 3);
  }
  dome.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
  });
  scene.add(new THREE.Mesh(dome, sky));
  const cardGeometry = new THREE.PlaneGeometry(1, 1);
  const cardMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.6, 2.5, 2.3),
    side: THREE.DoubleSide,
  });
  // The key card sits where the world sun is; the second is a cool window.
  for (const [x, y, z, w, h] of [
    [-14, 26, 14, 16, 16],
    [22, 12, -18, 10, 22],
  ]) {
    const card = new THREE.Mesh(cardGeometry, cardMaterial);
    card.position.set(x, y, z);
    card.scale.set(w, h, 1);
    card.lookAt(0, 0, 0);
    scene.add(card);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(scene, 0.035, 0.1, 100, { size: 64 });
  generator.dispose();
  dome.dispose();
  sky.dispose();
  cardGeometry.dispose();
  cardMaterial.dispose();
  return target;
}

const rim = new THREE.Color();
/** Called once per frame from Game's Sun, after the time-of-day rig. */
export function updateGloss(
  renderer: THREE.WebGLRenderer,
  hemisphere: THREE.HemisphereLight | undefined,
  night: number,
  delta: number,
  high: boolean,
  animate: boolean,
) {
  if (environmentFor !== renderer) {
    // A new canvas (context restore, remount) owns its own GPU texture.
    // Baked exactly once per renderer; the previous canvas's copy is freed.
    environmentTarget?.dispose();
    environmentTarget = bakeEnvironment(renderer);
    environment = environmentTarget.texture;
    environmentFor = renderer;
    for (const material of registry) {
      material.envMap = environment;
      material.needsUpdate = true;
    }
  }
  if (animate)
    gloss.time.value = (gloss.time.value + Math.min(delta, 0.1)) % 3600;
  gloss.night.value = night;
  gloss.ripple.value = high ? 1 : 0;
  if (hemisphere) {
    gloss.sky.value
      .copy(hemisphere.color)
      .multiplyScalar(Math.min(1.1, 0.35 + hemisphere.intensity * 0.7));
    rim.copy(hemisphere.color).multiplyScalar(
      Math.min(0.12, 0.03 + hemisphere.intensity * 0.085),
    );
    surfaceSky.value.copy(rim);
  }
  for (const material of registry) {
    const day = material.userData.glossEnv ?? 1;
    material.envMapIntensity =
      day * (1 - night * (1 - (material.userData.glossNight ?? 0.22)));
  }
}

const worldVarying = (shader: THREE.WebGLProgramParametersWithUniforms) => {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vGlossWorld;")
    .replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      vec4 glossWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        glossWorld = instanceMatrix * glossWorld;
      #endif
      vGlossWorld = (modelMatrix * glossWorld).xyz;`,
    );
};
const shared = (shader: THREE.WebGLProgramParametersWithUniforms) => {
  shader.uniforms.uGlossTime = gloss.time;
  shader.uniforms.uGlossNight = gloss.night;
  shader.uniforms.uGlossRipple = gloss.ripple;
  shader.uniforms.uGlossSky = gloss.sky;
  shader.uniforms.uGlossWarm = gloss.warm;
};
const sharedHeader = `varying vec3 vGlossWorld;
uniform float uGlossTime; uniform float uGlossNight; uniform float uGlossRipple;
uniform vec3 uGlossSky; uniform vec3 uGlossWarm;`;

/** Window and lantern glass: clear-coated, sky-reflecting, no transmission
 * (nothing behind a pane is worth a second pass). A slow diagonal sheen keeps
 * flat panes glassy under the orthographic camera, where a plane otherwise
 * reflects one single direction. By night the pane is lit warmly from inside;
 * `glow` scales that (0 for cold glass such as a greenhouse roof). */
export function glassMaterial({
  color = "#7fa6b4",
  glow = 1,
  tint = false,
  env = 0.9,
}: {
  color?: string;
  glow?: number;
  /** Lantern glass: the instance/base colour is the light colour. */
  tint?: boolean;
  env?: number;
} = {}) {
  const material = register(
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.06,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      reflectivity: 0.6,
    }),
    env,
    0.3,
  );
  material.onBeforeCompile = (shader) => {
    shared(shader);
    worldVarying(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${sharedHeader}`)
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float glassBand = fract((vGlossWorld.x * 0.8 + vGlossWorld.y * 1.25 - vGlossWorld.z * 0.35) * 0.42);
        float glassSheen = smoothstep(0.30, 0.42, glassBand) * (1.0 - smoothstep(0.46, 0.62, glassBand))
          + 0.45 * smoothstep(0.72, 0.76, glassBand) * (1.0 - smoothstep(0.79, 0.84, glassBand));
        totalEmissiveRadiance += uGlossSky * glassSheen * ${tint ? "0.10" : "0.20"} * (1.0 - uGlossNight * 0.85);
        vec3 glassLit = ${tint ? "diffuseColor.rgb" : "uGlossWarm"};
        totalEmissiveRadiance += glassLit * uGlossNight * ${(glow * (tint ? 1.5 : 0.95)).toFixed(3)} * (0.86 + 0.14 * glassSheen);
        ${tint ? "totalEmissiveRadiance += diffuseColor.rgb * 0.10;" : ""}
        diffuseColor.rgb *= 1.0 - uGlossNight * ${(glow * 0.55).toFixed(3)};`,
      );
  };
  material.customProgramCacheKey = () =>
    `gloss-glass-v1:${tint ? 1 : 0}:${glow}`;
  return material;
}

export type WaterShore = "disc" | "band" | "none";
/** Stylised water on the standard lighting model: it receives shadows, fog and
 * tone mapping like everything else. Two travelling sines bend the normal so
 * the baked sky slides over the surface; crests catch the sky by day and the
 * warm village light by night. `shore` paints foam from the mesh UVs:
 * "disc" for circle/ellipse pools, "band" for a channel whose banks are v=0/1.
 */
export function waterMaterial({
  color = "#3f8f97",
  deep = "#2a6672",
  shore = "none",
  scale = 1,
  flow = [0.35, 0.2],
  foam = 1,
}: {
  color?: string;
  deep?: string;
  shore?: WaterShore;
  /** Ripple wavelength multiplier: larger for wide rivers. */
  scale?: number;
  flow?: [number, number];
  foam?: number;
} = {}) {
  const material = register(
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.16,
      metalness: 0.1,
    }),
    0.5,
    0.12,
  );
  const deepColor = new THREE.Color(deep);
  material.onBeforeCompile = (shader) => {
    shared(shader);
    worldVarying(shader);
    shader.uniforms.uWaterDeep = { value: deepColor };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vWaterUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWaterUv = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\n${sharedHeader}
        varying vec2 vWaterUv; uniform vec3 uWaterDeep;
        float waterCrest; float waterFoam;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 waterP = vGlossWorld.xz * ${(1 / scale).toFixed(4)};
        float waterT = uGlossTime;
        float waterA = waterP.x * 1.7 + waterP.y * 1.1 + waterT * ${flow[0].toFixed(3)} * 3.0
          + sin(waterP.y * 0.9 + waterT * 0.31) * 1.3;
        float waterB = waterP.x * -1.2 + waterP.y * 2.3 - waterT * ${flow[1].toFixed(3)} * 3.0
          + sin(waterP.x * 0.7 - waterT * 0.23) * 1.1;
        vec2 waterSlope = (vec2(1.7, 1.1) * cos(waterA) + vec2(-1.2, 2.3) * cos(waterB)) * uGlossRipple;
        waterCrest = (sin(waterA) + sin(waterB)) * 0.5 * uGlossRipple;
        ${
          shore === "disc"
            ? `float waterEdge = length(vWaterUv - 0.5) * 2.0;
        float waterAngle = atan(vWaterUv.y - 0.5, vWaterUv.x - 0.5);
        float waterLap = 0.045 * sin(waterAngle * 9.0 + waterT * 0.9) * uGlossRipple;`
            : shore === "band"
              ? `float waterEdge = abs(vWaterUv.y - 0.5) * 2.0;
        float waterLap = 0.012 * sin(vWaterUv.x * 140.0 + waterT * 0.9) * uGlossRipple;`
              : `float waterEdge = 0.0; float waterLap = 0.0;`
        }
        float waterShallow = smoothstep(0.35, 0.95, waterEdge);
        diffuseColor.rgb = mix(uWaterDeep, diffuseColor.rgb, 0.45 + 0.55 * waterShallow);
        diffuseColor.rgb *= 1.0 + waterCrest * 0.06;
        waterFoam = ${foam.toFixed(2)} * smoothstep(${shore === "band" ? "0.962" : "0.9"} + waterLap, ${shore === "band" ? "0.988" : "0.955"} + waterLap, waterEdge);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.90, 0.89), waterFoam * 0.6);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        normal = normalize(normal + (viewMatrix * vec4(-waterSlope.x, 0.0, -waterSlope.y, 0.0)).xyz * 0.04);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.7, waterFoam);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float waterFresnel = 1.0 - saturate(dot(normal, vec3(0.0, 0.0, 1.0)));
        waterFresnel = waterFresnel * waterFresnel;
        float waterGlint = smoothstep(0.90, 0.985, waterCrest) * (1.0 - waterFoam);
        vec3 waterSky = uGlossSky * (0.03 + 0.34 * waterFresnel) * (1.0 - 0.85 * uGlossNight);
        totalEmissiveRadiance += waterSky * (1.0 - waterFoam * 0.6);
        totalEmissiveRadiance += mix(uGlossSky * 0.34, uGlossWarm * 0.22, uGlossNight) * waterGlint;
        totalEmissiveRadiance += uGlossWarm * uGlossNight * (0.02 + 0.05 * waterShallow * (0.6 + 0.4 * waterCrest));`,
      );
  };
  material.customProgramCacheKey = () =>
    `gloss-water-v2:${shore}:${scale}:${flow.join(",")}:${foam}`;
  return material;
}

/** Quartz: faceted, sharp reflections of the baked sky, a self-lit core at
 * night. Colour comes from the material or per-instance colours. */
export function crystalMaterial(
  options: THREE.MeshStandardMaterialParameters = {},
) {
  const material = register(
    new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.2,
      metalness: 0.1,
      flatShading: true,
      ...options,
    }),
    0.6,
    0.4,
  );
  material.onBeforeCompile = (shader) => {
    shared(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uGlossNight; uniform vec3 uGlossSky;",
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * (0.04 + 0.5 * uGlossNight);`,
      );
  };
  material.customProgramCacheKey = () => "gloss-crystal-v2";
  return material;
}

/** Camera-facing additive glow for lamp heads; instance colour tints it and
 * instance scale sets its radius. Hidden by day and on the low tier. */
export function haloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uGlossNight: gloss.night },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      varying vec2 vHalo;
      varying vec3 vHaloColor;
      void main() {
        vHalo = position.xy * 2.0;
        vHaloColor = instanceColor;
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float radius = length(instanceMatrix[0].xyz);
        center.xy += position.xy * radius;
        gl_Position = projectionMatrix * center;
      }
    `,
    fragmentShader: `
      uniform float uGlossNight;
      varying vec2 vHalo;
      varying vec3 vHaloColor;
      void main() {
        float d = length(vHalo);
        float glow = max(0.0, exp(-d * d * 4.2) - 0.015) * (1.0 - smoothstep(0.8, 1.0, d));
        gl_FragColor = vec4(vHaloColor * glow * 0.4 * smoothstep(0.25, 0.9, uGlossNight), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** A hexagonal prism with a pointed crown: a lantern body or a quartz point.
 * Unit height, origin at mid-height; module-owned, never disposed. */
export const gemGeometry = (() => {
  const body = new THREE.CylinderGeometry(0.5, 0.5, 0.68, 6).translate(0, -0.16, 0);
  const crown = new THREE.ConeGeometry(0.5, 0.32, 6).translate(0, 0.34, 0);
  const merged = mergeGeometries([body.toNonIndexed(), crown.toNonIndexed()])!;
  merged.computeVertexNormals();
  body.dispose();
  crown.dispose();
  return merged;
})();
