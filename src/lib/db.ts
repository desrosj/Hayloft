import pg from "pg";
import { loadEnv } from "../config/env.js";

const { Pool, types } = pg;

// Treat DATE columns as plain ISO strings instead of JS Date objects so we can
// pass them around unchanged. (1082 = OID for DATE)
types.setTypeParser(1082, (val) => val);
// NUMERIC as number, not string — fine within JS precision for our magnitudes.
types.setTypeParser(1700, (val) => (val === null ? null : Number(val)));
// BIGINT as number too — Harvest IDs fit comfortably under MAX_SAFE_INTEGER (2^53).
types.setTypeParser(20, (val) => (val === null ? null : Number(val)));

let cached: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (cached) return cached;
  const env = loadEnv();
  cached = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    // Railway's managed Postgres requires SSL; local docker doesn't.
    ssl: needsSsl(env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
  });
  return cached;
}

function needsSsl(url: string): boolean {
  if (url.includes("sslmode=require")) return true;
  if (url.includes("sslmode=disable")) return false;
  if (/@(localhost|127\.0\.0\.1|postgres)(:|\/)/.test(url)) return false;
  // Default to SSL for anything that looks remote (Railway, etc.).
  return true;
}

export async function closePool() {
  if (cached) {
    await cached.end();
    cached = null;
  }
}

/**
 * Rewrites `@name` style named parameters to Postgres positional `$1`, `$2`,
 * and returns `{ text, values }` ready for pool.query().
 *
 * Lets us write queries that look like the SQLite ones we already had.
 */
export function named(sql: string, params: Record<string, unknown> = {}): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const seen = new Map<string, number>();
  const text = sql.replace(/@(\w+)/g, (_m, name: string) => {
    if (seen.has(name)) return `$${seen.get(name)}`;
    if (!(name in params)) {
      throw new Error(`Missing named parameter: @${name}`);
    }
    values.push(params[name]);
    const idx = values.length;
    seen.set(name, idx);
    return `$${idx}`;
  });
  return { text, values };
}

// Convenience wrappers ─────────────────────────────────────────────────

// We intentionally don't constrain T to QueryResultRow here — pg's typings are
// strict but most of our query results are interface types, and the runtime
// types are just objects. Cast inside.
export async function q<T = Record<string, unknown>>(
  sql: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const pool = getPool();
  const { text, values } = named(sql, params);
  const res = await pool.query(text, values);
  return res.rows as T[];
}

export async function qOne<T = Record<string, unknown>>(
  sql: string,
  params: Record<string, unknown> = {},
): Promise<T | undefined> {
  const rows = await q<T>(sql, params);
  return rows[0];
}

export async function qScalar<T = unknown>(
  sql: string,
  params: Record<string, unknown> = {},
): Promise<T | undefined> {
  const pool = getPool();
  const { text, values } = named(sql, params);
  const res = await pool.query(text, values);
  if (res.rows.length === 0) return undefined;
  const first = res.rows[0];
  const col = Object.keys(first)[0];
  return col ? (first[col] as T) : undefined;
}

export async function exec(sql: string): Promise<void> {
  const pool = getPool();
  await pool.query(sql);
}

/**
 * Run a function inside a transaction. Rolls back on throw.
 */
export async function withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
