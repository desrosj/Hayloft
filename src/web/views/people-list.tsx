import type { FC } from "hono/jsx";
import { Layout } from "./layout.js";
import { PageHeader } from "./components/PageHeader.js";
import { Pagination } from "./components/Pagination.js";
import { Empty } from "./components/Empty.js";
import { PeriodPills } from "./components/PeriodPills.js";
import { activeBadge, date, fullName, hours } from "../lib/format.js";
import { PERIOD_LABELS, type Period } from "../lib/period.js";

export interface PersonRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  is_active: number;
  is_contractor: number;
  roles: string | null;
  total_hours: number | null;
  entry_count: number | null;
  project_count: number | null;
  last_entry: string | null;
}

interface PeopleListProps {
  rows: PersonRow[];
  total: number;
  page: number;
  perPage: number;
  filters: { q?: string; status?: string; sort?: string };
  period: Period;
}

export const PeopleList: FC<PeopleListProps> = ({
  rows,
  total,
  page,
  perPage,
  filters,
  period,
}) => {
  const periodLabel = PERIOD_LABELS[period].toLowerCase();
  const query: Record<string, string | undefined> = {
    ...filters,
    period: period === "month" ? undefined : period,
  };
  return (
    <Layout title="People" activeNav="people" authed>
      <div class="mx-auto max-w-7xl px-6 py-8">
        <PageHeader
          eyebrow="Browse"
          title="People"
          subtitle={`People with activity in the ${periodLabel}. Hours and counts are scoped to the same window.`}
        >
          <PeriodPills basePath="/people" query={query} period={period} />
        </PageHeader>

        <form method="get" action="/people" class="card p-4 mb-6 flex flex-wrap items-end gap-3">
          <input type="hidden" name="period" value={period} />
          <div class="flex-1 min-w-[200px]">
            <label class="field-label" for="q">Search</label>
            <input id="q" name="q" type="search" class="field-input" placeholder="Name or email…" value={filters.q ?? ""} />
          </div>
          <div class="min-w-[140px]">
            <label class="field-label" for="status">Status</label>
            <select id="status" name="status" class="field-input">
              <option value="" selected={!filters.status}>All</option>
              <option value="active" selected={filters.status === "active"}>Active</option>
              <option value="archived" selected={filters.status === "archived"}>Archived</option>
            </select>
          </div>
          <div class="min-w-[160px]">
            <label class="field-label" for="sort">Sort by</label>
            <select id="sort" name="sort" class="field-input">
              <option value="" selected={!filters.sort}>Hours</option>
              <option value="name" selected={filters.sort === "name"}>Name</option>
              <option value="recent" selected={filters.sort === "recent"}>Recent activity</option>
            </select>
          </div>
          <div class="flex gap-2">
            <button type="submit" class="btn-primary">Apply</button>
            <a href="/people" class="btn-ghost">Reset</a>
          </div>
        </form>

        {rows.length === 0 ? (
          <Empty title="No people match" />
        ) : (
          <div class="card overflow-hidden">
            <table class="table-base">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Roles</th>
                  <th class="text-right">Hours</th>
                  <th class="text-right">Projects</th>
                  <th class="text-right">Entries</th>
                  <th>Last entry</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const badge = activeBadge(p.is_active);
                  let roleNames = "";
                  try {
                    const parsed = p.roles ? JSON.parse(p.roles) : [];
                    if (Array.isArray(parsed)) roleNames = parsed.slice(0, 3).join(", ");
                  } catch {}
                  return (
                    <tr class="hover:bg-surface/40">
                      <td>
                        <a class="font-medium text-ink hover:text-accent" href={`/people/${p.id}`}>
                          {fullName(p.first_name, p.last_name)}
                        </a>
                        {p.is_contractor === 1 && <span class="ml-1 text-[10px] text-slate uppercase tracking-wider">contractor</span>}
                      </td>
                      <td class="text-xs">{p.email ?? "—"}</td>
                      <td>
                        <span class={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${badge.classes}`}>
                          {badge.text}
                        </span>
                      </td>
                      <td class="text-xs text-slate">{roleNames || "—"}</td>
                      <td class="text-right tabular-nums">{hours(p.total_hours)}</td>
                      <td class="text-right tabular-nums">{p.project_count ?? 0}</td>
                      <td class="text-right tabular-nums">{p.entry_count ?? 0}</td>
                      <td class="text-xs text-slate">{date(p.last_entry)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination
              basePath="/people"
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
