import type { FC } from "hono/jsx";
import { Layout } from "./layout.js";
import { PageHeader } from "./components/PageHeader.js";
import { Pagination } from "./components/Pagination.js";
import { Empty } from "./components/Empty.js";
import { PeriodPills } from "./components/PeriodPills.js";
import { activeBadge, date, hours, money } from "../lib/format.js";
import { PERIOD_LABELS, type Period } from "../lib/period.js";

export interface ProjectRow {
  id: number;
  name: string;
  code: string | null;
  is_active: number;
  is_billable: number;
  starts_on: string | null;
  ends_on: string | null;
  budget: number | null;
  fee: number | null;
  client_id: number | null;
  client_name: string | null;
  total_hours: number | null;
  entry_count: number | null;
  last_entry: string | null;
}

export interface ProjectsListProps {
  rows: ProjectRow[];
  total: number;
  page: number;
  perPage: number;
  filters: {
    q?: string;
    client?: string;
    status?: string;
    sort?: string;
  };
  period: Period;
  clients: { id: number; name: string }[];
}

export const ProjectsList: FC<ProjectsListProps> = ({
  rows,
  total,
  page,
  perPage,
  filters,
  period,
  clients,
}) => {
  const periodLabel = PERIOD_LABELS[period].toLowerCase();
  const query: Record<string, string | undefined> = {
    ...filters,
    period: period === "month" ? undefined : period,
  };
  return (
    <Layout title="Projects" activeNav="projects" authed>
      <div class="mx-auto max-w-7xl px-6 py-8">
        <PageHeader
          eyebrow="Browse"
          title="Projects"
          subtitle={`Projects with activity in the ${periodLabel}. Hours and counts are scoped to the same window.`}
        >
          <PeriodPills basePath="/projects" query={query} period={period} />
        </PageHeader>

        <form method="get" action="/projects" class="card p-4 mb-6 flex flex-wrap items-end gap-3">
          <input type="hidden" name="period" value={period} />
          <div class="flex-1 min-w-[200px]">
            <label class="field-label" for="q">Search</label>
            <input
              id="q"
              name="q"
              type="search"
              class="field-input"
              placeholder="Name, code, notes…"
              value={filters.q ?? ""}
            />
          </div>
          <div class="min-w-[180px]">
            <label class="field-label" for="client">Client</label>
            <select id="client" name="client" class="field-input">
              <option value="">All clients</option>
              {clients.map((c) => (
                <option value={String(c.id)} selected={filters.client === String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div class="min-w-[140px]">
            <label class="field-label" for="status">Status</label>
            <select id="status" name="status" class="field-input">
              <option value="" selected={!filters.status}>All</option>
              <option value="active" selected={filters.status === "active"}>Active</option>
              <option value="archived" selected={filters.status === "archived"}>Archived</option>
            </select>
          </div>
          <div class="min-w-[170px]">
            <label class="field-label" for="sort">Sort by</label>
            <select id="sort" name="sort" class="field-input">
              <option value="" selected={!filters.sort}>Recent activity</option>
              <option value="name" selected={filters.sort === "name"}>Name</option>
              <option value="client" selected={filters.sort === "client"}>Client</option>
              <option value="hours" selected={filters.sort === "hours"}>Total hours</option>
              <option value="starts_on" selected={filters.sort === "starts_on"}>Start date</option>
            </select>
          </div>
          <div class="flex gap-2">
            <button type="submit" class="btn-primary">Apply</button>
            <a href="/projects" class="btn-ghost">Reset</a>
          </div>
        </form>

        {rows.length === 0 ? (
          <Empty title="No projects match" hint="Adjust filters or run a fetch to import projects." />
        ) : (
          <div class="card overflow-hidden">
            <table class="table-base">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th class="text-right">Hours</th>
                  <th class="text-right">Entries</th>
                  <th>Last activity</th>
                  <th>Dates</th>
                  <th class="text-right">Budget</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const badge = activeBadge(p.is_active);
                  return (
                    <tr class="hover:bg-surface/40">
                      <td>
                        <a class="font-medium text-ink hover:text-accent" href={`/projects/${p.id}`}>
                          {p.name}
                        </a>
                        {p.code && <div class="text-xs text-slate">{p.code}</div>}
                      </td>
                      <td>
                        {p.client_id ? (
                          <a href={`/clients/${p.client_id}`}>{p.client_name}</a>
                        ) : (
                          <span class="text-slate">—</span>
                        )}
                      </td>
                      <td>
                        <span class={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${badge.classes}`}>
                          {badge.text}
                        </span>
                      </td>
                      <td class="text-right tabular-nums">{hours(p.total_hours)}</td>
                      <td class="text-right tabular-nums">{p.entry_count ?? 0}</td>
                      <td class="text-xs text-slate">{date(p.last_entry)}</td>
                      <td class="text-xs text-slate">
                        {p.starts_on || p.ends_on ? `${date(p.starts_on)} → ${date(p.ends_on)}` : "—"}
                      </td>
                      <td class="text-right tabular-nums text-xs">
                        {p.budget ? hours(p.budget) + " hrs" : p.fee ? money(p.fee) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination
              basePath="/projects"
              query={query}
              page={page}
              perPage={perPage}
              total={total}
            />
          </div>
        )}
      </div>
    </Layout>
  );
};
