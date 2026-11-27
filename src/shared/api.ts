// Base URL for API calls. Same-origin under the Worker; on static hosts
// (e.g. Vercel) VITE_API_BASE points at the deployed Worker's origin.
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * The response was not the API talking: a static host answered with its
 * HTML page, or nothing answered at all. Callers show their offline copy;
 * the message is never meant for a visitor.
 */
export class ApiUnavailable extends Error {
  constructor(message = "API unavailable") {
    super(message);
    this.name = "ApiUnavailable";
  }
}

const isJson = (response: Response) =>
  (response.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");

/** Parses a JSON response body. Anything that is not JSON (an `<!doctype`
 * page from a static host, an empty body) throws ApiUnavailable instead of
 * reaching JSON.parse. */
export async function readJson<T = unknown>(response: Response): Promise<T> {
  if (!isJson(response)) throw new ApiUnavailable(`Not JSON (${response.status})`);
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiUnavailable(`Malformed JSON (${response.status})`);
  }
}

export const HEALTH_TIMEOUT_MS = 2500;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** One probe of `/api/health`: true only for a 2xx JSON answer in time. */
export async function probeApi(
  fetcher: Fetch = (input, init) => fetch(input, init),
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(apiUrl("/api/health"), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    return response.ok && isJson(response);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let memo: Promise<boolean> | null = null;

/** Whether the shared backend (photo wall, writing shelf) exists. Probed
 * once per page session; static hosting answers false, which is the truth. */
export function apiAvailable(): Promise<boolean> {
  memo ??= probeApi();
  return memo;
}

/** Tests only: forget the memoised answer. */
export function resetApiAvailable(): void {
  memo = null;
}
