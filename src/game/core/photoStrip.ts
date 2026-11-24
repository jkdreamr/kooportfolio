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
export type Border = keyof typeof borders;
export type Sticker = keyof typeof stickers;
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
) {
  if (shots.length !== SHOT_COUNT) throw new Error("Four shots required.");
  const { background, ink } = borders[border];
  context.fillStyle = background;
  context.fillRect(0, 0, STRIP_WIDTH, STRIP_HEIGHT);
  shots.forEach((shot, index) => {
    context.drawImage(
      shot,
      16,
      16 + index * (SHOT_HEIGHT + 12),
      SHOT_WIDTH,
      SHOT_HEIGHT,
    );
  });
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
