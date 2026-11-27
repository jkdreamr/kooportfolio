import {
  BOOTH_PATH,
  MAX_STRIP_BYTES,
  STRIP_HEIGHT,
  STRIP_WIDTH,
  WALL_LIMIT,
  type WallStrip,
} from "../src/shared/booth";
import { POST_COOLDOWN_MS } from "../src/shared/writing";
import { isAllowedOrigin, type CorsEnv } from "./cors";
import {
  BodyTooLarge,
  clientIp,
  isAdmin,
  readBytes,
  reply,
  REPORT_HIDE_AT,
  retryAfter,
  type AdminEnv,
  type Database,
} from "./http";

export type BoothEnv = CorsEnv &
  AdminEnv & {
    BOOTH_DB?: Database;
  };

/** Per visitor: 3 strips an hour, and a minute between two (the client
 * shows the same cooldown before it even asks). */
export const BOOTH_POST_LIMIT = 3;
export const BOOTH_POST_WINDOW_SECONDS = 3600;
const COOLDOWN_SECONDS = POST_COOLDOWN_MS / 1000;
const stripIdPattern = /^[a-f0-9-]{36}$/i;

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

/** Base64 of the JPEG: D1 has no object storage, so a strip is a ≤ 160 KB
 * JPEG kept as text (≤ ~214 KB a row, well under D1's 2 MB row limit), and
 * the wall keeps only the newest WALL_LIMIT of them. */
function encode(bytes: Uint8Array) {
  let value = "";
  for (let start = 0; start < bytes.length; start += 8192) {
    value += String.fromCharCode(...bytes.subarray(start, start + 8192));
  }
  return btoa(value);
}

async function visitorHash(request: Request) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`photo-booth:${clientIp(request)}`),
  );
  return encode(new Uint8Array(digest));
}

/** Strips with REPORT_HIDE_AT reports or more stay off the wall. */
const VISIBLE = `id NOT IN (SELECT target_id FROM reports WHERE kind = 'strip'
  GROUP BY target_id HAVING COUNT(*) >= ${REPORT_HIDE_AT})`;

export async function boothApi(request: Request, env: BoothEnv) {
  const { BOOTH_DB: db } = env;
  const path = new URL(request.url).pathname;
  const id = path.startsWith(`${BOOTH_PATH}/`) ? path.slice(BOOTH_PATH.length + 1) : null;
  if (id !== null) {
    // The owner removes a strip: DELETE /api/booth/<id> with the admin token.
    if (request.method !== "DELETE")
      return reply({ error: "Method not allowed." }, 405, { Allow: "DELETE" });
    if (!stripIdPattern.test(id)) return reply({ error: "Not found." }, 404);
    if (!(await isAdmin(request, env))) return reply({ error: "Not allowed." }, 403);
    if (!db) return reply({ error: "Wall unavailable." }, 503);
    try {
      const [removed] = await db.batch([
        db.prepare("DELETE FROM booth_strips WHERE id = ?").bind(id),
        db.prepare("DELETE FROM reports WHERE kind = 'strip' AND target_id = ?").bind(id),
      ]);
      const changes = (removed as { meta?: { changes?: number } }).meta?.changes ?? 0;
      return changes ? reply({ deleted: true }) : reply({ error: "Not found." }, 404);
    } catch {
      return reply({ error: "Wall unavailable." }, 503);
    }
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return reply({ error: "Method not allowed." }, 405, { Allow: "GET, POST" });
  }
  if (!db) return reply({ error: "Wall unavailable." }, 503);
  try {
    if (request.method === "GET") {
      const { results } = await db
        .prepare(`SELECT id, jpeg FROM booth_strips WHERE ${VISIBLE} ORDER BY seq DESC LIMIT ?`)
        .bind(WALL_LIMIT)
        .all<WallStrip>();
      return reply({ strips: results });
    }
    if (!isAllowedOrigin(request.headers.get("Origin"), request.url, env)) {
      return reply({ error: "Origin not allowed." }, 403);
    }
    if (request.headers.get("Content-Type")?.toLowerCase() !== "image/jpeg") {
      return reply({ error: "JPEG required." }, 415);
    }
    let bytes: Uint8Array;
    try {
      bytes = await readBytes(request, MAX_STRIP_BYTES);
    } catch (error) {
      if (error instanceof BodyTooLarge) return reply({ error: "Strip too large." }, 413);
      throw error;
    }
    if (!isStripJpeg(bytes)) return reply({ error: "Invalid strip." }, 400);
    const stripId = crypto.randomUUID();
    const visitor = await visitorHash(request);
    const now = Math.floor(Date.now() / 1000);
    const since = now - BOOTH_POST_WINDOW_SECONDS;
    // One batch (one transaction): the insert happens only under both
    // limits, its receipt is written with it, and the wall is pruned to the
    // newest WALL_LIMIT strips.
    const [insert] = await db.batch([
      db
        .prepare(
          `INSERT INTO booth_strips (id, jpeg)
           SELECT ?, ? WHERE (SELECT COUNT(*) FROM booth_post_limits
             WHERE visitor_hash = ? AND posted_at > ?) < ?
           AND NOT EXISTS (SELECT 1 FROM booth_post_limits
             WHERE visitor_hash = ? AND posted_at > ?)
           RETURNING id`,
        )
        .bind(stripId, encode(bytes), visitor, since, BOOTH_POST_LIMIT, visitor, now - COOLDOWN_SECONDS),
      db
        .prepare(
          "INSERT INTO booth_post_limits (post_id, visitor_hash, posted_at) SELECT id, ?, ? FROM booth_strips WHERE id = ?",
        )
        .bind(visitor, now, stripId),
      db
        .prepare("DELETE FROM booth_post_limits WHERE posted_at <= ?")
        .bind(since),
      db
        .prepare(
          "DELETE FROM booth_strips WHERE seq <= (SELECT seq FROM booth_strips ORDER BY seq DESC LIMIT 1 OFFSET ?)",
        )
        .bind(WALL_LIMIT),
      db
        .prepare(
          "DELETE FROM reports WHERE kind = 'strip' AND target_id NOT IN (SELECT id FROM booth_strips)",
        ),
    ]);
    if (!insert.results.length) {
      const last = await db
        .prepare("SELECT MAX(posted_at) AS last FROM booth_post_limits WHERE visitor_hash = ?")
        .bind(visitor)
        .first<{ last: number | null }>();
      const cooling = last?.last != null && last.last > now - COOLDOWN_SECONDS;
      return reply({ error: "Too many posts. Try again later." }, 429, {
        "Retry-After": cooling
          ? retryAfter(last.last! * 1000, POST_COOLDOWN_MS, now * 1000)
          : String(BOOTH_POST_WINDOW_SECONDS),
      });
    }
    return reply({ id: stripId }, 201);
  } catch {
    return reply({ error: "Wall unavailable." }, 503);
  }
}

/** Exists only for the report handler: is this strip on the wall? */
export async function stripExists(db: Database, id: string) {
  return !!(await db.prepare("SELECT 1 AS found FROM booth_strips WHERE id = ?").bind(id).first());
}
