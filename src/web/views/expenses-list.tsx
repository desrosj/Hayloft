import type { FC } from "hono/jsx";
import { Layout } from "./layout.js";
import { PageHeader, StatCard } from "./components/PageHeader.js";
import { Pagination } from "./components/Pagination.js";
import { Empty } from "./components/Empty.js";
import { PeriodPills } from "./components/PeriodPills.js";
import { date, fullName, money, num, truncate } from "../lib/format.js";
import { PERIOD_LABELS, type Period } from "../lib/period.js";

export interface ExpenseRow {
  id: number;
  spent_date: string;
  notes: string | null;
  units: number | null;
  total_cost: number | null;
  billable: boolean | null;
  is_billed: boolean | null;
  currency: string | null;
  user_id: number | null;
  user_first: string | null;
  user_last: string | null;
  project_id: number | null;
  project_name: string | null;
  client_id: number | null;
  client_name: string | null;
  category_id: number | null;
  category_name: string | null;
  category_unit_name: string | null;
  invoice_id: number | null;
  has_receipt: boolean;
  receipt_stored: boolean;
}

export interface ExpenseFilters {
  from?: string;
  to?: string;
  user?: string;
  project?: string;
  client?: string;
  category?: string;
  billable?: string;
  billed?: string;
  receipt?: string;
}

interface ExpensesListProps {
  rows: ExpenseRow[];
  total: number;
  page: number;
  perPage: number;
  totals: { cost: number; billable_cost: number; with_receipts: number };
  filters: ExpenseFilters;
  period: Period;
  users: { id: number; first_name: string; last_name: string }[];
  projects: { id: number; name: string }[];
  clients: { id: number; name: string }[];
  categories: { id: number; name: string }[];
}

export const ExpensesList: FC<ExpensesListProps> = ({
  rows,
  total,
  page,
  perPage,
  totals,
  filters,
  period,
  users,
  projects,
  clients,
  categories,
}) => {
  const periodLabel = PERIOD_LABELS[period].toLowerCase();
  const query: Record<string, string | undefined> = {
    ...filters,
    period: period === "month" ? undefined : period,
  };
  const usingExplicitDates = !!filters.from;
  return (
    <Layout title="Expenses" activeNav="expenses" authed>
      <div class="mx-auto max-w-7xl px-6 py-8">
        <PageHeader
          eyebrow="Browse"
          title="Expenses"
          subtitle={
            usingExplicitDates
              ? "Showing expenses in your custom date range."
              : period === "all"
                ? "Showing every archived expense. Use the date inputs below to narrow down."
                : `Showing expenses from the ${periodLabel}. Use the date inputs below to override.`
          }
        >
          <PeriodPills basePath="/expenses" query={query} period={period} />
        </PageHeader>

        <section class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Expenses shown" value={total} />
          <StatCard label="Total cost (filtered)" value={money(totals.cost)} />
          <StatCard label="Billable" value={money(totals.billable_cost)} />
          <StatCard
            label="With receipts"
            value={totals.with_receipts}
            hint={total > 0 ? `${Math.round((totals.with_receipts / total) * 100)}% of shown` : undefined}
          />
        </section>

        <form method="get" action="/expenses" class="card p-4 mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <input type="hidden" name="period" value={period} />
          <div>
            <label class="field-label" for="from">From</label>
            <input id="from" type="date" name="from" class="field-input" value={filters.from ?? ""} />
          </div>
          <div>
            <label class="field-label" for="to">To</label>
            <input id="to" type="date" name="to" class="field-input" value={filters.to ?? ""} />
          </div>
          <div>
            <label class="field-label" for="user">Person</label>
            <select id="user" name="user" class="field-input">
              <option value="">All</option>
              {users.map((u) => (
                <option value={String(u.id)} selected={filters.user === String(u.id)}>
                  {fullName(u.first_name, u.last_name)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label class="field-label" for="category">Category</label>
            <select id="category" name="category" class="field-input">
              <option value="">All</option>
              {categories.map((cat) => (
                <option value={String(cat.id)} selected={filters.category === String(cat.id)}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label class="field-label" for="client">Client</label>
            <select id="client" name="client" class="field-input">
              <option value="">All</option>
              {clients.map((cl) => (
                <option value={String(cl.id)} selected={filters.client === String(cl.id)}>
                  {cl.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label class="field-label" for="project">Project</label>
            <select id="project" name="project" class="field-input">
              <option value="">All</option>
              {projects.map((p) => (
                <option value={String(p.id)} selected={filters.project === String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label class="field-label" for="billable">Billable</label>
            <select id="billable" name="billable" class="field-input">
              <option value="" selected={!filters.billable}>All</option>
              <option value="yes" selected={filters.billable === "yes"}>Billable</option>
              <option value="no" selected={filters.billable === "no"}>Non-billable</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="billed">Billed</label>
            <select id="billed" name="billed" class="field-input">
              <option value="" selected={!filters.billed}>All</option>
              <option value="yes" selected={filters.billed === "yes"}>Billed</option>
              <option value="no" selected={filters.billed === "no"}>Unbilled</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="receipt">Receipt</label>
            <select id="receipt" name="receipt" class="field-input">
              <option value="" selected={!filters.receipt}>All</option>
              <option value="yes" selected={filters.receipt === "yes"}>Has receipt</option>
              <option value="no" selected={filters.receipt === "no"}>No receipt</option>
            </select>
          </div>
          <div class="col-span-2 md:col-span-3 flex gap-2 justify-end items-end mt-1">
            <a href="/expenses" class="btn-ghost">Reset</a>
            <button type="submit" class="btn-primary">Apply filters</button>
          </div>
        </form>

        {rows.length === 0 ? (
          <Empty
            title="No expenses match"
            hint="Loosen the filters above, or run `npm run fetch -- --resource expense_categories,expenses,expense_receipts` to pull expenses from Harvest."
          />
        ) : (
          <div class="card overflow-hidden">
            <table class="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Person</th>
                  <th>Client / Project</th>
                  <th>Category</th>
                  <th class="text-right">Units</th>
                  <th class="text-right">Cost</th>
                  <th>Billable</th>
                  <th>Receipt</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr class="hover:bg-surface/40">
                    <td class="text-xs whitespace-nowrap">
                      <a href={`/expenses/${e.id}`} class="font-medium text-ink hover:text-accent">
                        {date(e.spent_date)}
                      </a>
                    </td>
                    <td class="text-xs whitespace-nowrap">
                      {e.user_id ? (
                        <a href={`/people/${e.user_id}`}>{fullName(e.user_first, e.user_last)}</a>
                      ) : (
                        fullName(e.user_first, e.user_last)
                      )}
                    </td>
                    <td class="text-xs">
                      <div>
                        {e.client_id ? (
                          <a href={`/clients/${e.client_id}`}>{e.client_name ?? "—"}</a>
                        ) : (
                          e.client_name ?? "—"
                        )}
                      </div>
                      <div>
                        {e.project_id ? (
                          <a href={`/projects/${e.project_id}`} class="text-ink hover:text-accent">
                            {e.project_name ?? "—"}
                          </a>
                        ) : (
                          e.project_name ?? "—"
                        )}
                      </div>
                    </td>
                    <td class="text-xs">{e.category_name ?? "—"}</td>
                    <td class="text-right tabular-nums text-xs">
                      {e.units !== null && e.units !== undefined && e.category_unit_name
                        ? `${num(e.units)} ${e.category_unit_name}`
                        : e.units
                          ? num(e.units)
                          : "—"}
                    </td>
                    <td class="text-right tabular-nums">
                      <a href={`/expenses/${e.id}`} class="text-ink hover:text-accent">
                        {money(e.total_cost, e.currency)}
                      </a>
                    </td>
                    <td class="text-xs">
                      {e.billable ? (
                        <span class="text-accent">Yes{e.is_billed ? " · billed" : ""}</span>
                      ) : (
                        <span class="text-slate">No</span>
                      )}
                    </td>
                    <td class="text-xs whitespace-nowrap">
                      {e.receipt_stored ? (
                        <a href={`/expenses/${e.id}/receipt`} title="Open receipt">📎 Receipt</a>
                      ) : e.has_receipt ? (
                        <span class="text-slate" title="Harvest has a receipt but it has not been downloaded yet">📎 pending</span>
                      ) : (
                        <span class="text-slate">—</span>
                      )}
                    </td>
                    <td class="text-xs text-ink/80">{truncate(e.notes, 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              basePath="/expenses"
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
