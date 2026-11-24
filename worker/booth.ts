import {
  MAX_STRIP_BYTES,
  STRIP_HEIGHT,
  STRIP_WIDTH,
  WALL_LIMIT,
  type WallStrip,
} from "../src/shared/booth";

type Statement = {
  bind(...values: (number | string)[]): Statement;
  all<T>(): Promise<{ results: T[] }>;
};

export type BoothEnv = {
  BOOTH_DB?: {
    prepare(sql: string): Statement;
    batch(statements: Statement[]): Promise<unknown>;
  };
};

function reply(data: unknown, status = 200, headers?: Record<string, string>) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

async function readJpeg(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const bytes = new Uint8Array(MAX_STRIP_BYTES);
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) return bytes.subarray(0, length);
    if (length + value.length > bytes.length) {
      await reader.cancel();
      return null;
    }
    bytes.set(value, length);
    length += value.length;
  }
}

function isStripJpeg(bytes: Uint8Array) {
  if (
    bytes.length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  )
    return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let frame = false;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    if (offset + 3 > bytes.length) return false;
    const marker = bytes[offset++];
    const size = view.getUint16(offset);
    if (size < 2 || offset + size > bytes.length - 2) return false;
    if (marker === 0xda)
      return frame && size >= 8 && offset + size < bytes.length - 2;
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      if (
        frame ||
        ![0xc0, 0xc1, 0xc2].includes(marker) ||
        size < 8 ||
        bytes[offset + 2] !== 8 ||
        view.getUint16(offset + 3) !== STRIP_HEIGHT ||
        view.getUint16(offset + 5) !== STRIP_WIDTH ||
        ![1, 3].includes(bytes[offset + 7]) ||
        size !== 8 + 3 * bytes[offset + 7]
      )
        return false;
      frame = true;
    }
    offset += size;
  }
  return false;
}

function encode(bytes: Uint8Array) {
  let value = "";
  for (let start = 0; start < bytes.length; start += 8192) {
    value += String.fromCharCode(...bytes.subarray(start, start + 8192));
  }
  return btoa(value);
}

export async function boothApi(request: Request, { BOOTH_DB: db }: BoothEnv) {
  if (request.method !== "GET" && request.method !== "POST") {
    return reply({ error: "Method not allowed." }, 405, { Allow: "GET, POST" });
  }
  if (!db) return reply({ error: "Wall unavailable." }, 503);
  try {
    if (request.method === "GET") {
      const { results } = await db
        .prepare("SELECT id, jpeg FROM booth_strips ORDER BY seq DESC LIMIT ?")
        .bind(WALL_LIMIT)
        .all<WallStrip>();
      return reply({ strips: results });
    }
    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(request.url).origin) {
      return reply({ error: "Origin not allowed." }, 403);
    }
    if (request.headers.get("Content-Type")?.toLowerCase() !== "image/jpeg") {
      return reply({ error: "JPEG required." }, 415);
    }
    const bytes = await readJpeg(request);
    if (!bytes) return reply({ error: "Strip too large." }, 413);
    if (!isStripJpeg(bytes)) return reply({ error: "Invalid strip." }, 400);
    const id = crypto.randomUUID();
    await db.batch([
      db
        .prepare("INSERT INTO booth_strips (id, jpeg) VALUES (?, ?)")
        .bind(id, encode(bytes)),
      db
        .prepare(
          "DELETE FROM booth_strips WHERE seq <= (SELECT seq FROM booth_strips ORDER BY seq DESC LIMIT 1 OFFSET ?)",
        )
        .bind(WALL_LIMIT),
    ]);
    return reply({ id }, 201);
  } catch {
    return reply({ error: "Wall unavailable." }, 503);
  }
}
