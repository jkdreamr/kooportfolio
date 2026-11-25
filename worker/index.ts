import { writingApi, type WritingEnv } from "./writing";
import { BOOTH_PATH } from "../src/shared/booth";
import { boothApi, type BoothEnv } from "./booth";
import { corsHeaders, type CorsEnv } from "./cors";

type Env = WritingEnv & BoothEnv & CorsEnv;

function withCors(response: Response, request: Request, env: Env) {
  const headers = corsHeaders(request, env);
  if (!headers["Access-Control-Allow-Origin"]) return response;
  const patched = new Response(response.body, response);
  for (const [key, value] of Object.entries(headers))
    patched.headers.set(key, value);
  return patched;
}

// No cloud wallet or pretend verified scores. All gameplay works without this API.
export default {
  async fetch(request: Request, env: Env = {}): Promise<Response> {
    const path = new URL(request.url).pathname;
    const api =
      path === BOOTH_PATH ||
      path === "/api/writing" ||
      path.startsWith("/api/writing/") ||
      path === "/api/health";
    if (api && request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (path === BOOTH_PATH)
      return withCors(await boothApi(request, env), request, env);
    if (path === "/api/writing" || path.startsWith("/api/writing/"))
      return withCors(await writingApi(request, env), request, env);
    if (path === "/api/health")
      return withCors(
        Response.json({ status: "ok", mode: "local-guest", version: 1 }),
        request,
        env,
      );
    return withCors(
      Response.json(
        {
          error:
            "Cloud saves and verified rankings are not enabled. Local play remains available.",
        },
        {
          status: 503,
          headers: { "Retry-After": "3600", "Cache-Control": "no-store" },
        },
      ),
      request,
      env,
    );
  },
};
