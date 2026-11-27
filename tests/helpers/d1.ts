// A D1 stand-in on node:sqlite for the Worker tests: prepare/bind/first/all/
// run, and batch as one transaction (D1's own semantics). Every migration in
// migrations/ is applied in order, exactly as `wrangler d1 migrations apply`.
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import type { Database, Statement } from "../../worker/http";

const MIGRATIONS = new URL("../../migrations/", import.meta.url);

export function migrationFiles() {
  return readdirSync(MIGRATIONS)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
}

export function fakeD1() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of migrationFiles())
    sqlite.exec(readFileSync(new URL(name, MIGRATIONS), "utf8"));
  const returnsRows = (sql: string) => /^\s*select\b|\breturning\b/i.test(sql);
  function statement(sql: string, values: SQLInputValue[] = []): Statement {
    return {
      bind: (...bound) => statement(sql, bound as SQLInputValue[]),
      async first<T>() {
        return (sqlite.prepare(sql).get(...values) ?? null) as T | null;
      },
      async all<T>() {
        return { results: sqlite.prepare(sql).all(...values) as T[] };
      },
      async run() {
        return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } };
      },
      // Batch needs the raw statement back.
      ...({ sql, values } as object),
    } as Statement;
  }
  const db: Database = {
    prepare: (sql) => statement(sql),
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((query) => {
          const { sql, values } = query as unknown as { sql: string; values: SQLInputValue[] };
          if (returnsRows(sql)) {
            const rows = sqlite.prepare(sql).all(...values);
            return { results: rows as unknown[], meta: { changes: rows.length } };
          }
          const run = sqlite.prepare(sql).run(...values);
          return { results: [] as unknown[], meta: { changes: Number(run.changes) } };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sqlite, db };
}
