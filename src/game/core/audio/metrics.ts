/**
 * Measurements for audition renders: level, clipping, DC, length and a
 * coarse spectrum. Pure functions on sample arrays (run in node and in the
 * browser).
 */
export const dbfs = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

export function peak(...channels: Float32Array[]) {
  let m = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) m = Math.max(m, Math.abs(c[i]));
  return m;
}

export function rms(...channels: Float32Array[]) {
  let sum = 0,
    n = 0;
  for (const c of channels) {
    for (let i = 0; i < c.length; i++) sum += c[i] * c[i];
    n += c.length;
  }
  return n ? Math.sqrt(sum / n) : 0;
}

/** Mean sample value (a DC offset shows as a non-zero mean). */
export function dcOffset(...channels: Float32Array[]) {
  let sum = 0,
    n = 0;
  for (const c of channels) {
    for (let i = 0; i < c.length; i++) sum += c[i];
    n += c.length;
  }
  return n ? sum / n : 0;
}

/** Samples at or beyond full scale. */
export function clipped(...channels: Float32Array[]) {
  let n = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) if (Math.abs(c[i]) >= 0.999) n++;
  return n;
}

/** Short-window RMS envelope (window in seconds), summed over channels. */
export function envelope(sampleRate: number, window: number, ...channels: Float32Array[]) {
  const w = Math.max(1, Math.round(sampleRate * window));
  const n = Math.ceil((channels[0]?.length ?? 0) / w);
  const out = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let sum = 0,
      count = 0;
    for (const c of channels)
      for (let i = k * w; i < Math.min(c.length, (k + 1) * w); i++) {
        sum += c[i] * c[i];
        count++;
      }
    out[k] = count ? Math.sqrt(sum / count) : 0;
  }
  return { values: out, step: w / sampleRate };
}

/**
 * Where the sound is: first and last moment its 1 ms RMS envelope is within
 * `relDb` of the envelope's peak (seconds). An envelope, not single samples,
 * so noise-based sounds measure the same from one random grain to the next.
 */
export function activeSpan(sampleRate: number, relDb: number, ...channels: Float32Array[]) {
  const { values, step } = envelope(sampleRate, 0.001, ...channels);
  let top = 0;
  for (const v of values) top = Math.max(top, v);
  const threshold = top * 10 ** (relDb / 20);
  let first = -1,
    last = -1;
  for (let k = 0; k < values.length; k++)
    if (values[k] > threshold) {
      if (first < 0) first = k;
      last = k;
    }
  if (last < 0) return { start: 0, end: 0, length: 0 };
  return { start: first * step, end: (last + 1) * step, length: (last + 1 - first) * step };
}

/** In-place radix-2 FFT of real input; returns magnitude spectrum (n/2 bins). */
export function magnitudes(input: Float32Array, size?: number) {
  let n = 1;
  while (n < (size ?? input.length)) n <<= 1;
  const re = new Float64Array(n),
    im = new Float64Array(n);
  const m = Math.min(input.length, n);
  // Hann window over the used span.
  for (let i = 0; i < m; i++) re[i] = input[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, m - 1)));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang),
      wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1,
        ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k,
          b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci,
          ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  const mag = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

export const BANDS = [
  ["sub", 0, 30],
  ["low", 30, 200],
  ["mid", 200, 2000],
  ["high", 2000, 8000],
  ["air", 8000, Infinity],
] as const;

/** Energy share per band and the spectral centroid (Hz). */
export function spectrum(samples: Float32Array, sampleRate: number, maxSize = 1 << 17) {
  const mag = magnitudes(samples.length > maxSize ? samples.subarray(0, maxSize) : samples, Math.min(maxSize, samples.length));
  const binHz = sampleRate / (mag.length * 2);
  const energy: Record<(typeof BANDS)[number][0], number> = { sub: 0, low: 0, mid: 0, high: 0, air: 0 };
  let total = 0,
    weighted = 0;
  for (let i = 1; i < mag.length; i++) {
    const f = i * binHz,
      e = mag[i] * mag[i];
    total += e;
    weighted += e * f;
    for (const [name, lo, hi] of BANDS) if (f >= lo && f < hi) energy[name] += e;
  }
  for (const [name] of BANDS) energy[name] = total ? energy[name] / total : 0;
  return { centroid: total ? weighted / total : 0, bands: energy };
}

/** Everything the audition report records about one render. */
export function measure(sampleRate: number, channels: Float32Array[]) {
  const mono = new Float32Array(channels[0].length);
  for (const c of channels) for (let i = 0; i < c.length; i++) mono[i] += c[i] / channels.length;
  const span = activeSpan(sampleRate, -40, ...channels);
  const spec = spectrum(mono, sampleRate);
  return {
    peakDb: dbfs(peak(...channels)),
    rmsDb: dbfs(rms(...channels)),
    dc: dcOffset(...channels),
    clipped: clipped(...channels),
    start: span.start,
    length: span.length,
    centroid: spec.centroid,
    bands: spec.bands,
  };
}
export type Measurement = ReturnType<typeof measure>;
