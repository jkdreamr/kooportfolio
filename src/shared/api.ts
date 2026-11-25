// Base URL for API calls. Same-origin under the Worker; on static hosts
// (e.g. Vercel) VITE_API_BASE points at the deployed Worker's origin.
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
