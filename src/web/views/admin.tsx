import type { FC } from "hono/jsx";
import { Layout } from "./layout.js";
import { PageHeader } from "./components/PageHeader.js";
import { date, dateTime } from "../lib/format.js";

interface SyncRow {
  resource: string;
  total_records: number;
  table_count: number;
  last_run_count: number;
  last_synced_at?: string;
  last_full_sync_at?: string;
  last_error?: string;
  notes?: string;
}

interface FetchRun {
  id: number;
  started_at: string;
  ended_at?: string;
  resource: string;
  mode: string;
  records_seen: number;
  records_written: number;
  status: string;
  error?: string;
}

interface AdminProps {
  syncState: SyncRow[];
  recentRuns: FetchRun[];
}

const fmt = new Intl.NumberFormat("en-US");

export const Admin: FC<AdminProps> = ({ syncState, recentRuns }) => {
  return (
    <Layout title="Admin" authed>
      <div class="mx-auto max-w-6xl px-6 py-8">
        <PageHeader
          eyebrow="Admin"
          title="Sync status"
          subtitle="Per-resource sync state and recent fetch runs. Useful for verifying that data is fresh."
        />

        <section class="card overflow-hidden mb-8">
          <div class="px-4 pt-4">
            <h2 class="font-display font-semibold text-lg">Resources</h2>
          </div>
          <table class="table-base">
            <thead>
              <tr>
                <th>Resource</th>
                <th class="text-right">Total in DB</th>
                <th class="text-right" title="Records inserted/updated in the most recent sync run">Last run</th>
                <th>Last synced</th>
                <th>Last full sync</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {syncState.length === 0 && (
                <tr>
                  <td colspan={7} class="text-center text-slate py-6">
                    No fetches yet. Run <code class="bg-surface px-1 rounded">npm run fetch</code> to begin.
                  </td>
                </tr>
              )}
              {syncState.map((s) => (
                <tr>
                  <td class="font-medium">{s.resource}</td>
                  <td class="text-right tabular-nums">{fmt.format(s.table_count)}</td>
                  <td class="text-right tabular-nums text-xs text-slate">
                    {s.last_run_count > 0 ? `+${fmt.format(s.last_run_count)}` : "—"}
                  </td>
                  <td class="text-xs text-slate">
                    {s.last_synced_at ? dateTime(s.last_synced_at) : "—"}
                  </td>
                  <td class="text-xs text-slate">
                    {s.last_full_sync_at ? dateTime(s.last_full_sync_at) : "—"}
                  </td>
                  <td>
                    {s.last_error ? (
                      <span class="text-red-700 text-xs" title={s.last_error}>
                        error
                      </span>
                    ) : (
                      <span class="text-green-700 text-xs">ok</span>
                    )}
                  </td>
                  <td class="text-xs text-slate">{s.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section class="card overflow-hidden mb-8">
          <div class="px-4 pt-4">
            <h2 class="font-display font-semibold text-lg">Recent fetch runs</h2>
          </div>
          {recentRuns.length === 0 ? (
            <p class="px-4 pb-4 text-sm text-slate">No runs recorded yet.</p>
          ) : (
            <table class="table-base">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Ended</th>
                  <th>Resource(s)</th>
                  <th>Mode</th>
                  <th class="text-right">Seen</th>
                  <th class="text-right">Written</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((r) => (
                  <tr>
                    <td class="text-xs whitespace-nowrap">{dateTime(r.started_at)}</td>
                    <td class="text-xs whitespace-nowrap">{r.ended_at ? dateTime(r.ended_at) : "—"}</td>
                    <td class="text-xs">{r.resource}</td>
                    <td class="text-xs uppercase tracking-wider">{r.mode}</td>
                    <td class="text-right tabular-nums">{fmt.format(r.records_seen)}</td>
                    <td class="text-right tabular-nums">{fmt.format(r.records_written)}</td>
                    <td class="text-xs">
                      <span
                        class={
                          r.status === "success"
                            ? "text-green-700"
                            : r.status === "running"
                              ? "text-accent"
                              : "text-red-700"
                        }
                        title={r.error ?? ""}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section class="card p-5 bg-surface border-edge">
          <div class="label-eyebrow mb-2">Re-sync</div>
          <p class="text-sm text-slate mb-3">
            To pull only new/updated records since the last sync, from your laptop with the
            Railway <code class="text-xs bg-white px-1 rounded">DATABASE_URL</code> in your env:
          </p>
          <pre class="text-xs bg-ink text-white p-3 rounded overflow-x-auto"><code>npm run fetch -- --mode sync</code></pre>
          <p class="text-xs text-slate mt-3">
            For a full re-fetch (cutover day): <code class="text-xs bg-white px-1 rounded">npm run fetch</code>.
            UPSERT-by-id makes both safe to re-run.
          </p>
        </section>
      </div>
    </Layout>
  );
};
