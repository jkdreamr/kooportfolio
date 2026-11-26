import type * as THREE from "three";
import type { Tier } from "../../stage/contract";

const TIERS: readonly Tier[] = ["high", "medium", "low"];

/** `?tier=high|medium|low` or localStorage "stage-tier" force a tier (QA). */
export function forcedTier(): Tier | null {
  try {
    const query = new URLSearchParams(location.search).get("tier");
    if (query && (TIERS as string[]).includes(query)) return query as Tier;
    const stored = localStorage.getItem("stage-tier");
    if (stored && (TIERS as string[]).includes(stored)) return stored as Tier;
  } catch {
    // Storage blocked: fall through to detection.
  }
  return null;
}

export function rendererName(gl: THREE.WebGLRenderer) {
  const context = gl.getContext();
  const info = context.getExtension("WEBGL_debug_renderer_info");
  return String(
    context.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : context.RENDERER),
  );
}

/**
 * Pick the tier once, from the live context (no throwaway probe canvas).
 * Never re-evaluated: runtime adaptation is continuous (resolution scale,
 * shadow refresh rate), so no frame ever recompiles programs because of it.
 */
export function pickTier(gl: THREE.WebGLRenderer): Tier {
  const forced = forcedTier();
  if (forced) return forced;
  const name = rendererName(gl);
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 8;
  const coarse =
    typeof matchMedia === "function" &&
    matchMedia("(pointer: coarse)").matches;
  const small = Math.min(screen.width, screen.height) < 600;
  // Software rasterisers: keep the readable mid look rather than a bare one;
  // the adaptive resolution knob absorbs the rest.
  if (isSoftwareRenderer(gl)) return "medium";
  if (memory <= 2 || cores <= 2 || gl.capabilities.maxTextureSize < 4096)
    return "low";
  if (coarse || small) {
    // Recent Apple/Adreno/Mali-G7xx phones carry the medium look comfortably.
    if (/apple gpu|adreno \(tm\) (6[4-9]|7)\d\d|mali-g(7[1-9]|[89]\d|71\d)/i.test(name) || memory >= 6)
      return "medium";
    return "low";
  }
  if (/intel.*(hd graphics [2-5]\d\d\b|uhd graphics 6\d\d)/i.test(name))
    return "medium";
  return "high";
}

/** Legacy two-level quality the world builders still read. */
export const legacyQuality = (tier: Tier) => (tier === "low" ? "low" : "high");

/** Software rasterisers (SwiftShader, llvmpipe, WARP). */
export const isSoftwareRenderer = (gl: THREE.WebGLRenderer) =>
  /swiftshader|llvmpipe|software|basic render/i.test(rendererName(gl));

export type AoMode = "full" | "lite" | "none";
const AO_MODES: readonly AoMode[] = ["full", "lite", "none"];

/**
 * The screen-space AO this session runs, decided once at boot (the composer
 * and the tone-mapping path depend on it; it never toggles later).
 * `?ao=full|lite|none` forces it for QA. "lite" (medium tier) needs a
 * hardware GPU and a fine pointer: software renderers and phones keep the
 * baked AO and contact blobs only.
 */
export function resolveAo(budgetAo: AoMode, gl: THREE.WebGLRenderer): AoMode {
  try {
    const forced = new URLSearchParams(location.search).get("ao");
    if (forced && (AO_MODES as string[]).includes(forced)) return forced as AoMode;
  } catch {
    // No location (tests): fall through.
  }
  if (budgetAo !== "lite") return budgetAo;
  const coarse =
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return coarse || isSoftwareRenderer(gl) ? "none" : "lite";
}
