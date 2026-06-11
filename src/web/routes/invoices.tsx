import { Hono } from "hono";
import { q, qOne } from "../../lib/db.js";
import { InvoicesList, type InvoiceRow } from "../views/invoices-list.js";
import { InvoiceDetail } from "../views/invoice-detail.js";
import { parsePage } from "../lib/pagination.js";
import { parsePeriod, periodCutoff } from "../lib/period.js";

export const invoicesRoutes = new Hono();

invoicesRoutes.get("/invoices", async (c) => {
  const query = c.req.query();
  const { page, perPage, offset } = parsePage(query);
  const period = parsePeriod(query);
  const cutoff = periodCutoff(period);

  const qSearch = (query.q ?? "").trim();
  const clientId = query.client ? Number(query.client) : null;
  const state = query.state ?? "";
  const year = query.year ?? "";

  const wheres: string[] = [];
  const params: Record<string, unknown> = {};

  if (qSearch) {
    wheres.push("(i.number ILIKE @q OR i.subject ILIKE @q OR i.notes ILIKE @q)");
    params.q = `%${qSearch}%`;
  }
  if (clientId) { wheres.push("i.client_id = @clientId"); params.clientId = clientId; }
  if (state) { wheres.push("i.state = @state"); params.state = state; }
  if (year && /^\d{4}$/.test(year)) {
    wheres.push("to_char(i.issue_date, 'YYYY') = @year");
    params.year = year;
  } else if (cutoff) {
    // Year filter overrides period — if neither, period filters by issue_date.
    wheres.push("i.issue_date >= @cutoff");
    params.cutoff = cutoff;
  }

  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const totals = await qOne<{ total: number; amount: number; outstanding: number; paid: number }>(
    `
      SELECT COUNT(*)::int AS total,
             COALESCE(SUM(i.amount), 0)::float AS amount,
             COALESCE(SUM(COALESCE(i.due_amount, 0)), 0)::float AS outstanding,
             COALESCE(SUM(i.amount - COALESCE(i.due_amount, 0)), 0)::float AS paid
      FROM invoices i ${whereSql}
    `,
    params,
  );

  const rows = await q<InvoiceRow>(
    `
      SELECT i.id, i.number, i.client_id, c.name AS client_name,
             i.issue_date, i.due_date, i.state, i.amount, i.due_amount, i.currency, i.subject
      FROM invoices i
      LEFT JOIN clients c ON c.id = i.client_id
      ${whereSql}
      ORDER BY i.issue_date DESC NULLS LAST, i.id DESC
      LIMIT @limit OFFSET @offset
    `,
    { ...params, limit: perPage, offset },
  );

  const [clients, yearsRows, statesRows] = await Promise.all([
    q<{ id: number; name: string }>(
      `SELECT DISTINCT c.id, c.name FROM clients c JOIN invoices i ON i.client_id = c.id ORDER BY c.name`,
    ),
    q<{ y: string }>(
      `SELECT DISTINCT to_char(issue_date, 'YYYY') AS y FROM invoices WHERE issue_date IS NOT NULL ORDER BY y DESC`,
    ),
    q<{ state: string }>(
      "SELECT DISTINCT state FROM invoices WHERE state IS NOT NULL ORDER BY state",
    ),
  ]);

  return c.html(
    <InvoicesList
      rows={rows}
      total={Number(totals?.total ?? 0)}
      page={page}
      perPage={perPage}
      totals={{
        amount: Number(totals?.amount ?? 0),
        outstanding: Number(totals?.outstanding ?? 0),
        paid: Number(totals?.paid ?? 0),
      }}
      filters={{ q: qSearch, client: query.client, state, year }}
      period={period}
      clients={clients}
      years={yearsRows.map((r) => r.y)}
      states={statesRows.map((r) => r.state)}
    />,
  );
});

invoicesRoutes.get("/invoices/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.notFound();

  const invoice = await qOne<Record<string, unknown>>(
    `
      SELECT i.*, c.name AS client_name FROM invoices i
      LEFT JOIN clients c ON c.id = i.client_id
      WHERE i.id = @id
    `,
    { id },
  );
  if (!invoice) return c.notFound();

  const [lineItems, payments, messages] = await Promise.all([
    q(
      `
      SELECT li.*, p.name AS project_name FROM invoice_line_items li
      LEFT JOIN projects p ON p.id = li.project_id
      WHERE li.invoice_id = @id
      ORDER BY li.id ASC
    `,
      { id },
    ),
    q(
      `SELECT * FROM invoice_payments WHERE invoice_id = @id ORDER BY COALESCE(paid_date::timestamptz, paid_at) DESC`,
      { id },
    ),
    q(
      `SELECT * FROM invoice_messages WHERE invoice_id = @id ORDER BY sent_at DESC NULLS LAST`,
      { id },
    ),
  ]);

  return c.html(
    <InvoiceDetail
      invoice={invoice as never}
      lineItems={lineItems as never}
      payments={payments as never}
      messages={messages as never}
    />,
  );
});
