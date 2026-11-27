import { isAllowedOrigin, type CorsEnv } from "./cors";
import { stripExists } from "./booth";
import { postExists } from "./writing";
import {
  BodyTooLarge,
  dailyNetwork,
  isAdmin,
  readJsonBody,
  reply,
  REPORT_HIDE_AT,
  type AdminEnv,
  type Database,
} from "./http";

export type ReportEnv = CorsEnv &
  AdminEnv & {
    BOOTH_DB?: Database;
    WRITING_DB?: Database;
  };

/** Reports one network may file in an hour. */
export const REPORTS_PER_HOUR = 20;
const idPattern = /^[a-f0-9-]{36}$/i;

/**
 * POST /api/report `{ kind: "strip" | "writing", id }` → `202 { reported: true }`.
 * One report per item per network (repeats are accepted and ignored); an
 * item with REPORT_HIDE_AT reports is hidden from its list at once.
 * GET /api/report with the admin token lists what has been reported, for the
 * owner to review (delete with DELETE /api/booth/<id> or /api/writing/<id>).
 */
export async function reportApi(request: Request, env: ReportEnv) {
  if (request.method === "GET") {
    if (!(await isAdmin(request, env))) return reply({ error: "Not allowed." }, 403);
    // One database in production; two only in older local configs.
    const stores = [...new Set([env.WRITING_DB, env.BOOTH_DB].filter((db) => !!db))] as Database[];
    if (!stores.length) return reply({ error: "Reports unavailable." }, 503);
    try {
      const rows = [];
      for (const db of stores) {
        const { results } = await db
          .prepare(
            `SELECT kind, target_id AS id, COUNT(*) AS reports, MAX(created_at) AS lastReportedAt,
               COUNT(*) >= ${REPORT_HIDE_AT} AS hidden
             FROM reports GROUP BY kind, target_id ORDER BY lastReportedAt DESC LIMIT 200`,
          )
          .all<{ kind: string; id: string; reports: number; lastReportedAt: number; hidden: number }>();
        rows.push(...results);
      }
      rows.sort((a, b) => b.lastReportedAt - a.lastReportedAt);
      return reply({ reports: rows.map((row) => ({ ...row, hidden: !!row.hidden })) });
    } catch {
      return reply({ error: "Reports unavailable." }, 503);
    }
  }
  if (request.method !== "POST")
    return reply({ error: "Method not allowed." }, 405, { Allow: "GET, POST" });
  const origin = request.headers.get("Origin");
  if (!origin || !isAllowedOrigin(origin, request.url, env))
    return reply({ error: "Origin not allowed." }, 403);
  let raw: unknown;
  try {
    raw = await readJsonBody(request, 1024);
  } catch (error) {
    const large = error instanceof BodyTooLarge;
    return reply({ error: large ? "Too large." : "Send JSON." }, large ? 413 : 400);
  }
  const { kind, id } = (raw ?? {}) as { kind?: unknown; id?: unknown };
  if ((kind !== "strip" && kind !== "writing") || typeof id !== "string" || !idPattern.test(id))
    return reply({ error: "Unknown item." }, 400);
  const target = kind === "strip" ? env.BOOTH_DB : env.WRITING_DB;
  if (!target) return reply({ error: "Reports unavailable." }, 503);
  try {
    const exists = kind === "strip" ? await stripExists(target, id) : await postExists(target, id);
    if (!exists) return reply({ error: "Not found." }, 404);
    const now = Date.now();
    const network = await dailyNetwork(request, now);
    const result = await target
      .prepare(
        `INSERT OR IGNORE INTO reports (kind, target_id, network, created_at)
         SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM reports
           WHERE network = ? AND created_at > ?) < ${REPORTS_PER_HOUR}`,
      )
      .bind(kind, id, network, now, network, now - 3600000)
      .run();
    if (!result.meta.changes) {
      const already = await target
        .prepare("SELECT 1 AS found FROM reports WHERE kind = ? AND target_id = ? AND network = ?")
        .bind(kind, id, network)
        .first();
      if (!already)
        return reply({ error: "Too many reports. Try again later." }, 429, { "Retry-After": "3600" });
    }
    return reply({ reported: true }, 202);
  } catch {
    return reply({ error: "Reports unavailable." }, 503);
  }
}
