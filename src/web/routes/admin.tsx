import { Hono } from "hono";
import { q, qScalar } from "../../lib/db.js";
import { Admin } from "../views/admin.js";
import { RESOURCES } from "../../fetcher/resources.js";

export const adminRoutes = new Hono();

adminRoutes.get("/admin", async (c) => {
  const syncState = await q<{
    resource: string;
    total_records: number;
    last_synced_at?: string;
    last_full_sync_at?: string;
    last_error?: string;
    notes?: string;
  }>(
    `SELECT resource, total_records, last_synced_at, last_full_sync_at, last_error, notes
     FROM sync_state ORDER BY resource`,
  );

  // Pull the actual row count from each resource's table so the admin page
  // shows the truth instead of "rows written in the last sync".
  const tableByResource = new Map(RESOURCES.map((r) => [r.name, r.table]));
  const enriched = await Promise.all(
    syncState.map(async (s) => {
      const table = tableByResource.get(s.resource);
      let table_count = s.total_records;
      if (table) {
        try {
          const v = await qScalar<number>(`SELECT count(*)::int FROM ${table}`);
          table_count = Number(v ?? 0);
        } catch {
          // ignore — fall back to sync_state.total_records
        }
      }
      return { ...s, table_count, last_run_count: s.total_records };
    }),
  );

  const recentRuns = await q<{
    id: number;
    started_at: string;
    ended_at?: string;
    resource: string;
    mode: string;
    records_seen: number;
    records_written: number;
    status: string;
    error?: string;
  }>(
    `SELECT id, started_at, ended_at, resource, mode, records_seen, records_written, status, error
     FROM fetch_runs ORDER BY id DESC LIMIT 20`,
  );

  return c.html(<Admin syncState={enriched} recentRuns={recentRuns} />);
});
