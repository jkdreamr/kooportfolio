import {
  checkPublicText,
  POST_COOLDOWN_MS,
  textCheckCopy,
  validateWriting,
  type WritingPost,
} from "../src/shared/writing";
import { isAllowedOrigin, type CorsEnv } from "./cors";
import {
  BodyTooLarge,
  bearer,
  dailyNetwork,
  isAdmin,
  readJsonBody,
  reply,
  REPORT_HIDE_AT,
  retryAfter,
  sha256Hex,
  tokenPattern,
  type AdminEnv,
  type Database,
} from "./http";

export type WritingEnv = CorsEnv &
  AdminEnv & {
    WRITING_DB?: Database;
  };

const fields = "id, title, author, body, created_at AS createdAt";
const idPattern = /^[a-f0-9-]{36}$/i;
/** Posts with REPORT_HIDE_AT reports or more stay off the shelf. */
const VISIBLE = `id NOT IN (SELECT target_id FROM reports WHERE kind = 'writing'
  GROUP BY target_id HAVING COUNT(*) >= ${REPORT_HIDE_AT})`;
/** Per network: 3 posts an hour and a minute between two; 100 posts an
 * hour across everyone; 500 posts kept in all. */
export const WRITING_LIMITS_PER_HOUR = 3;
const GLOBAL_PER_HOUR = 100;
const TOTAL_POSTS = 500;
const HOUR = 3600000;

export async function writingApi(
  request: Request,
  env: WritingEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.match(/^\/api\/writing\/([a-f0-9-]{36})$/i)?.[1];
  const collection = url.pathname === "/api/writing";
  if (!collection && !id) return reply({ error: "Not found." }, 404);
  if (!env.WRITING_DB)
    return reply(
      { error: "Public writing isn’t connected yet. Your draft stays here." },
      503,
    );
  const db = env.WRITING_DB;
  try {
    if (request.method === "GET" && collection) {
      const before = url.searchParams.get("before");
      if (before && !/^\d{1,16}:[a-f0-9-]{36}$/i.test(before))
        return reply({ error: "Invalid page." }, 400);
      const [time, cursorId] = before?.split(":") ?? ["9007199254740991", ""];
      const { results } = await db
        .prepare(
          `SELECT ${fields} FROM writing_posts WHERE (created_at < ? OR (created_at = ? AND id < ?)) AND ${VISIBLE} ORDER BY created_at DESC, id DESC LIMIT 25`,
        )
        .bind(Number(time), Number(time), cursorId)
        .all<WritingPost>();
      const posts = results.slice(0, 24),
        last = posts.at(-1);
      return reply({
        posts,
        next:
          results.length > 24 && last ? `${last.createdAt}:${last.id}` : null,
      });
    }
    if (request.method !== "POST" && request.method !== "DELETE")
      return reply({ error: "Method not allowed." }, 405, {
        Allow: collection ? "GET, POST" : "DELETE",
      });
    if (request.method === "DELETE" && id) {
      // The owner's admin token works from anywhere (a bearer token is no
      // ambient credential); an author's own token only from the site.
      const admin = await isAdmin(request, env);
      const origin = request.headers.get("Origin");
      if (!admin && (!origin || !isAllowedOrigin(origin, request.url, env)))
        return reply({ error: "Open the writing room to post." }, 403);
      const token = bearer(request);
      if (!admin && !tokenPattern.test(token))
        return reply({ error: "Not allowed." }, 403);
      const statement = admin
        ? db.prepare("DELETE FROM writing_posts WHERE id = ?").bind(id)
        : db
            .prepare(
              "DELETE FROM writing_posts WHERE id = ? AND delete_hash = ?",
            )
            .bind(id, await sha256Hex(token));
      const result = await statement.run();
      if (!result.meta.changes)
        return reply({ error: "Post not found or not yours." }, 404);
      await db
        .prepare("DELETE FROM reports WHERE kind = 'writing' AND target_id = ?")
        .bind(id)
        .run();
      return reply({ deleted: true });
    }
    if (!collection || request.method !== "POST")
      return reply({ error: "Not found." }, 404);
    const origin = request.headers.get("Origin");
    if (!origin || !isAllowedOrigin(origin, request.url, env))
      return reply({ error: "Open the writing room to post." }, 403);
    let raw: unknown;
    try {
      raw = await readJsonBody(request, 32000);
    } catch (error) {
      const large = error instanceof BodyTooLarge;
      return reply(
        { error: large ? "Post is too large." : "Send a JSON post." },
        large ? 413 : 400,
      );
    }
    const draft = validateWriting(raw);
    const input = raw as Record<string, unknown> | null;
    if (
      !draft ||
      typeof input?.id !== "string" ||
      !idPattern.test(input.id) ||
      typeof input.deleteToken !== "string" ||
      !tokenPattern.test(input.deleteToken)
    )
      return reply(
        { error: "Add a name, title and writing within the length limits." },
        400,
      );
    // The same public-text check the client runs, enforced here: no links,
    // no slurs or abuse (leetspeak and spaced letters included).
    for (const text of [draft.title, draft.author, draft.body]) {
      const check = checkPublicText(text);
      if (!check.ok)
        return reply({ error: textCheckCopy(check.reason), reason: check.reason }, 400);
    }
    const deleteHash = await sha256Hex(input.deleteToken);
    const existing = await db
      .prepare(
        `SELECT ${fields}, delete_hash AS deleteHash FROM writing_posts WHERE id = ?`,
      )
      .bind(input.id)
      .first<WritingPost & { deleteHash: string }>();
    if (existing) {
      if (existing.deleteHash !== deleteHash)
        return reply({ error: "Post ID already used." }, 409);
      return reply({
        post: {
          id: existing.id,
          title: existing.title,
          author: existing.author,
          body: existing.body,
          createdAt: existing.createdAt,
        },
      });
    }
    const now = Date.now();
    // Daily rotating network hash: no raw IPs. Never trust client author names.
    const network = await dailyNetwork(request, now);
    // One atomic statement enforces every limit. Receipts (inserted by a
    // trigger in the same transaction) outlive deletion, so deleting your
    // own post never resets your limit.
    const inserted = await db
      .prepare(
        `
      INSERT OR IGNORE INTO writing_posts (id, title, author, body, created_at, delete_hash, network)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM writing_posts) < ${TOTAL_POSTS}
        AND (SELECT COUNT(*) FROM writing_receipts WHERE created_at > ?) < ${GLOBAL_PER_HOUR}
        AND (SELECT COUNT(*) FROM writing_receipts WHERE network = ? AND created_at > ?) < ${WRITING_LIMITS_PER_HOUR}
        AND NOT EXISTS (SELECT 1 FROM writing_receipts WHERE network = ? AND created_at > ?)
    `,
      )
      .bind(
        input.id,
        draft.title,
        draft.author,
        draft.body,
        now,
        deleteHash,
        network,
        now - HOUR,
        network,
        now - HOUR,
        network,
        now - POST_COOLDOWN_MS,
      )
      .run();
    if (!inserted.meta.changes) {
      const last = await db
        .prepare("SELECT MAX(created_at) AS last FROM writing_receipts WHERE network = ?")
        .bind(network)
        .first<{ last: number | null }>();
      const cooling = last?.last != null && last.last > now - POST_COOLDOWN_MS;
      return reply(
        { error: "The room’s posting limit is reached. Try again later." },
        429,
        { "Retry-After": cooling ? retryAfter(last.last!, POST_COOLDOWN_MS, now) : "3600" },
      );
    }
    return reply({ post: { ...draft, id: input.id, createdAt: now } }, 201);
  } catch {
    return reply(
      { error: "Public writing is unavailable. Your draft is still here." },
      503,
    );
  }
}

/** Exists only for the report handler: is this post on the shelf? */
export async function postExists(db: Database, id: string) {
  return !!(await db.prepare("SELECT 1 AS found FROM writing_posts WHERE id = ?").bind(id).first());
}
