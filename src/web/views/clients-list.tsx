import type { FC } from "hono/jsx";
import { Layout } from "./layout.js";
import { PageHeader } from "./components/PageHeader.js";
import { Pagination } from "./components/Pagination.js";
import { Empty } from "./components/Empty.js";
import { PeriodPills } from "./components/PeriodPills.js";
import { activeBadge, date, hours, money } from "../lib/format.js";
import { PERIOD_LABELS, type Period } from "../lib/period.js";

export interface ClientRow {
  id: number;
  name: string;
  is_active: number;
  currency: string | null;
  project_count: number | null;
  active_project_count: number | null;
  total_hours: number | null;
  invoice_count: number | null;
  invoiced_amount: number | null;
  paid_amount: number | null;
  last_activity: string | null;
}

interface ClientsListProps {
  rows: ClientRow[];
  total: number;
  page: number;
  perPage: number;
  filters: { q?: string; status?: string; sort?: string };
  period: Period;
}

export const ClientsList: FC<ClientsListProps> = ({
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
    <Layout title="Clients" activeNav="clients" authed>
      <div class="mx-auto max-w-7xl px-6 py-8">
        <PageHeader
          eyebrow="Browse"
          title="Clients"
          subtitle={`Clients with activity in the ${periodLabel}. Hours and invoiced totals are scoped to the window; project counts are lifetime.`}
        >
          <PeriodPills basePath="/clients" query={query} period={period} />
        </PageHeader>

        <form method="get" action="/clients" class="card p-4 mb-6 flex flex-wrap items-end gap-3">
          <input type="hidden" name="period" value={period} />
          <div class="flex-1 min-w-[200px]">
            <label class="field-label" for="q">Search</label>
            <input id="q" name="q" type="search" class="field-input" placeholder="Client name…" value={filters.q ?? ""} />
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
              <option value="" selected={!filters.sort}>Invoiced</option>
              <option value="name" selected={filters.sort === "name"}>Name</option>
              <option value="hours" selected={filters.sort === "hours"}>Hours</option>
              <option value="recent" selected={filters.sort === "recent"}>Recent activity</option>
            </select>
          </div>
          <div class="flex gap-2">
            <button type="submit" class="btn-primary">Apply</button>
            <a href="/clients" class="btn-ghost">Reset</a>
          </div>
        </form>

        {rows.length === 0 ? (
          <Empty title="No clients match" />
        ) : (
          <div class="card overflow-hidden">
            <table class="table-base">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Status</th>
                  <th class="text-right">Projects</th>
                  <th class="text-right">Hours</th>
                  <th class="text-right">Invoiced</th>
                  <th class="text-right">Paid</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((cl) => {
                  const badge = activeBadge(cl.is_active);
                  return (
                    <tr class="hover:bg-surface/40">
                      <td>
                        <a class="font-medium text-ink hover:text-accent" href={`/clients/${cl.id}`}>
                          {cl.name}
                        </a>
                      </td>
                      <td>
                        <span class={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${badge.classes}`}>
                          {badge.text}
                        </span>
                      </td>
                      <td class="text-right tabular-nums">
                        {cl.project_count ?? 0}
                        {cl.active_project_count ? (
                          <span class="text-xs text-slate ml-1">({cl.active_project_count} active)</span>
                        ) : null}
                      </td>
                      <td class="text-right tabular-nums">{hours(cl.total_hours)}</td>
                      <td class="text-right tabular-nums">{money(cl.invoiced_amount, cl.currency)}</td>
                      <td class="text-right tabular-nums">{money(cl.paid_amount, cl.currency)}</td>
                      <td class="text-xs text-slate">{date(cl.last_activity)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination
              basePath="/clients"
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
