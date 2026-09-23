import { Hono } from "hono";
import { q, qOne, qScalar } from "../../lib/db.js";
import { PeopleList, type PersonRow } from "../views/people-list.js";
import { PersonDetail } from "../views/person-detail.js";
import { parsePage } from "../lib/pagination.js";
import { parsePeriod, periodCutoff } from "../lib/period.js";
import { expensesFor } from "../lib/expenses.js";

export const peopleRoutes = new Hono();

peopleRoutes.get("/people", async (c) => {
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
    wheres.push("(u.first_name ILIKE @q OR u.last_name ILIKE @q OR u.email ILIKE @q)");
    params.q = `%${qSearch}%`;
  }
  if (status === "active") wheres.push("u.is_active = true");
  if (status === "archived") wheres.push("u.is_active = false");

  if (cutoff) {
    wheres.push("agg.last_entry >= @cutoff");
    params.cutoff = cutoff;
  }

  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const orderBy =
    sort === "name"
      ? "u.last_name ASC, u.first_name ASC"
      : sort === "recent"
        ? "agg.last_entry DESC NULLS LAST"
        : "agg.total_hours DESC NULLS LAST";

  const aggCutoffSql = cutoff ? "WHERE spent_date >= @cutoff" : "";

  const total = Number(
    (await qScalar(
      `
      SELECT count(*)::int FROM users u
      LEFT JOIN (
        SELECT user_id,
               SUM(hours) AS total_hours,
               COUNT(*) AS entry_count,
               COUNT(DISTINCT project_id) AS project_count,
               MAX(spent_date) AS last_entry
        FROM time_entries
        ${aggCutoffSql}
        GROUP BY user_id
      ) agg ON agg.user_id = u.id
      ${whereSql}
      `,
      params,
    )) ?? 0,
  );

  const rows = await q<PersonRow>(
    `
      SELECT u.id, u.first_name, u.last_name, u.email, u.is_active, u.is_contractor,
             u.roles::text AS roles,
             agg.total_hours, agg.entry_count, agg.project_count, agg.last_entry
      FROM users u
      LEFT JOIN (
        SELECT user_id,
               SUM(hours) AS total_hours,
               COUNT(*) AS entry_count,
               COUNT(DISTINCT project_id) AS project_count,
               MAX(spent_date) AS last_entry
        FROM time_entries
        ${aggCutoffSql}
        GROUP BY user_id
      ) agg ON agg.user_id = u.id
      ${whereSql}
      ORDER BY ${orderBy}
      LIMIT @limit OFFSET @offset
    `,
    { ...params, limit: perPage, offset },
  );

  return c.html(
    <PeopleList
      rows={rows}
      total={total}
      page={page}
      perPage={perPage}
      filters={{ q: qSearch, status, sort }}
      period={period}
    />,
  );
});

peopleRoutes.get("/people/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.notFound();

  const person = await qOne<Record<string, unknown>>(
    "SELECT *, roles::text AS roles FROM users WHERE id = @id",
    { id },
  );
  if (!person) return c.notFound();

  const [stats, byYear, byProject, recentEntries, expenses] = await Promise.all([
    qOne(
      `
      SELECT
        COALESCE(SUM(hours), 0)::float AS total_hours,
        COALESCE(SUM(CASE WHEN billable = true THEN hours ELSE 0 END), 0)::float AS billable_hours,
        COUNT(*)::int AS entry_count,
        COUNT(DISTINCT project_id)::int AS project_count,
        COUNT(DISTINCT client_id)::int AS client_count,
        MIN(spent_date) AS first_entry,
        MAX(spent_date) AS last_entry
      FROM time_entries WHERE user_id = @id
    `,
      { id },
    ),
    q(
      `
      SELECT to_char(spent_date, 'YYYY') AS year,
             SUM(hours)::float AS hours,
             SUM(CASE WHEN billable = true THEN hours ELSE 0 END)::float AS billable,
             COUNT(*)::int AS entries
      FROM time_entries WHERE user_id = @id
      GROUP BY year
      ORDER BY year DESC
    `,
      { id },
    ),
    q(
      `
      SELECT t.project_id, p.name AS project_name,
             c.id AS client_id, c.name AS client_name,
             SUM(t.hours)::float AS hours,
             COUNT(*)::int AS entries,
             MAX(t.spent_date) AS last_entry
      FROM time_entries t
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE t.user_id = @id
      GROUP BY t.project_id, p.name, c.id, c.name
      ORDER BY hours DESC
    `,
      { id },
    ),
    q(
      `
      SELECT t.id, t.spent_date, t.project_id, p.name AS project_name,
             tk.name AS task_name, t.hours, t.notes, t.billable
      FROM time_entries t
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN tasks tk ON tk.id = t.task_id
      WHERE t.user_id = @id
      ORDER BY t.spent_date DESC, t.id DESC
      LIMIT 50
    `,
      { id },
    ),
    expensesFor("user_id", id),
  ]);

  return c.html(
    <PersonDetail
      person={person as never}
      stats={stats as never}
      byYear={byYear as never}
      byProject={byProject as never}
      recentEntries={recentEntries as never}
      expenses={expenses}
    />,
  );
});
