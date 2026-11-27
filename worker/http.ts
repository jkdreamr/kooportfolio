// Shared pieces of the API Worker: the D1 shape it uses (structural, so the
// tests can back it with node:sqlite), JSON replies, request hashing, the
// admin token and bounded body reads.

export type Statement = {
  bind(...values: (string | number | null)[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
};
export type Database = {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<{ results: unknown[] }[]>;
};

export type AdminEnv = {
  /** `wrangler secret put ADMIN_TOKEN`: 64 hex characters
   * (`openssl rand -hex 32`). WRITING_ADMIN_TOKEN is the older name. */
  ADMIN_TOKEN?: string;
  WRITING_ADMIN_TOKEN?: string;
};

export function reply(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export async function sha256Hex(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
}

/** The visitor's address as Cloudflare reports it (the edge overwrites the
 * header; local and test requests without it share one bucket). */
export const clientIp = (request: Request) =>
  request.headers.get("CF-Connecting-IP") ?? "local";

/** A per-day hash of the visitor's address: limits and reports are tied to
 * it, and no raw IP is ever stored. */
export const dailyNetwork = (request: Request, now = Date.now()) =>
  sha256Hex(`${Math.floor(now / 86400000)}:${clientIp(request)}`);

export const tokenPattern = /^[a-f0-9]{64}$/i;
export const bearer = (request: Request) =>
  request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";

/** True only for the configured admin token (compared as digests, so the
 * comparison time does not depend on how much of the token matched). */
export async function isAdmin(request: Request, env: AdminEnv) {
  const expected = env.ADMIN_TOKEN || env.WRITING_ADMIN_TOKEN;
  const token = bearer(request);
  if (!expected || !tokenPattern.test(expected) || !tokenPattern.test(token)) return false;
  return (await sha256Hex(token.toLowerCase())) === (await sha256Hex(expected.toLowerCase()));
}

export class BodyTooLarge extends Error {}

/** Reads at most `limit` bytes of the body (enforced while streaming, not
 * trusted from Content-Length); empty when there is no body. */
export async function readBytes(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new BodyTooLarge();
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, at);
    at += chunk.byteLength;
  }
  return buffer;
}

/** A JSON body of at most `limit` bytes; throws BodyTooLarge or SyntaxError. */
export async function readJsonBody(request: Request, limit: number): Promise<unknown> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
    throw new SyntaxError("json");
  const bytes = await readBytes(request, limit);
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Seconds until `last + cooldown` (at least 1), for Retry-After. */
export const retryAfter = (last: number, cooldownMs: number, now = Date.now()) =>
  String(Math.max(1, Math.ceil((last + cooldownMs - now) / 1000)));

/** Items hidden after this many distinct reports. */
export const REPORT_HIDE_AT = 3;
