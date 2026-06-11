import { Hono } from "hono";
import { q, qOne } from "../../lib/db.js";
import { TimeEntries, type TimeEntryRow } from "../views/time-entries.js";
import { parsePage } from "../lib/pagination.js";
import { parsePeriod, periodCutoff } from "../lib/period.js";

export const timeRoutes = new Hono();

timeRoutes.get("/time", async (c) => {
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
    task: query.task?.trim() || undefined,
    billable: query.billable?.trim() || undefined,
    billed: query.billed?.trim() || undefined,
  };

  const wheres: string[] = [];
  const params: Record<string, unknown> = {};

  // Period acts as a date floor unless the user has explicitly set `from`.
  if (filters.from) {
    wheres.push("t.spent_date >= @from");
    params.from = filters.from;
  } else if (cutoff) {
    wheres.push("t.spent_date >= @cutoff");
    params.cutoff = cutoff;
  }
  if (filters.to) { wheres.push("t.spent_date <= @to"); params.to = filters.to; }
  if (filters.user) { wheres.push("t.user_id = @user"); params.user = Number(filters.user); }
  if (filters.project) { wheres.push("t.project_id = @project"); params.project = Number(filters.project); }
  if (filters.client) { wheres.push("t.client_id = @client"); params.client = Number(filters.client); }
  if (filters.task) { wheres.push("t.task_id = @task"); params.task = Number(filters.task); }
  if (filters.billable === "yes") wheres.push("t.billable = true");
  if (filters.billable === "no") wheres.push("t.billable = false");
  if (filters.billed === "yes") wheres.push("t.is_billed = true");
  if (filters.billed === "no") wheres.push("t.is_billed = false");

  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const totals = await qOne<{ total: number; hours: number; billable_hours: number }>(
    `
      SELECT COUNT(*)::int AS total,
             COALESCE(SUM(t.hours), 0)::float AS hours,
             COALESCE(SUM(CASE WHEN t.billable = true THEN t.hours ELSE 0 END), 0)::float AS billable_hours
      FROM time_entries t ${whereSql}
    `,
    params,
  );

  const rows = await q<TimeEntryRow>(
    `
      SELECT t.id, t.spent_date, t.hours, t.notes, t.billable, t.is_billed,
             t.user_id, u.first_name AS user_first, u.last_name AS user_last,
             t.project_id, p.name AS project_name,
             t.client_id, c.name AS client_name,
             t.task_id, tk.name AS task_name
      FROM time_entries t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN clients c ON c.id = t.client_id
      LEFT JOIN tasks tk ON tk.id = t.task_id
      ${whereSql}
      ORDER BY t.spent_date DESC, t.id DESC
      LIMIT @limit OFFSET @offset
    `,
    { ...params, limit: perPage, offset },
  );

  const [users, projects, clients, tasks] = await Promise.all([
    q<{ id: number; first_name: string; last_name: string }>(
      "SELECT id, first_name, last_name FROM users ORDER BY last_name, first_name",
    ),
    q<{ id: number; name: string }>("SELECT id, name FROM projects ORDER BY name"),
    q<{ id: number; name: string }>("SELECT id, name FROM clients ORDER BY name"),
    q<{ id: number; name: string }>("SELECT id, name FROM tasks ORDER BY name"),
  ]);

  return c.html(
    <TimeEntries
      rows={rows}
      total={Number(totals?.total ?? 0)}
      page={page}
      perPage={perPage}
      totals={{ hours: Number(totals?.hours ?? 0), billable_hours: Number(totals?.billable_hours ?? 0) }}
      filters={filters}
      period={period}
      users={users}
      projects={projects}
      clients={clients}
      tasks={tasks}
    />,
  );
});
