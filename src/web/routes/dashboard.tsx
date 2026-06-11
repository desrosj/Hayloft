import { Hono } from "hono";
import { q, qOne, qScalar } from "../../lib/db.js";
import { Dashboard } from "../views/dashboard.js";
import { periodCutoff } from "../lib/period.js";

export const dashboardRoutes = new Hono();

dashboardRoutes.get("/", async (c) => {
  const cutoff30 = periodCutoff("month"); // 30 days
  // Build a 90-day cutoff for the contributors widget.
  const d = new Date();
  d.setDate(d.getDate() - 90);
  const cutoff90 = d.toISOString().slice(0, 10);

  const [
    projects,
    clients,
    people,
    timeEntries,
    span,
    lastSync,
    monthlyAgg,
    activeProjectCount,
    monthlyInvoiced,
    recentProjects,
    topContributors,
    recentInvoices,
  ] = await Promise.all([
    qScalar<number>("SELECT count(*)::int FROM projects").catch(() => 0),
    qScalar<number>("SELECT count(*)::int FROM clients").catch(() => 0),
    qScalar<number>("SELECT count(*)::int FROM users").catch(() => 0),
    qScalar<number>("SELECT count(*)::int FROM time_entries").catch(() => 0),
    qOne<{ first: string; last: string }>(
      "SELECT MIN(spent_date) AS first, MAX(spent_date) AS last FROM time_entries",
    ).catch(() => undefined),
    qScalar<string>(
      "SELECT MAX(last_synced_at)::text FROM sync_state",
    ).catch(() => undefined),
    qOne<{ contributors: number; hours: number }>(
      `
      SELECT COUNT(DISTINCT user_id)::int AS contributors,
             COALESCE(SUM(hours), 0)::float AS hours
      FROM time_entries WHERE spent_date >= @cutoff
      `,
      { cutoff: cutoff30 },
    ).catch(() => undefined),
    qScalar<number>(
      `
      SELECT COUNT(DISTINCT project_id)::int FROM time_entries
      WHERE spent_date >= @cutoff
      `,
      { cutoff: cutoff30 },
    ).catch(() => 0),
    qScalar<number>(
      `SELECT COALESCE(SUM(amount), 0)::float FROM invoices WHERE issue_date >= @cutoff`,
      { cutoff: cutoff30 },
    ).catch(() => 0),
    q<{
      id: number;
      name: string;
      code: string | null;
      client_id: number | null;
      client_name: string | null;
      hours: number;
      contributors: number;
      last_entry: string;
    }>(
      `
      SELECT p.id, p.name, p.code, c.id AS client_id, c.name AS client_name,
             SUM(t.hours)::float AS hours,
             COUNT(DISTINCT t.user_id)::int AS contributors,
             MAX(t.spent_date) AS last_entry
      FROM time_entries t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE t.spent_date >= @cutoff
      GROUP BY p.id, p.name, p.code, c.id, c.name
      ORDER BY last_entry DESC, hours DESC
      LIMIT 10
      `,
      { cutoff: cutoff30 },
    ).catch(() => []),
    q<{
      id: number;
      first_name: string | null;
      last_name: string | null;
      hours: number;
      projects: number;
    }>(
      `
      SELECT u.id, u.first_name, u.last_name,
             SUM(t.hours)::float AS hours,
             COUNT(DISTINCT t.project_id)::int AS projects
      FROM time_entries t
      JOIN users u ON u.id = t.user_id
      WHERE t.spent_date >= @cutoff
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY hours DESC
      LIMIT 10
      `,
      { cutoff: cutoff90 },
    ).catch(() => []),
    q<{
      id: number;
      number: string | null;
      client_id: number | null;
      client_name: string | null;
      issue_date: string | null;
      state: string | null;
      amount: number | null;
      due_amount: number | null;
      currency: string | null;
    }>(
      `
      SELECT i.id, i.number, c.id AS client_id, c.name AS client_name,
             i.issue_date, i.state, i.amount, i.due_amount, i.currency
      FROM invoices i
      LEFT JOIN clients c ON c.id = i.client_id
      WHERE i.issue_date >= @cutoff
      ORDER BY i.issue_date DESC NULLS LAST, i.id DESC
      LIMIT 8
      `,
      { cutoff: cutoff90 },
    ).catch(() => []),
  ]);

  return c.html(
    <Dashboard
      totals={{
        projects: Number(projects ?? 0),
        clients: Number(clients ?? 0),
        people: Number(people ?? 0),
        timeEntries: Number(timeEntries ?? 0),
        earliestEntry: span?.first ?? null,
        latestEntry: span?.last ?? null,
        lastSyncAt: lastSync ?? null,
      }}
      monthly={{
        activeProjects: Number(activeProjectCount ?? 0),
        contributors: Number(monthlyAgg?.contributors ?? 0),
        hours: Number(monthlyAgg?.hours ?? 0),
        invoiced: Number(monthlyInvoiced ?? 0),
      }}
      recentProjects={recentProjects}
      topContributors={topContributors}
      recentInvoices={recentInvoices}
    />,
  );
});
