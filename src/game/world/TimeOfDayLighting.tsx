import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { advanceHour, DAYLIGHT_KEYS, sampleDaylight } from "../core/daylight";
import { daylightClock, useTimeOfDay } from "../core/timeOfDay";
import { readWorldHour } from "../core/worldTime";
import { runtime, useGame } from "../core/store";
import { isInterior } from "../core/world";

const palettes = DAYLIGHT_KEYS.map((key) => ({
  top: new THREE.Color(key.top),
  horizon: new THREE.Color(key.horizon),
  sun: new THREE.Color(key.sun),
  sky: new THREE.Color(key.sky),
  ground: new THREE.Color(key.ground),
}));
const indoor = {
  backdrop: new THREE.Color("#34494e"),
  sun: new THREE.Color("#fff0cc"),
  sky: new THREE.Color("#dceaff"),
  ground: new THREE.Color("#64533c"),
  ambient: new THREE.Color("#f1e2c8"),
};

const skyVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

// One background draw, no textures, postprocessing, additional shadow maps or assets.
const skyFragment = `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 sunColor;
  uniform float night;
  uniform float aspect;
  uniform float stars;
  uniform vec2 sunPosition;
  varying vec2 vUv;
  float disc(vec2 center, float radius) {
    float d = length((vUv - center) * vec2(aspect, 1.0));
    return 1.0 - smoothstep(radius - 0.001, radius + 0.001, d);
  }
  void main() {
    vec3 sky = mix(horizonColor, topColor, smoothstep(0.05, 1.0, vUv.y));
    vec2 grid = vUv * vec2(aspect, 1.0) * 85.0;
    vec2 cell = floor(grid);
    float seed = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
    float star = (1.0 - smoothstep(0.025, 0.12, length(fract(grid) - 0.5)))
      * step(0.965, seed) * smoothstep(0.35, 0.9, vUv.y);
    sky += vec3(star * night * stars * 0.7);
    float sun = disc(sunPosition, 0.027) * (1.0 - night);
    sky = mix(sky, sunColor * 1.15, sun * 0.85);
    float moon = disc(vec2(0.81, 0.8), 0.025)
      * (1.0 - disc(vec2(0.821, 0.81), 0.023));
    sky = mix(sky, vec3(0.78, 0.86, 1.0), moon * night);
    gl_FragColor = vec4(sky, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Drives the named world lights; the world builder retains shadow/position ownership. */
export function TimeOfDayLighting() {
  const sky = useRef<THREE.Mesh>(null);
  const skyMaterial = useRef<THREE.ShaderMaterial>(null);
  const lights = useRef<{
    sun: THREE.DirectionalLight;
    fill: THREE.DirectionalLight;
    hemi: THREE.HemisphereLight;
    ambient: THREE.AmbientLight;
  } | null>(null);
  const colors = useMemo(
    () => ({
      top: new THREE.Color(),
      horizon: new THREE.Color(),
      sun: new THREE.Color(),
      sky: new THREE.Color(),
      ground: new THREE.Color(),
    }),
    [],
  );
  const uniforms = useMemo(
    () => ({
      topColor: { value: colors.top },
      horizonColor: { value: colors.horizon },
      sunColor: { value: colors.sun },
      night: { value: 0 },
      aspect: { value: 1 },
      stars: { value: 1 },
      sunPosition: { value: new THREE.Vector2(0.2, 0.8) },
    }),
    [colors],
  );
  const displayedAt = useRef(0);
  const quality = useGame((state) => state.quality);
  const scene = useGame((state) => state.scene);
  const interior = isInterior(scene);

  useFrame(({ scene: world, size }, delta) => {
    const state = useGame.getState();
    if (!state.paused && runtime.active) {
      const time = useTimeOfDay.getState();
      daylightClock.hour = advanceHour(
        daylightClock.hour,
        delta,
        time.mode,
        time.mode === "auto" ? readWorldHour(time.timeZone) : undefined,
      );
      displayedAt.current += Math.min(delta, 0.1);
      if (displayedAt.current >= 0.25) {
        useTimeOfDay.setState({ hour: daylightClock.hour });
        displayedAt.current = 0;
      }
    }
    const light = sampleDaylight(daylightClock.hour);
    const from = palettes[light.index],
      to = palettes[light.index + 1];
    for (const name of ["top", "horizon", "sun", "sky", "ground"] as const)
      colors[name].copy(from[name]).lerp(to[name], light.blend);

    // Interior objects retain warm, readable light instead of turning blue-black.
    if (interior) {
      colors.sun.lerp(indoor.sun, 0.8);
      colors.sky.lerp(indoor.sky, 0.65);
      colors.ground.lerp(indoor.ground, 0.65);
    }
    if (world.background instanceof THREE.Color)
      world.background.copy(interior ? indoor.backdrop : colors.horizon);
    if (world.fog)
      world.fog.color.copy(interior ? indoor.backdrop : colors.horizon);
    if (!lights.current) {
      const sun = world.getObjectByName("world-sun");
      const fill = world.getObjectByName("world-fill");
      const hemi = world.getObjectByName("world-hemisphere");
      const ambient = world.getObjectByName("world-ambient");
      if (
        sun instanceof THREE.DirectionalLight &&
        fill instanceof THREE.DirectionalLight &&
        hemi instanceof THREE.HemisphereLight &&
        ambient instanceof THREE.AmbientLight
      )
        lights.current = { sun, fill, hemi, ambient };
    }
    if (lights.current) {
      const { sun, fill, hemi, ambient } = lights.current;
      sun.color.copy(colors.sun);
      sun.intensity = interior ? 2.7 : light.key;
      hemi.color.copy(colors.sky);
      hemi.groundColor.copy(colors.ground);
      hemi.intensity = interior ? 1.05 : light.hemi;
      ambient.color.copy(interior ? indoor.ambient : colors.sky);
      ambient.intensity = interior ? 0.28 : light.ambient;
      fill.color.copy(colors.sky);
      fill.intensity = interior ? 0.65 : light.fill;
    }
    // R3F copies uniform wrappers into the material. Update that live object,
    // not the memo's numeric values (Color/Vector values happen to be shared).
    const live = skyMaterial.current?.uniforms;
    if (live) {
      live.night.value = light.night;
      live.aspect.value = size.width / size.height;
      live.stars.value = quality === "high" ? 1 : 0.6;
      live.sunPosition.value.set(0.2 + (daylightClock.hour / 24) * 0.55, 0.78);
    }
    if (sky.current) sky.current.visible = !interior;
  }, -1);

  return (
    <>
      <mesh
        ref={sky}
        frustumCulled={false}
        renderOrder={-1000}
        raycast={() => {}}
      >
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          ref={skyMaterial}
          uniforms={uniforms}
          vertexShader={skyVertex}
          fragmentShader={skyFragment}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}
