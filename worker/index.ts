// No cloud wallet or pretend verified scores. All gameplay works without this API.
export default {
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/api/health")
      return Response.json({ status: "ok", mode: "local-guest", version: 1 });
    return Response.json(
      {
        error:
          "Cloud saves and verified rankings are not enabled. Local play remains available.",
      },
      {
        status: 503,
        headers: { "Retry-After": "3600", "Cache-Control": "no-store" },
      },
    );
  },
};
