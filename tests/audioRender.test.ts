/**
 * Programmatic audition (D1, D2): every palette sound and a 60 s "busy play"
 * mix rendered offline in Chromium with the game's own synthesis code, then
 * measured. Set AUDIO_WAV_DIR to also write WAVs for a person to listen to.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromiumPath, openLab, type LabPage } from "./audioHarness";
import { PALETTE_NAMES, SPECS, type PaletteName } from "../src/game/core/audio/palette";
import { BUS_GAIN } from "../src/game/core/audio/graph";
import type { BusyRender, CueRender } from "../src/game/core/audio/offline";

const WAV_DIR = process.env.AUDIO_WAV_DIR;
const REPORT = process.env.AUDIO_REPORT;
const SEEDS = [1, 2, 3, 4, 5];
const target = (name: PaletteName) => 20 * Math.log10(SPECS[name].level * BUS_GAIN[SPECS[name].bus]);
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

describe.skipIf(!chromiumPath())("offline audio renders", () => {
  let lab: LabPage;
  const report: Record<string, unknown> = {};
  beforeAll(async () => {
    lab = await openLab();
    if (WAV_DIR) mkdirSync(WAV_DIR, { recursive: true });
  }, 120_000);
  afterAll(async () => {
    await lab?.close();
    if (REPORT) writeFileSync(REPORT, JSON.stringify(report, null, 1));
  });

  it.each(PALETTE_NAMES)("%s: level, length, silence after, no clip or DC, sane spectrum", async (name) => {
    const renders: CueRender[] = [];
    for (const seed of SEEDS) renders.push(await lab.run<CueRender>("renderCue", name, { seed }));
    const peakDb = median(renders.map((r) => r.peakDb));
    const first = renders[0];
    const spec = SPECS[name];
    report[name] = {
      bus: spec.bus,
      targetPeakDb: +target(name).toFixed(2),
      peakDb: +peakDb.toFixed(2),
      peakSpreadDb: +(Math.max(...renders.map((r) => r.peakDb)) - Math.min(...renders.map((r) => r.peakDb))).toFixed(2),
      activeRmsDb: +first.activeRmsDb.toFixed(2),
      lengthS: +first.length.toFixed(3),
      specS: spec.dur,
      dc: first.dc,
      centroidHz: Math.round(first.centroid),
      bands: Object.fromEntries(Object.entries(first.bands).map(([k, v]) => [k, +v.toFixed(3)])),
      tailDb: first.tailDb,
    };
    // Level column × bus gain, within ±2 dB (median of five random plays).
    expect(Math.abs(peakDb - target(name))).toBeLessThanOrEqual(2);
    // Duration within 10% of the spec.
    expect(Math.abs(first.length - spec.dur) / spec.dur).toBeLessThanOrEqual(0.1);
    for (const r of renders) {
      expect(r.clipped).toBe(0);
      // Silence afterwards: no stuck or doubled voice.
      expect(r.tailDb).toBeLessThan(-100);
      expect(Math.abs(r.dc)).toBeLessThan(1e-4);
      // Nothing below hearing, nothing that is all fizz.
      expect(r.bands.sub).toBeLessThan(0.08);
      expect(r.centroid).toBeGreaterThan(40);
      expect(r.centroid).toBeLessThan(9000);
    }
    if (WAV_DIR) {
      const wet = await lab.run<CueRender>("renderCue", name, { seed: 1, wet: true, wav: true });
      writeFileSync(join(WAV_DIR, `cue-${name}.wav`), Buffer.from(wet.wav!, "base64"));
      // Through the master chain the reverb tail also ends.
      expect(wet.tailDb).toBeLessThan(-70);
      expect(wet.clipped).toBe(0);
    }
  }, 120_000);

  it("busy play: 60 s of ambience and 200 cues stays under the ceiling at a healthy level", async () => {
    const recordings = Object.fromEntries(
      ["birds", "water"].map((n) => [n, readFileSync(join(process.cwd(), "public/audio", `${n}.mp3`)).toString("base64")]),
    );
    const busy = await lab.run<BusyRender>("renderBusy", { recordings, music: false, wav: !!WAV_DIR });
    const withMusic = await lab.run<BusyRender>("renderBusy", { recordings, music: true, seed: 8 });
    report.busy = { mix: busy.mix, withMusic: withMusic.mix, musicBus: withMusic.music };
    if (WAV_DIR && busy.wav) writeFileSync(join(WAV_DIR, "busy-play-60s.wav"), Buffer.from(busy.wav, "base64"));
    for (const r of [busy, withMusic]) {
      expect(r.mix.peakDb).toBeLessThanOrEqual(-1);
      expect(r.mix.clipped).toBe(0);
      expect(r.mix.rmsDb).toBeGreaterThanOrEqual(-26);
      expect(r.mix.rmsDb).toBeLessThanOrEqual(-16);
      expect(Math.abs(r.mix.dc)).toBeLessThan(1e-3);
    }
    // The music bus carries a mastered track (-14 dBFS RMS) at -32…-24 dBFS.
    expect(withMusic.music!.rmsDb).toBeGreaterThanOrEqual(-32);
    expect(withMusic.music!.rmsDb).toBeLessThanOrEqual(-24);
  }, 300_000);
});
