import { describe, expect, it, vi } from "vitest";
import {
  captureShot,
  centerCrop,
  drawStrip,
  wallJpeg,
} from "../src/game/core/photoStrip";
import {
  MAX_STRIP_BYTES,
  STRIP_HEIGHT,
  STRIP_WIDTH,
} from "../src/shared/booth";

function context() {
  const ctx = {
    filter: "none",
    filtersSeen: [] as string[],
    drawImage: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    strokeRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    beginPath: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  };
  ctx.drawImage.mockImplementation(() => {
    ctx.filtersSeen.push(ctx.filter);
  });
  return ctx;
}

describe("photo strip", () => {
  it("center-crops landscape and portrait camera frames to the preview aspect", () => {
    expect(centerCrop(1600, 900)).toEqual([200, 0, 1200, 900]);
    expect(centerCrop(600, 1000)).toEqual([0, 275, 600, 450]);
  });

  it("mirrors the captured pixels to match the live preview", () => {
    const ctx = context();
    const canvas = { getContext: () => ctx };
    vi.stubGlobal("document", { createElement: () => canvas });
    try {
      const video = {
        videoWidth: 1600,
        videoHeight: 900,
        readyState: 2,
      } as HTMLVideoElement;
      expect(captureShot(video)).toBe(canvas);
      expect(ctx.translate).toHaveBeenCalledWith(328, 0);
      expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
      expect(ctx.drawImage).toHaveBeenCalledWith(
        video,
        200,
        0,
        1200,
        900,
        0,
        0,
        328,
        246,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("composes all four photos in order, with the date, caption and marks", () => {
    const ctx = context();
    const shots = Array.from({ length: 4 }, () => ({}) as HTMLCanvasElement);
    const draw = ctx as unknown as CanvasRenderingContext2D;
    expect(() => drawStrip(draw, shots.slice(1), "slate", "", "", [])).toThrow(
      "Four shots required.",
    );
    drawStrip(draw, shots, "white", "11/24/2026", " Seoul ", [
      { kind: "Star", point: { x: 25, y: 40 } },
      {
        kind: "pen",
        points: [
          { x: 30, y: 40 },
          { x: 35, y: 41 },
        ],
      },
    ]);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, STRIP_WIDTH, STRIP_HEIGHT);
    expect(ctx.drawImage.mock.calls).toEqual(
      shots.map((shot, index) => [shot, 16, 16 + index * 258, 328, 246]),
    );
    expect(ctx.fillText.mock.calls).toEqual([
      ["11/24/2026", 180, 1069],
      ["Seoul", 180, 1099, 328],
      ["★", 25, 40],
    ]);
    expect(ctx.lineTo).toHaveBeenCalledWith(35, 41);
    expect(ctx.filter).toBe("none");
  });

  it("applies the chosen photo filter while drawing the shots", () => {
    const ctx = context();
    const shots = Array.from({ length: 4 }, () => ({}) as HTMLCanvasElement);
    const draw = ctx as unknown as CanvasRenderingContext2D;
    drawStrip(draw, shots, "slate", "", "", [], "bw");
    expect(ctx.filtersSeen).toEqual([
      "grayscale(1)",
      "grayscale(1)",
      "grayscale(1)",
      "grayscale(1)",
    ]);
    expect(ctx.filter).toBe("none");
  });

  it("lowers JPEG quality until the upload fits and rejects if it never fits", async () => {
    const big = new Blob([new Uint8Array(MAX_STRIP_BYTES + 1)], {
      type: "image/jpeg",
    });
    const small = new Blob(["jpeg"], { type: "image/jpeg" });
    const encode = vi
      .fn((done: BlobCallback) => done(big))
      .mockImplementationOnce((done) => done(big))
      .mockImplementationOnce((done) => done(small));
    const canvas = { toBlob: encode } as unknown as HTMLCanvasElement;
    await expect(wallJpeg(canvas)).resolves.toBe(small);
    expect(encode.mock.calls).toHaveLength(2);
    await expect(wallJpeg(canvas)).rejects.toThrow(
      "Strip is too large to post.",
    );
  });
});
