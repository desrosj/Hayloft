import { Hono } from "hono";
import { q, qOne, qScalar } from "../../lib/db.js";
import { ClientsList, type ClientRow } from "../views/clients-list.js";
import { ClientDetail } from "../views/client-detail.js";
import { parsePage } from "../lib/pagination.js";
import { parsePeriod, periodCutoff } from "../lib/period.js";

export const clientsRoutes = new Hono();

clientsRoutes.get("/clients", async (c) => {
  const query = c.req.query();
  const { page, perPage, offset } = parsePage(query);
  const period = parsePeriod(query);
  const cutoff = periodCutoff(period);

  const qSearch = (query.q ?? "").trim();
  const status = query.status ?? "";
  const sort = query.sort ?? "";

  const wheres: string[] = [];
  const params: Record<string, unknown> = {};

  if (qSearch) {
    wheres.push("c.name ILIKE @q");
    params.q = `%${qSearch}%`;
  }
  if (status === "active") wheres.push("c.is_active = true");
  if (status === "archived") wheres.push("c.is_active = false");

  if (cutoff) {
    wheres.push("hour_agg.last_activity >= @cutoff");
    params.cutoff = cutoff;
  }

  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const orderBy =
    sort === "name"
      ? "c.name ASC"
      : sort === "hours"
        ? "hour_agg.total_hours DESC NULLS LAST"
        : sort === "recent"
          ? "hour_agg.last_activity DESC NULLS LAST"
          : "inv_agg.invoiced_amount DESC NULLS LAST";

  const aggCutoffSql = cutoff ? "WHERE spent_date >= @cutoff" : "";
  const invCutoffSql = cutoff ? "WHERE issue_date >= @cutoff" : "";

  const total = Number(
    (await qScalar(
      `
      SELECT count(*)::int FROM clients c
      LEFT JOIN (
        SELECT client_id,
               COUNT(*)::int AS project_count,
               SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END)::int AS active_project_count
        FROM projects GROUP BY client_id
      ) proj_agg ON proj_agg.client_id = c.id
      LEFT JOIN (
        SELECT client_id,
               SUM(hours) AS total_hours,
               MAX(spent_date) AS last_activity
        FROM time_entries ${aggCutoffSql} GROUP BY client_id
      ) hour_agg ON hour_agg.client_id = c.id
      ${whereSql}
      `,
      params,
    )) ?? 0,
  );

  const rows = await q<ClientRow>(
    `
      SELECT c.id, c.name, c.is_active, c.currency,
             proj_agg.project_count,
             proj_agg.active_project_count,
             hour_agg.total_hours,
             hour_agg.last_activity,
             inv_agg.invoice_count,
             inv_agg.invoiced_amount,
             inv_agg.paid_amount
      FROM clients c
      LEFT JOIN (
        SELECT client_id,
               COUNT(*)::int AS project_count,
               SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END)::int AS active_project_count
        FROM projects GROUP BY client_id
      ) proj_agg ON proj_agg.client_id = c.id
      LEFT JOIN (
        SELECT client_id,
               SUM(hours) AS total_hours,
               MAX(spent_date) AS last_activity
        FROM time_entries ${aggCutoffSql} GROUP BY client_id
      ) hour_agg ON hour_agg.client_id = c.id
      LEFT JOIN (
        SELECT client_id,
               COUNT(*)::int AS invoice_count,
               SUM(amount) AS invoiced_amount,
               SUM(amount - COALESCE(due_amount, 0)) AS paid_amount
        FROM invoices ${invCutoffSql} GROUP BY client_id
      ) inv_agg ON inv_agg.client_id = c.id
      ${whereSql}
      ORDER BY ${orderBy}
      LIMIT @limit OFFSET @offset
    `,
    { ...params, limit: perPage, offset },
  );

  return c.html(
    <ClientsList
      rows={rows}
      total={total}
      page={page}
      perPage={perPage}
      filters={{ q: qSearch, status, sort }}
      period={period}
    />,
  );
});

clientsRoutes.get("/clients/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.notFound();

  const client = await qOne<Record<string, unknown>>(
    "SELECT * FROM clients WHERE id = @id",
    { id },
  );
  if (!client) return c.notFound();

  const [projAgg, hourAgg, invAgg, contacts, projects, invoices, estimates] = await Promise.all([
    qOne<{ project_count: number; active_project_count: number }>(
      `
      SELECT COUNT(*)::int AS project_count,
             SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END)::int AS active_project_count
      FROM projects WHERE client_id = @id
    `,
      { id },
    ),
    qOne<{
      total_hours: number;
      billable_hours: number;
      entry_count: number;
      contributor_count: number;
    }>(
      `
      SELECT COALESCE(SUM(hours), 0)::float AS total_hours,
             COALESCE(SUM(CASE WHEN billable = true THEN hours ELSE 0 END), 0)::float AS billable_hours,
             COUNT(*)::int AS entry_count,
             COUNT(DISTINCT user_id)::int AS contributor_count
      FROM time_entries WHERE client_id = @id
    `,
      { id },
    ),
    qOne<{
      invoice_count: number;
      invoiced_amount: number;
      paid_amount: number;
      outstanding_amount: number;
    }>(
      `
      SELECT COUNT(*)::int AS invoice_count,
             COALESCE(SUM(amount), 0)::float AS invoiced_amount,
             COALESCE(SUM(amount - COALESCE(due_amount, 0)), 0)::float AS paid_amount,
             COALESCE(SUM(COALESCE(due_amount, 0)), 0)::float AS outstanding_amount
      FROM invoices WHERE client_id = @id
    `,
      { id },
    ),
    q(
      "SELECT id, title, first_name, last_name, email, phone_office, phone_mobile FROM client_contacts WHERE client_id = @id ORDER BY last_name, first_name",
      { id },
    ),
    q(
      `
      SELECT p.id, p.name, p.code, p.is_active, p.starts_on, p.ends_on,
             COALESCE(agg.hours, 0)::float AS hours, agg.last_entry
      FROM projects p
      LEFT JOIN (
        SELECT project_id, SUM(hours) AS hours, MAX(spent_date) AS last_entry
        FROM time_entries GROUP BY project_id
      ) agg ON agg.project_id = p.id
      WHERE p.client_id = @id
      ORDER BY p.is_active DESC, agg.last_entry DESC NULLS LAST, p.name
    `,
      { id },
    ),
    q(
      `
      SELECT id, number, issue_date, due_date, state, amount, due_amount, currency
      FROM invoices WHERE client_id = @id ORDER BY issue_date DESC
    `,
      { id },
    ),
    q(
      `
      SELECT id, number, issue_date, state, amount, currency
      FROM estimates WHERE client_id = @id ORDER BY issue_date DESC
    `,
      { id },
    ),
  ]);

  return c.html(
    <ClientDetail
      client={client as never}
      stats={Object.assign({}, projAgg ?? {}, hourAgg ?? {}, invAgg ?? {}) as never}
      contacts={contacts as never}
      projects={projects as never}
      invoices={invoices as never}
      estimates={estimates as never}
    />,
  );
});
