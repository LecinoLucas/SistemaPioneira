import type { SQL } from "drizzle-orm";

type SqlResultRow = Record<string, unknown>;

type SqlExecutor = {
  execute: (query: SQL) => Promise<unknown>;
};

export function extractRows(result: unknown): SqlResultRow[] {
  if (Array.isArray(result)) {
    if (Array.isArray(result[0])) return result[0] as SqlResultRow[];
    return result as SqlResultRow[];
  }
  if (result && typeof result === "object") {
    const maybeRows = (result as { rows?: unknown }).rows;
    if (Array.isArray(maybeRows)) return maybeRows as SqlResultRow[];
  }
  return [];
}

export async function queryFirstId(
  dbConn: SqlExecutor,
  query: SQL,
  field: string
) {
  const result = await dbConn.execute(query);
  const rows = extractRows(result);
  const value = rows[0]?.[field];
  const id = Number(value ?? 0);
  return id > 0 ? id : null;
}
