import { writingApi, type WritingEnv } from "./writing";
import { BOOTH_PATH } from "../src/shared/booth";
import { boothApi, type BoothEnv } from "./booth";
import { reportApi } from "./report";
import { corsHeaders, type CorsEnv } from "./cors";
import { reply, type Database } from "./http";

/**
 * The shared backend for the photo wall and the writing shelf, on Cloudflare's
 * free tier only: one Worker and one D1 database (binding `DB`; booth strips
 * are base64 JPEG rows, pruned to the newest few). The contract is the one
 * src/shared/api.ts builds requests for:
 *
 *   GET    /api/health          200 { ok: true, features: { report } }
 *   GET    /api/booth           200 { strips: { id, jpeg }[] }
 *   POST   /api/booth           201 { id }      image/jpeg ≤ 160 KB
 *   GET    /api/writing         200 { posts, next }
 *   POST   /api/writing         201 { post }
 *   DELETE /api/writing/:id     200 { deleted }  Bearer author or admin token
 *   POST   /api/report          202 { reported } { kind, id }
 *
 * Owner-only (Bearer ADMIN_TOKEN): GET /api/report, DELETE /api/booth/:id.
 * Every response is JSON with CORS headers for ALLOWED_ORIGINS. All gameplay
 * works without this Worker; the client falls back to this-device copies.
 */
export type Env = WritingEnv &
  BoothEnv &
  CorsEnv & {
    /** The one D1 database (production). Older local configs bind
     * BOOTH_DB / WRITING_DB separately; either works. */
    DB?: Database;
  };

function stores(env: Env): Env {
  return {
    ...env,
    BOOTH_DB: env.BOOTH_DB ?? env.DB,
    WRITING_DB: env.WRITING_DB ?? env.DB,
  };
}

function withCors(response: Response, request: Request, env: Env) {
  const headers = corsHeaders(request, env);
  if (!headers["Access-Control-Allow-Origin"]) return response;
  const patched = new Response(response.body, response);
  for (const [key, value] of Object.entries(headers))
    patched.headers.set(key, value);
  return patched;
}

const isApi = (path: string) =>
  path === "/api/health" ||
  path === "/api/report" ||
  path === BOOTH_PATH ||
  path.startsWith(`${BOOTH_PATH}/`) ||
  path === "/api/writing" ||
  path.startsWith("/api/writing/");

async function route(request: Request, env: Env, path: string): Promise<Response> {
  if (path === "/api/health") {
    if (request.method !== "GET" && request.method !== "HEAD")
      return reply({ error: "Method not allowed." }, 405, { Allow: "GET" });
    // Live only when both stores are bound: the client then uses the shared
    // wall and shelf; otherwise it keeps its on-device copies.
    const live = !!env.BOOTH_DB && !!env.WRITING_DB;
    return reply(
      live ? { ok: true, features: { report: true } } : { ok: false, features: { report: false } },
      live ? 200 : 503,
    );
  }
  if (path === "/api/report") return reportApi(request, env);
  if (path === BOOTH_PATH || path.startsWith(`${BOOTH_PATH}/`)) return boothApi(request, env);
  return writingApi(request, env);
}

export default {
  async fetch(request: Request, raw: Env = {}): Promise<Response> {
    const env = stores(raw);
    const path = new URL(request.url).pathname;
    if (!isApi(path))
      return withCors(reply({ error: "Not found." }, 404), request, env);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    try {
      return withCors(await route(request, env, path), request, env);
    } catch {
      return withCors(reply({ error: "Unavailable." }, 503), request, env);
    }
  },
};
