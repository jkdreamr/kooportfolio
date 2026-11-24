export const PHOTO_WIDTH = 1440;
export const PHOTO_HEIGHT = 960;
export const CARD_WIDTH = PHOTO_WIDTH + 128;
export const CARD_HEIGHT = PHOTO_HEIGHT + 192;
export type PhotoPose = "wave" | "smile" | "cheer";
export type PostcardFrame = "cream" | "pine";

/** WebGL readback starts at the bottom; ImageData starts at the top. */
export function uprightPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray<ArrayBuffer> {
  if (pixels.length !== width * height * 4 || width < 1 || height < 1)
    throw new Error("Invalid photo dimensions");
  const result = new Uint8ClampedArray(pixels.length);
  const stride = width * 4;
  for (let row = 0; row < height; row++)
    result.set(
      pixels.subarray(row * stride, (row + 1) * stride),
      (height - row - 1) * stride,
    );
  return result;
}

export function postcardFilename(date: Date) {
  return `joshua-village-${date.toISOString().replace(/[:.]/g, "-")}.png`;
}

export function composePostcard(
  pixels: Uint8Array,
  frame: PostcardFrame,
  date: Date,
) {
  const photo = document.createElement("canvas");
  photo.width = PHOTO_WIDTH;
  photo.height = PHOTO_HEIGHT;
  const photoContext = photo.getContext("2d");
  if (!photoContext) throw new Error("Photo canvas unavailable");
  photoContext.putImageData(
    new ImageData(
      uprightPixels(pixels, PHOTO_WIDTH, PHOTO_HEIGHT),
      PHOTO_WIDTH,
      PHOTO_HEIGHT,
    ),
    0,
    0,
  );
  const card = document.createElement("canvas");
  card.width = CARD_WIDTH;
  card.height = CARD_HEIGHT;
  const context = card.getContext("2d");
  if (!context) throw new Error("Postcard canvas unavailable");
  context.fillStyle = frame === "pine" ? "#203c32" : "#f4ebd7";
  context.fillRect(0, 0, card.width, card.height);
  context.drawImage(photo, 64, 64);
  context.fillStyle = frame === "pine" ? "#f4ebd7" : "#203c32";
  context.font = '700 25px "Trebuchet MS", Arial, sans-serif';
  context.fillText("JOSHUA.EXE", 68, 1097);
  context.font = '22px "Trebuchet MS", Arial, sans-serif';
  context.textAlign = "right";
  context.fillText(
    date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    CARD_WIDTH - 68,
    1097,
  );
  return card;
}

export function postcardBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Postcard could not be saved")),
      "image/png",
    );
  });
}
