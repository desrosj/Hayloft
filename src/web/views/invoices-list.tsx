import type { FC } from "hono/jsx";
import { Layout } from "./layout.js";
import { PageHeader, StatCard } from "./components/PageHeader.js";
import { Pagination } from "./components/Pagination.js";
import { Empty } from "./components/Empty.js";
import { PeriodPills } from "./components/PeriodPills.js";
import { date, money } from "../lib/format.js";
import { PERIOD_LABELS, type Period } from "../lib/period.js";

export interface InvoiceRow {
  id: number;
  number: string | null;
  client_id: number | null;
  client_name: string | null;
  issue_date: string | null;
  due_date: string | null;
  state: string | null;
  amount: number | null;
  due_amount: number | null;
  currency: string | null;
  subject: string | null;
}

interface InvoicesListProps {
  rows: InvoiceRow[];
  total: number;
  page: number;
  perPage: number;
  totals: { amount: number; outstanding: number; paid: number };
  filters: { q?: string; client?: string; state?: string; year?: string };
  period: Period;
  clients: { id: number; name: string }[];
  years: string[];
  states: string[];
}

const stateBadge = (state: string | null) => {
  switch ((state ?? "").toLowerCase()) {
    case "paid":
      return "bg-green-50 text-green-700 border-green-200";
    case "open":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "draft":
      return "bg-surface text-slate border-edge";
    case "closed":
      return "bg-ink/5 text-ink border-edge";
    default:
      return "bg-surface text-slate border-edge";
  }
};

export const InvoicesList: FC<InvoicesListProps> = ({
  rows,
  total,
  page,
  perPage,
  totals,
  filters,
  period,
  clients,
  years,
  states,
}) => {
  const periodLabel = PERIOD_LABELS[period].toLowerCase();
  const yearOverride = filters.year && /^\d{4}$/.test(filters.year);
  const query: Record<string, string | undefined> = {
    ...filters,
    period: period === "month" ? undefined : period,
  };
  return (
    <Layout title="Invoices" activeNav="invoices" authed>
      <div class="mx-auto max-w-7xl px-6 py-8">
        <PageHeader
          eyebrow="Browse"
          title="Invoices"
          subtitle={
            yearOverride
              ? `Invoices issued in ${filters.year}. Period filter is overridden by the explicit year.`
              : `Invoices issued in the ${periodLabel}. Pick a year below to override.`
          }
        >
          <PeriodPills basePath="/invoices" query={query} period={period} />
        </PageHeader>

        <section class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <StatCard label="Invoiced (filtered)" value={money(totals.amount)} />
          <StatCard label="Paid" value={money(totals.paid)} />
          <StatCard label="Outstanding" value={money(totals.outstanding)} />
        </section>

        <form method="get" action="/invoices" class="card p-4 mb-6 flex flex-wrap items-end gap-3">
          <input type="hidden" name="period" value={period} />
          <div class="flex-1 min-w-[200px]">
            <label class="field-label" for="q">Search</label>
            <input id="q" name="q" type="search" class="field-input" placeholder="Number, subject, notes…" value={filters.q ?? ""} />
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
            <label class="field-label" for="state">State</label>
            <select id="state" name="state" class="field-input">
              <option value="">All</option>
              {states.map((s) => (
                <option value={s} selected={filters.state === s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div class="min-w-[120px]">
            <label class="field-label" for="year">Year</label>
            <select id="year" name="year" class="field-input">
              <option value="">All</option>
              {years.map((y) => (
                <option value={y} selected={filters.year === y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div class="flex gap-2">
            <button type="submit" class="btn-primary">Apply</button>
            <a href="/invoices" class="btn-ghost">Reset</a>
          </div>
        </form>

        {rows.length === 0 ? (
          <Empty title="No invoices match" />
        ) : (
          <div class="card overflow-hidden">
            <table class="table-base">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Client</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th>State</th>
                  <th class="text-right">Amount</th>
                  <th class="text-right">Outstanding</th>
                  <th>Subject</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => (
                  <tr class="hover:bg-surface/40">
                    <td>
                      <a href={`/invoices/${inv.id}`} class="font-medium text-ink hover:text-accent">
                        {inv.number ?? `#${inv.id}`}
                      </a>
                    </td>
                    <td class="text-xs">
                      {inv.client_id ? <a href={`/clients/${inv.client_id}`}>{inv.client_name}</a> : "—"}
                    </td>
                    <td class="text-xs whitespace-nowrap">{date(inv.issue_date)}</td>
                    <td class="text-xs whitespace-nowrap">{date(inv.due_date)}</td>
                    <td>
                      <span class={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${stateBadge(inv.state)}`}>
                        {inv.state ?? "—"}
                      </span>
                    </td>
                    <td class="text-right tabular-nums">{money(inv.amount, inv.currency)}</td>
                    <td class="text-right tabular-nums">
                      {inv.due_amount ? money(inv.due_amount, inv.currency) : <span class="text-slate">—</span>}
                    </td>
                    <td class="text-xs text-ink/80">{inv.subject ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              basePath="/invoices"
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
