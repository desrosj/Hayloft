import { Hono } from "hono";
import { q, qOne } from "../../lib/db.js";
import { ExpensesList, type ExpenseRow } from "../views/expenses-list.js";
import {
  ExpenseDetail,
  type ExpenseDetailRecord,
  type StoredReceipt,
} from "../views/expense-detail.js";
import { parsePage } from "../lib/pagination.js";
import { parsePeriod, periodCutoff } from "../lib/period.js";
import { loadEnv } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { readReceiptFile } from "../../lib/receipts.js";

export const expensesRoutes = new Hono();

expensesRoutes.get("/expenses", async (c) => {
  const query = c.req.query();
  const { page, perPage, offset } = parsePage(query);
  const period = parsePeriod(query);
  const cutoff = periodCutoff(period);

  const filters = {
    from: query.from?.trim() || undefined,
    to: query.to?.trim() || undefined,
    user: query.user?.trim() || undefined,
    project: query.project?.trim() || undefined,
    client: query.client?.trim() || undefined,
    category: query.category?.trim() || undefined,
    billable: query.billable?.trim() || undefined,
    billed: query.billed?.trim() || undefined,
    receipt: query.receipt?.trim() || undefined,
  };

  const wheres: string[] = [];
  const params: Record<string, unknown> = {};

  // Period acts as a date floor unless the user has explicitly set `from`.
  if (filters.from) {
    wheres.push("e.spent_date >= @from");
    params.from = filters.from;
  } else if (cutoff) {
    wheres.push("e.spent_date >= @cutoff");
    params.cutoff = cutoff;
  }
  if (filters.to) { wheres.push("e.spent_date <= @to"); params.to = filters.to; }
  if (filters.user) { wheres.push("e.user_id = @user"); params.user = Number(filters.user); }
  if (filters.project) { wheres.push("e.project_id = @project"); params.project = Number(filters.project); }
  if (filters.client) { wheres.push("e.client_id = @client"); params.client = Number(filters.client); }
  if (filters.category) { wheres.push("e.expense_category_id = @category"); params.category = Number(filters.category); }
  if (filters.billable === "yes") wheres.push("e.billable = true");
  if (filters.billable === "no") wheres.push("e.billable = false");
  if (filters.billed === "yes") wheres.push("e.is_billed = true");
  if (filters.billed === "no") wheres.push("e.is_billed = false");
  if (filters.receipt === "yes") wheres.push("e.receipt_url IS NOT NULL");
  if (filters.receipt === "no") wheres.push("e.receipt_url IS NULL");

  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const totals = await qOne<{
    total: number;
    cost: number;
    billable_cost: number;
    with_receipts: number;
  }>(
    `
      SELECT COUNT(*)::int AS total,
             COALESCE(SUM(e.total_cost), 0)::float AS cost,
             COALESCE(SUM(CASE WHEN e.billable = true THEN e.total_cost ELSE 0 END), 0)::float AS billable_cost,
             COUNT(e.receipt_url)::int AS with_receipts
      FROM expenses e ${whereSql}
    `,
    params,
  );

  const rows = await q<ExpenseRow>(
    `
      SELECT e.id, e.spent_date, e.notes, e.units, e.total_cost, e.billable, e.is_billed,
             c.currency,
             e.user_id, u.first_name AS user_first, u.last_name AS user_last,
             e.project_id, p.name AS project_name,
             e.client_id, c.name AS client_name,
             e.expense_category_id AS category_id, ec.name AS category_name,
             ec.unit_name AS category_unit_name,
             e.invoice_id,
             (e.receipt_url IS NOT NULL) AS has_receipt,
             (r.data IS NOT NULL OR r.file_path IS NOT NULL) AS receipt_stored
      FROM expenses e
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN projects p ON p.id = e.project_id
      LEFT JOIN clients c ON c.id = e.client_id
      LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
      LEFT JOIN expense_receipts r ON r.expense_id = e.id
      ${whereSql}
      ORDER BY e.spent_date DESC, e.id DESC
      LIMIT @limit OFFSET @offset
    `,
    { ...params, limit: perPage, offset },
  );

  const [users, projects, clients, categories] = await Promise.all([
    q<{ id: number; first_name: string; last_name: string }>(
      "SELECT id, first_name, last_name FROM users ORDER BY last_name, first_name",
    ),
    q<{ id: number; name: string }>("SELECT id, name FROM projects ORDER BY name"),
    q<{ id: number; name: string }>("SELECT id, name FROM clients ORDER BY name"),
    q<{ id: number; name: string }>("SELECT id, name FROM expense_categories ORDER BY name"),
  ]);

  return c.html(
    <ExpensesList
      rows={rows}
      total={Number(totals?.total ?? 0)}
      page={page}
      perPage={perPage}
      totals={{
        cost: Number(totals?.cost ?? 0),
        billable_cost: Number(totals?.billable_cost ?? 0),
        with_receipts: Number(totals?.with_receipts ?? 0),
      }}
      filters={filters}
      period={period}
      users={users}
      projects={projects}
      clients={clients}
      categories={categories}
    />,
  );
});

expensesRoutes.get("/expenses/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.notFound();

  const expense = await qOne<ExpenseDetailRecord>(
    `
      SELECT e.id, e.spent_date, e.notes, e.units, e.total_cost, e.billable, e.is_billed,
             e.is_closed, e.is_locked, e.locked_reason, e.created_at, e.updated_at,
             e.user_id, u.first_name AS user_first, u.last_name AS user_last,
             e.user_assignment_id,
             e.client_id, c.name AS client_name, c.currency,
             e.project_id, p.name AS project_name, p.code AS project_code,
             e.expense_category_id AS category_id, ec.name AS category_name,
             ec.unit_name AS category_unit_name, ec.unit_price AS category_unit_price,
             e.invoice_id, i.number AS invoice_number,
             e.receipt_url, e.receipt_file_name, e.receipt_file_size, e.receipt_content_type,
             e.raw_json
      FROM expenses e
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN projects p ON p.id = e.project_id
      LEFT JOIN clients c ON c.id = e.client_id
      LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
      LEFT JOIN invoices i ON i.id = e.invoice_id
      WHERE e.id = @id
    `,
    { id },
  );
  if (!expense) return c.notFound();

  const [receipt, newer, older] = await Promise.all([
    qOne<StoredReceipt>(
      `
      SELECT file_name, content_type, file_size, fetched_at, fetch_error, file_path,
             (data IS NOT NULL OR file_path IS NOT NULL) AS stored
      FROM expense_receipts WHERE expense_id = @id
      `,
      { id },
    ),
    // Prev/next follow the list's ordering (newest first) so you can page
    // through expenses one at a time from the detail view.
    qOne<{ id: number }>(
      `
      SELECT id FROM expenses
      WHERE (spent_date, id) > (@d::date, @id)
      ORDER BY spent_date ASC, id ASC LIMIT 1
      `,
      { d: expense.spent_date, id },
    ),
    qOne<{ id: number }>(
      `
      SELECT id FROM expenses
      WHERE (spent_date, id) < (@d::date, @id)
      ORDER BY spent_date DESC, id DESC LIMIT 1
      `,
      { d: expense.spent_date, id },
    ),
  ]);

  return c.html(
    <ExpenseDetail
      expense={expense}
      receipt={receipt ?? null}
      newerId={newer?.id ?? null}
      olderId={older?.id ?? null}
    />,
  );
});

// Types we let the browser render inline. Everything else (SVG, HTML, office
// docs, unknown) is forced to download so user-uploaded content can never
// execute in the app's origin.
const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/i;

function safeContentType(ct: string | null): string {
  const base = (ct ?? "").split(";")[0]!.trim().toLowerCase();
  return /^[\w.+-]+\/[\w.+-]+$/.test(base) ? base : "application/octet-stream";
}

function contentDisposition(kind: "inline" | "attachment", fileName: string | null, fallback: string): string {
  const name = fileName && fileName.trim() ? fileName.trim() : fallback;
  // ASCII-only fallback for the plain filename, RFC 5987 form for the real one.
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

expensesRoutes.get("/expenses/:id/receipt", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.notFound();

  const row = await qOne<{
    data: Buffer | null;
    file_path: string | null;
    content_type: string | null;
    file_name: string | null;
  }>(
    `SELECT data, file_path, content_type, file_name FROM expense_receipts
     WHERE expense_id = @id AND (data IS NOT NULL OR file_path IS NOT NULL)`,
    { id },
  );
  if (!row) return c.notFound();

  // Receipts live either in Postgres (data) or on disk under RECEIPTS_DIR
  // (file_path, relative). Both can coexist across a mode switch.
  let bytes: Buffer | null = row.data;
  if (!bytes && row.file_path) {
    const dir = loadEnv().RECEIPTS_DIR;
    if (!dir) {
      logger.warn({ expense: id, file_path: row.file_path }, "receipt is on disk but RECEIPTS_DIR is not set");
      return c.notFound();
    }
    bytes = await readReceiptFile(dir, row.file_path);
    if (!bytes) {
      logger.warn({ expense: id, file_path: row.file_path, dir }, "receipt file missing from RECEIPTS_DIR");
      return c.notFound();
    }
  }
  if (!bytes) return c.notFound();

  const type = safeContentType(row.content_type);
  const wantsDownload = c.req.query("download") !== undefined;
  const inline = INLINE_TYPES.test(type) && !wantsDownload;
  const fallbackName = `expense-${id}-receipt`;

  // Copy into a plain Uint8Array<ArrayBuffer>: Hono's body type doesn't
  // accept Node's Buffer (backed by ArrayBufferLike) directly.
  const body = new Uint8Array(bytes);
  return c.body(body, 200, {
    "Content-Type": inline ? type : "application/octet-stream",
    "Content-Length": String(body.byteLength),
    "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", row.file_name, fallbackName),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=3600",
  });
});
