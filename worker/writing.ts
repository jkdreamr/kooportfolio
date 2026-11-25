import { validateWriting } from "../src/shared/writing";
import { isAllowedOrigin, type CorsEnv } from "./cors";
import type { WritingPost } from "../src/shared/writing";

// Small structural types keep this module usable in local SQLite tests too.
type Statement = {
  bind(...values: (string | number)[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
};
export type WritingEnv = CorsEnv & {
  WRITING_DB?: { prepare(sql: string): Statement };
  WRITING_ADMIN_TOKEN?: string;
};
const fields = "id, title, author, body, created_at AS createdAt";
const idPattern = /^[a-f0-9-]{36}$/i;
const tokenPattern = /^[a-f0-9]{64}$/i;
const reply = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
async function hash(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
}
async function readBody(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new Error("json");
  // Enforce bytes while streaming, not only a caller-supplied Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new Error("json");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32000) {
      await reader.cancel();
      throw new Error("large");
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, at);
    at += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(buffer));
}

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
          `SELECT ${fields} FROM writing_posts WHERE created_at < ? OR (created_at = ? AND id < ?) ORDER BY created_at DESC, id DESC LIMIT 25`,
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
    const origin = request.headers.get("Origin");
    if (!origin || !isAllowedOrigin(origin, request.url, env))
      return reply({ error: "Open the writing room to post." }, 403);
    if (request.method === "DELETE" && id) {
      const token =
        request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
      if (!tokenPattern.test(token))
        return reply({ error: "Not allowed." }, 403);
      const admin =
        env.WRITING_ADMIN_TOKEN && token === env.WRITING_ADMIN_TOKEN;
      const statement = admin
        ? db.prepare("DELETE FROM writing_posts WHERE id = ?").bind(id)
        : db
            .prepare(
              "DELETE FROM writing_posts WHERE id = ? AND delete_hash = ?",
            )
            .bind(id, await hash(token));
      const result = await statement.run();
      return result.meta.changes
        ? reply({ deleted: true })
        : reply({ error: "Post not found or not yours." }, 404);
    }
    if (!collection || request.method !== "POST")
      return reply({ error: "Not found." }, 404);
    let raw: unknown;
    try {
      raw = await readBody(request);
    } catch (error) {
      return reply(
        {
          error:
            error instanceof Error && error.message === "large"
              ? "Post is too large."
              : "Send a JSON post.",
        },
        error instanceof Error && error.message === "large" ? 413 : 400,
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
    const deleteHash = await hash(input.deleteToken);
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
    // Daily rotating network hash: no raw IPs. CF overwrites this header at the edge.
    // Local requests without it share one bucket. Never trust client author names.
    const network = await hash(
      `${Math.floor(now / 86400000)}:${request.headers.get("CF-Connecting-IP") ?? "local"}`,
    );
    // One atomic SQLite statement enforces 3 posts/hour, a global 100/hour and
    // 500 total posts. Separate receipts prevent deletion from resetting limits.
    const inserted = await db
      .prepare(
        `
      INSERT OR IGNORE INTO writing_posts (id, title, author, body, created_at, delete_hash, network)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM writing_posts) < 500
        AND (SELECT COUNT(*) FROM writing_receipts WHERE created_at > ?) < 100
        AND (SELECT COUNT(*) FROM writing_receipts WHERE network = ? AND created_at > ?) < 3
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
        now - 3600000,
        network,
        now - 3600000,
      )
      .run();
    if (!inserted.meta.changes)
      return reply(
        { error: "The room’s posting limit is reached. Try again later." },
        429,
        { "Retry-After": "3600" },
      );
    // Receipt insertion/pruning are triggers in the migration, in this transaction.
    return reply({ post: { ...draft, id: input.id, createdAt: now } }, 201);
  } catch {
    return reply(
      { error: "Public writing is unavailable. Your draft is still here." },
      503,
    );
  }
}
