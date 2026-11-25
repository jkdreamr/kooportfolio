import { MAX_STRIP_BYTES, STRIP_HEIGHT, STRIP_WIDTH } from "../../shared/booth";

export const SHOT_COUNT = 4;
export const SHOT_WIDTH = 328;
export const SHOT_HEIGHT = 246;
export const CAPTION_LIMIT = 32;
export const borders = {
  slate: { background: "#334155", ink: "#fff" },
  pine: { background: "#203c32", ink: "#fff" },
  white: { background: "#fff", ink: "#334155" },
};
export const stickers = { Star: "★", Heart: "♥", Sparkle: "✦" };

// A filter is a 4x5 affine color matrix over [r, g, b, a, offset in 0-255].
// Safari keeps 2D `context.filter` behind a flag, so each filter also carries
// its matrix form for a per-pixel fallback.
type ColorMatrix = readonly number[];
const IDENTITY: ColorMatrix = [
  1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0,
];

function compose(first: ColorMatrix, second: ColorMatrix): ColorMatrix {
  // Apply `first`, then `second`.
  const out = new Array<number>(20);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      out[row * 5 + col] =
        second[row * 5] * first[col] +
        second[row * 5 + 1] * first[5 + col] +
        second[row * 5 + 2] * first[10 + col] +
        second[row * 5 + 3] * first[15 + col] +
        (col === 4 ? second[row * 5 + 4] : 0);
    }
  }
  return out;
}

function blend(matrix: ColorMatrix, amount: number): ColorMatrix {
  return matrix.map((v, i) => v * amount + IDENTITY[i] * (1 - amount));
}

const LUMA = [0.2126, 0.7152, 0.0722] as const;

function grayscale(amount: number): ColorMatrix {
  return blend(
    [...LUMA, 0, 0, ...LUMA, 0, 0, ...LUMA, 0, 0, 0, 0, 0, 1, 0],
    amount,
  );
}

function sepia(amount: number): ColorMatrix {
  return blend(
    [
      0.393, 0.769, 0.189, 0, 0, 0.349, 0.686, 0.168, 0, 0, 0.272, 0.534, 0.131,
      0, 0, 0, 0, 0, 1, 0,
    ],
    amount,
  );
}

function saturate(s: number): ColorMatrix {
  const [r, g, b] = LUMA;
  return [
    r + (1 - r) * s,
    g - g * s,
    b - b * s,
    0,
    0,
    r - r * s,
    g + (1 - g) * s,
    b - b * s,
    0,
    0,
    r - r * s,
    g - g * s,
    b + (1 - b) * s,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ];
}

function hueRotate(degrees: number): ColorMatrix {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [
    0.213 + cos * 0.787 - sin * 0.213,
    0.715 - cos * 0.715 - sin * 0.715,
    0.072 - cos * 0.072 + sin * 0.928,
    0,
    0,
    0.213 - cos * 0.213 + sin * 0.143,
    0.715 + cos * 0.285 + sin * 0.14,
    0.072 - cos * 0.072 - sin * 0.283,
    0,
    0,
    0.213 - cos * 0.213 - sin * 0.787,
    0.715 - cos * 0.715 + sin * 0.715,
    0.072 + cos * 0.928 + sin * 0.072,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ];
}

function contrast(c: number): ColorMatrix {
  const offset = (255 * (1 - c)) / 2;
  return [
    c,
    0,
    0,
    0,
    offset,
    0,
    c,
    0,
    0,
    offset,
    0,
    0,
    c,
    0,
    offset,
    0,
    0,
    0,
    1,
    0,
  ];
}

function brightness(b: number): ColorMatrix {
  return [b, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0];
}

function applyMatrix(
  data: Uint8ClampedArray,
  matrix: ColorMatrix,
): Uint8ClampedArray {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    data[i] =
      matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * a + matrix[4];
    data[i + 1] =
      matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[8] * a + matrix[9];
    data[i + 2] =
      matrix[10] * r +
      matrix[11] * g +
      matrix[12] * b +
      matrix[13] * a +
      matrix[14];
    data[i + 3] =
      matrix[15] * r +
      matrix[16] * g +
      matrix[17] * b +
      matrix[18] * a +
      matrix[19];
  }
  return data;
}

export const filters = {
  none: { label: "Color", css: "", matrix: IDENTITY },
  bw: { label: "B&W", css: "grayscale(1)", matrix: grayscale(1) },
  sepia: { label: "Sepia", css: "sepia(0.8)", matrix: sepia(0.8) },
  warm: {
    label: "Warm",
    css: "sepia(0.35) saturate(1.25)",
    matrix: compose(sepia(0.35), saturate(1.25)),
  },
  cool: {
    label: "Cool",
    css: "saturate(0.85) hue-rotate(12deg)",
    matrix: compose(saturate(0.85), hueRotate(12)),
  },
  faded: {
    label: "Faded",
    css: "contrast(0.85) brightness(1.08) saturate(0.7)",
    matrix: compose(compose(contrast(0.85), brightness(1.08)), saturate(0.7)),
  },
};
export type Border = keyof typeof borders;
export type Sticker = keyof typeof stickers;
export type Filter = keyof typeof filters;
export type Point = { x: number; y: number };
export type Mark =
  | { kind: Sticker; point: Point }
  | { kind: "pen"; points: Point[] };

export function centerCrop(width: number, height: number) {
  const cropWidth = Math.min(width, height * (SHOT_WIDTH / SHOT_HEIGHT));
  const cropHeight = Math.min(height, width * (SHOT_HEIGHT / SHOT_WIDTH));
  return [
    (width - cropWidth) / 2,
    (height - cropHeight) / 2,
    cropWidth,
    cropHeight,
  ] as const;
}

export function captureShot(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
    throw new Error("Camera isn’t ready.");
  }
  const shot = document.createElement("canvas");
  shot.width = SHOT_WIDTH;
  shot.height = SHOT_HEIGHT;
  const context = shot.getContext("2d");
  if (!context) throw new Error("Camera capture unavailable.");
  context.translate(SHOT_WIDTH, 0);
  context.scale(-1, 1);
  context.drawImage(
    video,
    ...centerCrop(video.videoWidth, video.videoHeight),
    0,
    0,
    SHOT_WIDTH,
    SHOT_HEIGHT,
  );
  return shot;
}

export function drawStrip(
  context: CanvasRenderingContext2D,
  shots: readonly CanvasImageSource[],
  border: Border,
  date: string,
  caption: string,
  marks: readonly Mark[],
  filter: Filter = "none",
) {
  if (shots.length !== SHOT_COUNT) throw new Error("Four shots required.");
  const { background, ink } = borders[border];
  context.fillStyle = background;
  context.fillRect(0, 0, STRIP_WIDTH, STRIP_HEIGHT);
  const css = filters[filter].css;
  // `ctx.filter` is still behind a flag in Safari; fall back to the matrix.
  const software = Boolean(css) && typeof context.filter !== "string";
  let scratch: {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
  } | null = null;
  if (software) {
    const scratchCanvas = document.createElement("canvas");
    scratchCanvas.width = SHOT_WIDTH;
    scratchCanvas.height = SHOT_HEIGHT;
    const scratchContext = scratchCanvas.getContext("2d");
    if (scratchContext) {
      scratch = { canvas: scratchCanvas, context: scratchContext };
    } else {
      context.filter = css;
    }
  } else if (css) {
    context.filter = css;
  }
  shots.forEach((shot, index) => {
    const y = 16 + index * (SHOT_HEIGHT + 12);
    if (scratch) {
      scratch.context.drawImage(shot, 0, 0, SHOT_WIDTH, SHOT_HEIGHT);
      const pixels = scratch.context.getImageData(
        0,
        0,
        SHOT_WIDTH,
        SHOT_HEIGHT,
      );
      applyMatrix(pixels.data, filters[filter].matrix);
      scratch.context.putImageData(pixels, 0, 0);
      context.drawImage(scratch.canvas, 16, y);
    } else {
      context.drawImage(shot, 16, y, SHOT_WIDTH, SHOT_HEIGHT);
    }
  });
  if (context.filter !== "none") context.filter = "none";
  context.strokeStyle = "#cbd5e1";
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, STRIP_WIDTH - 1, STRIP_HEIGHT - 1);
  context.textAlign = "center";
  context.fillStyle = ink;
  context.font = "600 16px system-ui, sans-serif";
  context.fillText(date, STRIP_WIDTH / 2, 1069);
  context.font = "18px system-ui, sans-serif";
  context.fillText(
    caption.trim().slice(0, CAPTION_LIMIT),
    STRIP_WIDTH / 2,
    1099,
    SHOT_WIDTH,
  );

  context.fillStyle = "#fff";
  context.strokeStyle = "#334155";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.textBaseline = "middle";
  context.font = "36px system-ui, sans-serif";
  for (const mark of marks) {
    if (mark.kind !== "pen") {
      context.lineWidth = 3;
      context.strokeText(stickers[mark.kind], mark.point.x, mark.point.y);
      context.fillText(stickers[mark.kind], mark.point.x, mark.point.y);
      continue;
    }
    const [first, ...rest] = mark.points;
    if (!first) continue;
    context.beginPath();
    context.moveTo(first.x, first.y);
    if (!rest.length) context.lineTo(first.x + 0.01, first.y);
    for (const point of rest) context.lineTo(point.x, point.y);
    context.lineWidth = 7;
    context.stroke();
    context.save();
    context.strokeStyle = "#fff";
    context.lineWidth = 4;
    context.stroke();
    context.restore();
  }
  context.textBaseline = "alphabetic";
}

export function stripBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Couldn’t save strip.")),
      type,
      quality,
    );
  });
}

export async function wallJpeg(canvas: HTMLCanvasElement) {
  for (const quality of [0.86, 0.68, 0.48, 0.3]) {
    const blob = await stripBlob(canvas, "image/jpeg", quality);
    if (blob.type === "image/jpeg" && blob.size <= MAX_STRIP_BYTES) return blob;
  }
  throw new Error("Strip is too large to post.");
}
