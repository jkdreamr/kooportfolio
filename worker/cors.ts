// Cross-origin access for the API when the frontend is hosted statically
// (e.g. Vercel) and calls the Worker on another origin. ALLOWED_ORIGINS is a
// comma-separated list of exact origins ("https://kooportfolio.vercel.app")
// and suffix entries (".vercel.app" matches any subdomain, for preview URLs).
export type CorsEnv = { ALLOWED_ORIGINS?: string };

export function isAllowedOrigin(
  origin: string | null,
  requestUrl: string,
  env: CorsEnv,
): boolean {
  if (!origin) return true;
  if (origin === new URL(requestUrl).origin) return true;
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  return (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) =>
      entry.startsWith(".") ? host.endsWith(entry) : origin === entry,
    );
}

export function corsHeaders(
  request: Request,
  env: CorsEnv,
): Record<string, string> {
  const origin = request.headers.get("Origin");
  if (!origin || !isAllowedOrigin(origin, request.url, env)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
