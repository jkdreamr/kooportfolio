/**
 * Time-trial ghosts (PLAN_GAMES §2.2), local only: (s, d, θ) sampled at
 * 10 Hz as Int16 (s × 10, d × 100, θ × 1000), base64 in localStorage, one
 * per course, written only on a new best.
 */
export const GHOST_HZ = 10;
export const ghostKey = (course: string) => `joshua-exe-rowing-ghost-v1:${course}`;

export type Ghost = { s: Float32Array; d: Float32Array; th: Float32Array; n: number; time: number };

/** A recorder with room for `seconds` of samples (allocated once). */
export function ghostRecorder(seconds = 400) {
  const cap = seconds * GHOST_HZ;
  const g: Ghost = { s: new Float32Array(cap), d: new Float32Array(cap), th: new Float32Array(cap), n: 0, time: 0 };
  return {
    ghost: g,
    reset() {
      g.n = 0;
      g.time = 0;
    },
    /** Records the sample due at game time t (call every step). */
    sample(t: number, s: number, d: number, th: number) {
      if (t < 0 || g.n >= cap || t < g.n / GHOST_HZ) return;
      g.s[g.n] = s;
      g.d[g.n] = d;
      g.th[g.n] = th;
      g.n++;
      g.time = t;
    },
  };
}

export function encodeGhost(g: Ghost): string {
  const out = new Int16Array(1 + g.n * 3);
  out[0] = Math.min(32767, Math.round(g.time * 10));
  for (let i = 0; i < g.n; i++) {
    out[1 + i * 3] = Math.max(-32768, Math.min(32767, Math.round(g.s[i] * 10)));
    out[2 + i * 3] = Math.max(-32768, Math.min(32767, Math.round(g.d[i] * 100)));
    out[3 + i * 3] = Math.max(-32768, Math.min(32767, Math.round(g.th[i] * 1000)));
  }
  const bytes = new Uint8Array(out.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function decodeGhost(text: string): Ghost | null {
  try {
    const bin = atob(text);
    if (bin.length < 2 || bin.length % 2) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const v = new Int16Array(bytes.buffer);
    const n = Math.floor((v.length - 1) / 3);
    const g: Ghost = { s: new Float32Array(n), d: new Float32Array(n), th: new Float32Array(n), n, time: v[0] / 10 };
    for (let i = 0; i < n; i++) {
      g.s[i] = v[1 + i * 3] / 10;
      g.d[i] = v[2 + i * 3] / 100;
      g.th[i] = v[3 + i * 3] / 1000;
    }
    return g;
  } catch {
    return null;
  }
}

/** The ghost at game time t (linear between samples), into `out`. */
export function ghostAt(g: Ghost, t: number, out: { s: number; d: number; th: number }) {
  if (!g.n) return out;
  const f = Math.max(0, t) * GHOST_HZ;
  const i = Math.min(g.n - 1, Math.floor(f)),
    j = Math.min(g.n - 1, i + 1),
    u = Math.min(1, f - i);
  out.s = g.s[i] + (g.s[j] - g.s[i]) * u;
  out.d = g.d[i] + (g.d[j] - g.d[i]) * u;
  out.th = g.th[i] + (g.th[j] - g.th[i]) * u;
  return out;
}

export function loadGhost(course: string): Ghost | null {
  try {
    const text = localStorage.getItem(ghostKey(course));
    return text ? decodeGhost(text) : null;
  } catch {
    return null;
  }
}
export function saveGhost(course: string, g: Ghost) {
  try {
    localStorage.setItem(ghostKey(course), encodeGhost(g));
  } catch {
    /* storage full or blocked: no ghost */
  }
}
