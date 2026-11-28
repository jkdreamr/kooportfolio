/**
 * Client side of the shared backend (the global photo wall and writing
 * shelf), a Cloudflare Worker that may live on another origin.
 *
 * - `VITE_API_BASE` is the Worker's absolute origin, for example
 *   https://<name>.<account>.workers.dev. Unset, requests go to the same
 *   origin's `/api`.
 * - `apiStatus()` probes `GET <base>/api/health` once per page session
 *   (3 s timeout). The backend counts as live only for HTTP 200 with a JSON
 *   body `{ "ok": true }`: a static host's index.html, a 404 or a timeout
 *   all mean "not live", and the features fall back to this device.
 * - The request builders below are the whole contract the client expects;
 *   the Worker must answer them with JSON and CORS headers.
 */
import type { WritingDraft } from "./writing";

export function apiBase(
  env: { VITE_API_BASE?: string } = import.meta.env as { VITE_API_BASE?: string },
): string {
  const raw = (env.VITE_API_BASE ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
  // A host without a scheme (worker.example.com) would silently fall back
  // to same-origin: say so.
  if (typeof console !== "undefined")
    console.warn(`VITE_API_BASE "${raw}" has no http(s):// scheme; using same-origin /api instead.`);
  return "";
}

const API_BASE = apiBase();

export function apiUrl(path: string, base = API_BASE): string {
  return `${base}${path}`;
}

/**
 * The response was not the API talking: a static host answered with its
 * HTML page, or nothing answered at all. Callers show their on-device copy;
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

/**
 * Reads an API reply, status first. 503 (the Worker without its database),
 * or a 404/405 that is not JSON (a static host without the route), mean no
 * API here: ApiUnavailable. Any other error status throws `failure(status)`
 * whatever its body, so a 429 or a 5xx page keeps its own visitor copy
 * instead of being taken for "backend gone". A success must be JSON.
 */
export async function readApiResponse<T = unknown>(response: Response, failure: (status: number) => Error): Promise<T> {
  if (response.status === 503) throw new ApiUnavailable();
  if (!response.ok) {
    if ((response.status === 404 || response.status === 405) && !isJson(response)) throw new ApiUnavailable();
    throw failure(response.status);
  }
  return readJson<T>(response);
}

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

export const HEALTH_TIMEOUT_MS = 3000;

/** What the client learned from `/api/health`. */
export type ApiStatus = {
  live: boolean;
  /** Optional abilities the Worker advertises, e.g. `{ report: true }`. */
  features: { report?: boolean };
};
export const OFFLINE: ApiStatus = Object.freeze({ live: false, features: Object.freeze({}) });

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Reads a health response: live only for 200 + JSON + `ok: true`. */
export async function healthStatus(response: Response): Promise<ApiStatus> {
  if (response.status !== 200 || !isJson(response)) return OFFLINE;
  try {
    const body = (await response.json()) as { ok?: unknown; features?: { report?: unknown } };
    if (body?.ok !== true) return OFFLINE;
    return { live: true, features: { report: body.features?.report === true } };
  } catch {
    return OFFLINE;
  }
}

/** One probe of `/api/health`. */
export async function probeApi(
  fetcher: Fetch = (input, init) => fetch(input, init),
  timeoutMs = HEALTH_TIMEOUT_MS,
  base = API_BASE,
): Promise<ApiStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { url, init } = healthRequest(base);
    const response = await fetcher(url, { ...init, signal: controller.signal });
    return await healthStatus(response);
  } catch {
    return OFFLINE;
  } finally {
    clearTimeout(timer);
  }
}

let memo: Promise<ApiStatus> | null = null;
let offlineAt = -1;
let retries = 0;
/** After a "not live" answer, a later call probes again once this long has
 * passed (a slow cold network must not keep the wall local all session). */
export const API_RETRY_MS = [5000, 20000, 60000] as const;

/** The shared backend's status. Probed once per page session; a not-live
 * answer is probed again on a later call after a backoff, at most
 * API_RETRY_MS.length times. */
export function apiStatus(now = Date.now()): Promise<ApiStatus> {
  if (memo && offlineAt >= 0 && retries < API_RETRY_MS.length && now - offlineAt >= API_RETRY_MS[retries]) {
    retries++;
    memo = null;
  }
  if (!memo) {
    offlineAt = -1;
    memo = probeApi().then((status) => {
      if (!status.live) offlineAt = Date.now();
      return status;
    });
  }
  return memo;
}

/** Whether the shared backend is live (see apiStatus). */
export const apiAvailable = (): Promise<boolean> => apiStatus().then((s) => s.live);

/** Tests only: forget the memoised answer. */
export function resetApiAvailable(): void {
  memo = null;
  offlineAt = -1;
  retries = 0;
}

// ── Request builders: the API contract ───────────────────────────────────
export type ApiRequest = { url: string; init: RequestInit };
/** Cross-origin, no cookies: the Worker identifies nobody by session. */
const base = (method: string, headers: Record<string, string> = {}): RequestInit => ({
  method,
  mode: "cors",
  credentials: "omit",
  cache: "no-store",
  headers: { Accept: "application/json", ...headers },
});

export const healthRequest = (b = API_BASE): ApiRequest => ({
  url: apiUrl("/api/health", b),
  init: base("GET"),
});

/** GET the newest strips: `200 { strips: { id, jpeg (base64) }[] }`. */
export const wallListRequest = (b = API_BASE): ApiRequest => ({
  url: apiUrl("/api/booth", b),
  init: base("GET"),
});

/** POST one strip as a JPEG body: `201 { id }`, `429` with Retry-After. */
export const wallPostRequest = (jpeg: Blob, b = API_BASE): ApiRequest => ({
  url: apiUrl("/api/booth", b),
  init: { ...base("POST", { "Content-Type": "image/jpeg" }), body: jpeg },
});

/** GET a page of posts: `200 { posts: WritingPost[], next: string | null }`. */
export const writingListRequest = (cursor?: string | null, b = API_BASE): ApiRequest => ({
  url: apiUrl(`/api/writing${cursor ? `?before=${encodeURIComponent(cursor)}` : ""}`, b),
  init: base("GET"),
});

/** POST a piece: `201 { post: WritingPost }`. The client mints the id and a
 * secret delete token; the Worker stores only the token's hash. */
export const writingPostRequest = (
  draft: WritingDraft,
  ids: { id: string; deleteToken: string },
  b = API_BASE,
): ApiRequest => ({
  url: apiUrl("/api/writing", b),
  init: {
    ...base("POST", { "Content-Type": "application/json" }),
    body: JSON.stringify({ title: draft.title, author: draft.author, body: draft.body, ...ids }),
  },
});

/** DELETE your own piece with its token: `200 { deleted: true }`. */
export const writingDeleteRequest = (id: string, deleteToken: string, b = API_BASE): ApiRequest => ({
  url: apiUrl(`/api/writing/${encodeURIComponent(id)}`, b),
  init: base("DELETE", { Authorization: `Bearer ${deleteToken}` }),
});

export type ReportKind = "strip" | "writing";
/** POST a report (only when health advertises `features.report`):
 * `202 { reported: true }`. */
export const reportRequest = (kind: ReportKind, id: string, b = API_BASE): ApiRequest => ({
  url: apiUrl("/api/report", b),
  init: {
    ...base("POST", { "Content-Type": "application/json" }),
    body: JSON.stringify({ kind, id }),
  },
});
