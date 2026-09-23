import { HarvestError, harvestDownload, harvestFetch, paginate, rateSnapshot } from "../lib/harvest.js";
import { getPool, q, qOne } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import type { FetchMode, ResourceDef } from "./types.js";
import { RESOURCES_BY_NAME } from "./resources.js";
import { upsertBatch } from "./upsert.js";

interface RunResourceOpts {
  def: ResourceDef;
  mode: FetchMode;
  limit?: number;
  maxPages?: number;
  startPage?: number;
  since?: string;
  onProgress?: (info: {
    page: number;
    totalPages: number;
    itemsSeen: number;
    itemsWritten: number;
    totalEntries: number;
  }) => void;
}

async function getLastSync(resource: string): Promise<string | undefined> {
  const row = await qOne<{ last_synced_at: string | null }>(
    "SELECT last_synced_at FROM sync_state WHERE resource = @resource",
    { resource },
  );
  return row?.last_synced_at ?? undefined;
}

async function setLastSync(
  resource: string,
  fullSync: boolean,
  total: number,
  error?: string,
  notes?: string,
) {
  const now = new Date().toISOString();
  await q(
    `
    INSERT INTO sync_state (resource, last_synced_at, last_full_sync_at, total_records, last_error, notes)
    VALUES (@resource, @now, @full, @total, @err, @notes)
    ON CONFLICT(resource) DO UPDATE SET
      last_synced_at = EXCLUDED.last_synced_at,
      last_full_sync_at = COALESCE(EXCLUDED.last_full_sync_at, sync_state.last_full_sync_at),
      total_records = EXCLUDED.total_records,
      last_error = EXCLUDED.last_error,
      notes = COALESCE(EXCLUDED.notes, sync_state.notes)
    `,
    {
      resource,
      now,
      full: fullSync ? now : null,
      total,
      err: error ?? null,
      notes: notes ?? null,
    },
  );
}

export async function runResource(opts: RunResourceOpts): Promise<{
  itemsSeen: number;
  itemsWritten: number;
}> {
  const { def, mode, limit, maxPages, startPage, since, onProgress } = opts;

  if (def.name === "user_teammates") return runUserTeammates(opts);
  if (def.name === "invoice_payments") return runInvoiceChildren(opts, "invoice_payments");
  if (def.name === "invoice_messages") return runInvoiceChildren(opts, "invoice_messages");
  if (def.name === "estimate_messages") return runEstimateChildren(opts);
  if (def.name === "expense_receipts") return runExpenseReceipts(opts);
  if (def.name === "company") return runSingleton(opts);

  const query: Record<string, string | number> = {};
  if (def.supportsUpdatedSince) {
    const updatedSince = since ?? (mode === "sync" ? await getLastSync(def.name) : undefined);
    if (updatedSince) query.updated_since = updatedSince;
  }

  let itemsSeen = 0;
  let itemsWritten = 0;
  let pageCount = 0;

  try {
    for await (const { page, pageNum } of paginate<Record<string, unknown>>(def.path, {
      isReportsApi: def.isReportsApi,
      query,
      startPage,
    })) {
      pageCount++;
      const items = (page as unknown as Record<string, unknown>)[def.envelopeKey] as Record<
        string,
        unknown
      >[];
      if (!Array.isArray(items)) {
        logger.error({ resource: def.name, page: pageNum }, "missing envelope key");
        break;
      }

      let toWrite = items;
      if (limit !== undefined && itemsSeen + items.length > limit) {
        toWrite = items.slice(0, limit - itemsSeen);
      }

      const written = await upsertBatch(def, toWrite);
      itemsSeen += toWrite.length;
      itemsWritten += written;

      onProgress?.({
        page: pageNum,
        totalPages: page.total_pages,
        itemsSeen,
        itemsWritten,
        totalEntries: page.total_entries,
      });

      if (limit !== undefined && itemsSeen >= limit) break;
      if (maxPages !== undefined && pageCount >= maxPages) break;
    }

    await setLastSync(def.name, mode === "full" && !limit && !maxPages, itemsWritten);
  } catch (err) {
    await setLastSync(def.name, false, itemsWritten, (err as Error).message);
    throw err;
  }

  return { itemsSeen, itemsWritten };
}

async function runSingleton(opts: RunResourceOpts) {
  const { def, onProgress } = opts;
  const data = await harvestFetch<Record<string, unknown>>(def.path);
  // Harvest's /company endpoint returns a singleton with no `id` field.
  // SQLite's INTEGER PRIMARY KEY auto-aliased to ROWID, but Postgres won't.
  // Synthesize a stable id so the row can be upserted.
  if (data.id === undefined || data.id === null) data.id = 1;
  const written = await upsertBatch(def, [data]);
  onProgress?.({
    page: 1,
    totalPages: 1,
    itemsSeen: 1,
    itemsWritten: written,
    totalEntries: 1,
  });
  await setLastSync(def.name, true, written);
  return { itemsSeen: 1, itemsWritten: written };
}

async function runUserTeammates(opts: RunResourceOpts) {
  const { onProgress } = opts;
  const users = await q<{ id: number }>(
    "SELECT id FROM users WHERE is_active = true",
  );
  let seen = 0;
  let written = 0;
  let skippedUsers = 0;
  let i = 0;
  const pool = getPool();
  for (const u of users) {
    i++;
    let data: { teammates: { id: number }[] };
    try {
      data = await harvestFetch<{ teammates: { id: number }[] }>(
        `/users/${u.id}/teammates`,
      );
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (/\b(40[34]|422)\b/.test(msg)) {
        skippedUsers++;
        continue;
      }
      throw err;
    }
    await pool.query("DELETE FROM user_teammates WHERE user_id = $1", [u.id]);
    for (const t of data.teammates ?? []) {
      await pool.query(
        "INSERT INTO user_teammates (user_id, teammate_id, raw_json) VALUES ($1, $2, $3) ON CONFLICT (user_id, teammate_id) DO UPDATE SET raw_json = EXCLUDED.raw_json",
        [u.id, t.id, JSON.stringify(t)],
      );
      written++;
      seen++;
    }
    onProgress?.({
      page: i,
      totalPages: users.length,
      itemsSeen: seen,
      itemsWritten: written,
      totalEntries: users.length,
    });
  }
  await setLastSync(
    "user_teammates",
    true,
    written,
    undefined,
    skippedUsers > 0 ? `Skipped ${skippedUsers} non-manager users` : undefined,
  );
  return { itemsSeen: seen, itemsWritten: written };
}

async function runInvoiceChildren(
  opts: RunResourceOpts,
  childTable: "invoice_payments" | "invoice_messages",
) {
  const { onProgress } = opts;
  const envelopeKey = childTable;
  const invoices = await q<{ id: number }>("SELECT id FROM invoices");
  let seen = 0;
  let written = 0;
  let i = 0;
  for (const inv of invoices) {
    i++;
    const path = `/invoices/${inv.id}/${childTable === "invoice_payments" ? "payments" : "messages"}`;
    for await (const { page } of paginate<Record<string, unknown>>(path)) {
      const items = (page as unknown as Record<string, unknown>)[envelopeKey] as Record<
        string,
        unknown
      >[];
      if (!Array.isArray(items)) continue;
      const rows = items.map((it) => ({ ...it, invoice_id: inv.id }));
      const def = RESOURCES_BY_NAME.get(childTable)!;
      const w = await upsertBatch({ ...def, table: childTable }, rows);
      seen += rows.length;
      written += w;
    }
    onProgress?.({
      page: i,
      totalPages: invoices.length,
      itemsSeen: seen,
      itemsWritten: written,
      totalEntries: invoices.length,
    });
  }
  await setLastSync(childTable, true, written);
  return { itemsSeen: seen, itemsWritten: written };
}

async function runEstimateChildren(opts: RunResourceOpts) {
  const { onProgress } = opts;
  const estimates = await q<{ id: number }>("SELECT id FROM estimates");
  let seen = 0;
  let written = 0;
  let i = 0;
  for (const est of estimates) {
    i++;
    for await (const { page } of paginate<Record<string, unknown>>(
      `/estimates/${est.id}/messages`,
    )) {
      const items = (page as unknown as Record<string, unknown>).estimate_messages as Record<
        string,
        unknown
      >[];
      if (!Array.isArray(items)) continue;
      const rows = items.map((it) => ({ ...it, estimate_id: est.id }));
      const def = RESOURCES_BY_NAME.get("estimate_messages")!;
      const w = await upsertBatch({ ...def, table: "estimate_messages" }, rows);
      seen += rows.length;
      written += w;
    }
    onProgress?.({
      page: i,
      totalPages: estimates.length,
      itemsSeen: seen,
      itemsWritten: written,
      totalEntries: estimates.length,
    });
  }
  await setLastSync("estimate_messages", true, written);
  return { itemsSeen: seen, itemsWritten: written };
}

/**
 * Download receipt files for expenses that have one. Incremental by nature:
 * only expenses whose receipt is missing, previously failed, or whose URL
 * changed since we last fetched it are (re)downloaded. Files land in
 * expense_receipts as BYTEA so pg_dump still captures the whole archive.
 */
async function runExpenseReceipts(opts: RunResourceOpts) {
  const { limit, onProgress } = opts;
  const pool = getPool();

  const pending = await q<{
    id: number;
    receipt_url: string;
    receipt_file_name: string | null;
    receipt_content_type: string | null;
    receipt_file_size: number | null;
  }>(
    `
    SELECT e.id, e.receipt_url, e.receipt_file_name, e.receipt_content_type, e.receipt_file_size
    FROM expenses e
    LEFT JOIN expense_receipts r ON r.expense_id = e.id
    WHERE e.receipt_url IS NOT NULL
      AND (r.expense_id IS NULL OR r.data IS NULL OR r.url IS DISTINCT FROM e.receipt_url)
    ORDER BY e.spent_date DESC, e.id DESC
    `,
  );

  const total = limit !== undefined ? Math.min(limit, pending.length) : pending.length;
  let seen = 0;
  let written = 0;
  let failed = 0;
  let consecutiveAuthFailures = 0;

  try {
    for (const e of pending) {
      if (limit !== undefined && seen >= limit) break;
      seen++;

      try {
        const { data, contentType } = await harvestDownload(e.receipt_url);
        await pool.query(
          `
          INSERT INTO expense_receipts
            (expense_id, url, file_name, content_type, file_size, data, fetched_at, fetch_error)
          VALUES ($1, $2, $3, $4, $5, $6, now(), NULL)
          ON CONFLICT (expense_id) DO UPDATE SET
            url = EXCLUDED.url,
            file_name = EXCLUDED.file_name,
            content_type = EXCLUDED.content_type,
            file_size = EXCLUDED.file_size,
            data = EXCLUDED.data,
            fetched_at = now(),
            fetch_error = NULL
          `,
          [
            e.id,
            e.receipt_url,
            e.receipt_file_name,
            // Prefer Harvest's declared type; fall back to what the server sent.
            e.receipt_content_type ?? contentType?.split(";")[0]?.trim() ?? null,
            data.length,
            data,
          ],
        );
        written++;
        consecutiveAuthFailures = 0;
      } catch (err) {
        failed++;
        const message = (err as Error).message ?? String(err);
        // 401/403 (or being bounced to a login page) means the token can't
        // read receipts at all. A 404 or 5xx is specific to one file and
        // must never block the rest of the queue.
        const authFailure =
          err instanceof HarvestError &&
          (err.status === 401 || err.status === 403 || err.body.includes("HTML page"));
        consecutiveAuthFailures = authFailure ? consecutiveAuthFailures + 1 : 0;
        logger.warn({ expense: e.id, url: e.receipt_url, err: message }, "receipt download failed");
        // Record the failure without touching url/data, so the next run
        // retries it and any previously good copy survives.
        await pool.query(
          `
          INSERT INTO expense_receipts (expense_id, url, file_name, content_type, file_size, data, fetched_at, fetch_error)
          VALUES ($1, NULL, $2, $3, $4, NULL, now(), $5)
          ON CONFLICT (expense_id) DO UPDATE SET
            fetched_at = now(),
            fetch_error = EXCLUDED.fetch_error
          `,
          [e.id, e.receipt_file_name, e.receipt_content_type, e.receipt_file_size, message.slice(0, 1000)],
        );
        // If nothing has succeeded and the first several attempts are all
        // auth failures, something systemic is wrong (token scope, feature
        // disabled) — stop instead of burning through the rate limit.
        if (written === 0 && consecutiveAuthFailures >= 5) {
          throw new Error(
            `aborting receipt downloads after ${consecutiveAuthFailures} consecutive auth failures; last: ${message}`,
          );
        }
      }

      onProgress?.({
        page: seen,
        totalPages: total,
        itemsSeen: seen,
        itemsWritten: written,
        totalEntries: total,
      });
    }
  } catch (err) {
    await setLastSync("expense_receipts", false, written, (err as Error).message);
    throw err;
  }

  await setLastSync(
    "expense_receipts",
    limit === undefined,
    written,
    undefined,
    failed > 0 ? `${failed} receipt download(s) failed — re-run to retry` : "",
  );
  return { itemsSeen: seen, itemsWritten: written };
}

export { rateSnapshot };
