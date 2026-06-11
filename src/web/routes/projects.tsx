import { Hono } from "hono";
import { q, qOne, qScalar } from "../../lib/db.js";
import { ProjectsList, type ProjectRow } from "../views/projects-list.js";
import { ProjectDetail } from "../views/project-detail.js";
import { parsePage } from "../lib/pagination.js";
import { parsePeriod, periodCutoff } from "../lib/period.js";

export const projectsRoutes = new Hono();

projectsRoutes.get("/projects", async (c) => {
  const query = c.req.query();
  const { page, perPage, offset } = parsePage(query);
  const period = parsePeriod(query);
  const cutoff = periodCutoff(period);

  const qSearch = (query.q ?? "").trim();
  const clientId = query.client ? Number(query.client) : null;
  const status = query.status ?? "";
  const sort = query.sort ?? "";

  const wheres: string[] = [];
  const params: Record<string, unknown> = {};

  if (qSearch) {
    wheres.push("(p.name ILIKE @q OR p.code ILIKE @q OR p.notes ILIKE @q)");
    params.q = `%${qSearch}%`;
  }
  if (clientId) {
    wheres.push("p.client_id = @clientId");
    params.clientId = clientId;
  }
  if (status === "active") wheres.push("p.is_active = true");
  if (status === "archived") wheres.push("p.is_active = false");

  // Apply period filter: only show projects with activity in the window.
  if (cutoff) {
    wheres.push("agg.last_entry >= @cutoff");
    params.cutoff = cutoff;
  }

  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const orderBy =
    sort === "name"
      ? "p.name ASC"
      : sort === "client"
        ? "c.name ASC, p.name ASC"
        : sort === "hours"
          ? "agg.total_hours DESC NULLS LAST"
          : sort === "starts_on"
            ? "p.starts_on DESC NULLS LAST"
            : "agg.last_entry DESC NULLS LAST, p.updated_at DESC";

  // The aggregate subquery is scoped to the period for performance — scanning
  // 30 days of time_entries is a fraction of scanning all 645k rows.
  const aggCutoffSql = cutoff ? "WHERE spent_date >= @cutoff" : "";

  const total = Number(
    (await qScalar(
      `
      SELECT count(*)::int
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN (
        SELECT project_id,
               SUM(hours) AS total_hours,
               COUNT(*) AS entry_count,
               MAX(spent_date) AS last_entry
        FROM time_entries
        ${aggCutoffSql}
        GROUP BY project_id
      ) agg ON agg.project_id = p.id
      ${whereSql}
      `,
      params,
    )) ?? 0,
  );

  const rows = await q<ProjectRow>(
    `
      SELECT p.id, p.name, p.code, p.is_active, p.is_billable, p.starts_on, p.ends_on,
             p.budget, p.fee,
             c.id AS client_id, c.name AS client_name,
             agg.total_hours, agg.entry_count, agg.last_entry
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN (
        SELECT project_id,
               SUM(hours) AS total_hours,
               COUNT(*) AS entry_count,
               MAX(spent_date) AS last_entry
        FROM time_entries
        ${aggCutoffSql}
        GROUP BY project_id
      ) agg ON agg.project_id = p.id
      ${whereSql}
      ORDER BY ${orderBy}
      LIMIT @limit OFFSET @offset
    `,
    { ...params, limit: perPage, offset },
  );

  const clients = await q<{ id: number; name: string }>(
    "SELECT id, name FROM clients ORDER BY name",
  );

  return c.html(
    <ProjectsList
      rows={rows}
      total={total}
      page={page}
      perPage={perPage}
      filters={{ q: qSearch, client: query.client, status, sort }}
      period={period}
      clients={clients}
    />,
  );
});

projectsRoutes.get("/projects/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.notFound();

  const project = await qOne<Record<string, unknown>>(
    `
      SELECT p.*, c.name AS client_name, c.currency AS client_currency
      FROM projects p LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.id = @id
    `,
    { id },
  );

  if (!project) return c.notFound();

  const [statsRow, invoiceAgg, contributors, taskBreakdown, recentEntries, invoices] =
    await Promise.all([
      qOne<{
        total_hours: number;
        billable_hours: number;
        contributor_count: number;
        task_count: number;
        entry_count: number;
      }>(
        `
        SELECT
          COALESCE(SUM(hours), 0)::float AS total_hours,
          COALESCE(SUM(CASE WHEN billable = true THEN hours ELSE 0 END), 0)::float AS billable_hours,
          COUNT(DISTINCT user_id)::int AS contributor_count,
          COUNT(DISTINCT task_id)::int AS task_count,
          COUNT(*)::int AS entry_count
        FROM time_entries WHERE project_id = @id
      `,
        { id },
      ),
      qOne<{ amount: number; cnt: number }>(
        `
        SELECT COALESCE(SUM(amount), 0)::float AS amount, COUNT(*)::int AS cnt FROM invoices
        WHERE id IN (SELECT DISTINCT invoice_id FROM invoice_line_items WHERE project_id = @id)
      `,
        { id },
      ),
      q<{
        user_id: number;
        first_name: string;
        last_name: string;
        hours: number;
        entries: number;
        last_entry: string;
      }>(
        `
        SELECT t.user_id, u.first_name, u.last_name,
               SUM(t.hours)::float AS hours,
               COUNT(*)::int AS entries,
               MAX(t.spent_date) AS last_entry
        FROM time_entries t
        LEFT JOIN users u ON u.id = t.user_id
        WHERE t.project_id = @id
        GROUP BY t.user_id, u.first_name, u.last_name
        ORDER BY hours DESC
      `,
        { id },
      ),
      q<{ task_id: number; task_name: string; hours: number; entries: number }>(
        `
        SELECT t.task_id, tk.name AS task_name,
               SUM(t.hours)::float AS hours,
               COUNT(*)::int AS entries
        FROM time_entries t
        LEFT JOIN tasks tk ON tk.id = t.task_id
        WHERE t.project_id = @id
        GROUP BY t.task_id, tk.name
        ORDER BY hours DESC
      `,
        { id },
      ),
      q(
        `
        SELECT t.id, t.spent_date, u.first_name AS user_first, u.last_name AS user_last,
               tk.name AS task_name, t.hours, t.notes, t.billable
        FROM time_entries t
        LEFT JOIN users u ON u.id = t.user_id
        LEFT JOIN tasks tk ON tk.id = t.task_id
        WHERE t.project_id = @id
        ORDER BY t.spent_date DESC, t.id DESC
        LIMIT 50
      `,
        { id },
      ),
      q(
        `
        SELECT DISTINCT i.id, i.number, i.issue_date, i.state, i.amount, i.currency
        FROM invoices i
        JOIN invoice_line_items li ON li.invoice_id = i.id
        WHERE li.project_id = @id
        ORDER BY i.issue_date DESC
      `,
        { id },
      ),
    ]);

  return c.html(
    <ProjectDetail
      project={project as never}
      stats={Object.assign({}, statsRow ?? {}, {
        invoice_count: Number(invoiceAgg?.cnt ?? 0),
        invoiced_amount: Number(invoiceAgg?.amount ?? 0),
      }) as never}
      contributors={contributors as never}
      taskBreakdown={taskBreakdown as never}
      recentEntries={recentEntries as never}
      invoices={invoices as never}
    />,
  );
});
