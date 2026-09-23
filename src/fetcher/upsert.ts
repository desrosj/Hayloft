import type pg from "pg";
import { getPool, named } from "../lib/db.js";
import type { ResourceDef } from "./types.js";

const columnCache = new Map<string, string[]>();

async function getColumns(table: string): Promise<string[]> {
  const cached = columnCache.get(table);
  if (cached) return cached;
  const pool = getPool();
  const res = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`,
    [table],
  );
  const cols = res.rows.map((r) => r.column_name as string);
  columnCache.set(table, cols);
  return cols;
}

function flattenItem(
  item: Record<string, unknown>,
  def: ResourceDef,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(item)) {
    if (def.dropFields?.includes(key)) continue;
    const mappedKey = def.fieldMap?.[key] ?? key;

    // Nested-object expansion: { client: { id, name } } → client_id
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "id" in (value as Record<string, unknown>)
    ) {
      out[`${mappedKey}_id`] = (value as { id: number }).id;
      continue;
    }

    // Arrays → JSONB
    if (Array.isArray(value)) {
      out[mappedKey] = JSON.stringify(value);
      continue;
    }

    // Booleans stay booleans (Postgres has a real BOOLEAN type)
    if (typeof value === "boolean") {
      out[mappedKey] = value;
      continue;
    }

    // Nested object marked for JSON
    if (def.jsonFields?.includes(key) && typeof value === "object" && value !== null) {
      out[mappedKey] = JSON.stringify(value);
      continue;
    }

    out[mappedKey] = value as string | number | null;
  }

  out.raw_json = JSON.stringify(item);
  return out;
}

export async function upsertBatch(
  def: ResourceDef,
  items: Record<string, unknown>[],
  client?: pg.PoolClient,
): Promise<number> {
  if (items.length === 0) return 0;

  const columns = await getColumns(def.table);
  const pool = getPool();
  const executor = client ?? pool;

  let written = 0;
  for (const raw of items) {
    const flat = flattenItem(def.transform ? def.transform(raw) : raw, def);
    // raw_json is always the untouched API payload, even when transform added keys.
    flat.raw_json = JSON.stringify(raw);
    const cols = Object.keys(flat).filter((k) => columns.includes(k));
    if (cols.length === 0) continue;

    const placeholders = cols.map((c) => `@${c}`).join(", ");
    const updates = cols
      .filter((c) => c !== "id")
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(", ");

    const sql = `
      INSERT INTO ${def.table} (${cols.join(", ")})
      VALUES (${placeholders})
      ON CONFLICT (id) DO UPDATE SET ${updates}
    `;
    const params: Record<string, unknown> = {};
    for (const c of cols) params[c] = flat[c];

    const { text, values } = named(sql, params);
    await executor.query(text, values);
    written++;

    if (def.afterUpsert) await def.afterUpsert(executor, raw);
  }

  return written;
}
