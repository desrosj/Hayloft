import type { FC } from "hono/jsx";
import { Layout } from "./layout.js";
import { PageHeader, StatCard } from "./components/PageHeader.js";
import { Empty } from "./components/Empty.js";
import { activeBadge, date, hours, money, fullName, truncate } from "../lib/format.js";
import { ExpensesSection } from "./components/ExpensesTable.js";
import type { ExpenseSummary } from "../lib/expenses.js";

export interface ProjectDetailProps {
  project: {
    id: number;
    name: string;
    code: string | null;
    notes: string | null;
    is_active: number;
    is_billable: number;
    is_fixed_fee: number;
    bill_by: string | null;
    hourly_rate: number | null;
    budget: number | null;
    budget_by: string | null;
    fee: number | null;
    starts_on: string | null;
    ends_on: string | null;
    created_at: string | null;
    updated_at: string | null;
    client_id: number | null;
    client_name: string | null;
    client_currency: string | null;
  };
  stats: {
    total_hours: number;
    billable_hours: number;
    contributor_count: number;
    task_count: number;
    entry_count: number;
    invoice_count: number;
    invoiced_amount: number;
  };
  contributors: {
    user_id: number;
    first_name: string;
    last_name: string;
    hours: number;
    entries: number;
    last_entry: string;
  }[];
  taskBreakdown: {
    task_id: number;
    task_name: string;
    hours: number;
    entries: number;
  }[];
  recentEntries: {
    id: number;
    spent_date: string;
    user_first: string;
    user_last: string;
    task_name: string;
    hours: number;
    notes: string | null;
    billable: number;
  }[];
  invoices: {
    id: number;
    number: string;
    issue_date: string;
    state: string;
    amount: number;
    currency: string;
  }[];
  expenses: ExpenseSummary;
}

export const ProjectDetail: FC<ProjectDetailProps> = ({
  project,
  stats,
  contributors,
  taskBreakdown,
  recentEntries,
  invoices,
  expenses,
}) => {
  const badge = activeBadge(project.is_active);
  const currency = project.client_currency ?? "USD";

  return (
    <Layout title={project.name} activeNav="projects" authed>
      <div class="mx-auto max-w-7xl px-6 py-8">
        <PageHeader
          eyebrow={
            <a href={`/clients/${project.client_id}`} class="hover:text-accent">
              {project.client_name ?? "No client"}
            </a>
          }
          title={project.name}
          subtitle={project.code ?? undefined}
        >
          <span class={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${badge.classes}`}>
            {badge.text}
          </span>
          {project.is_billable === 1 && (
            <span class="text-[10px] uppercase tracking-wider px-2 py-1 rounded border bg-accent/10 text-accent border-accent/30">
              Billable
            </span>
          )}
        </PageHeader>

        <section class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard label="Total hours" value={hours(stats.total_hours)} hint={`${hours(stats.billable_hours)} billable`} />
          <StatCard label="Time entries" value={stats.entry_count} />
          <StatCard label="Contributors" value={stats.contributor_count} hint={`${stats.task_count} tasks`} />
          <StatCard
            label="Invoiced"
            value={money(stats.invoiced_amount, currency)}
            hint={`${stats.invoice_count} invoice${stats.invoice_count === 1 ? "" : "s"}`}
          />
        </section>

        <section class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div class="card p-5">
            <div class="label-eyebrow mb-3">Project info</div>
            <dl class="text-sm space-y-1.5">
              <Row label="Bill by" value={project.bill_by ?? "—"} />
              <Row label="Hourly rate" value={project.hourly_rate ? money(project.hourly_rate, currency) : "—"} />
              <Row label="Budget" value={project.budget_by && project.budget ? `${project.budget} (${project.budget_by})` : "—"} />
              <Row label="Fee" value={project.fee ? money(project.fee, currency) : "—"} />
              <Row label="Starts" value={date(project.starts_on)} />
              <Row label="Ends" value={date(project.ends_on)} />
              <Row label="Created" value={date(project.created_at)} />
            </dl>
          </div>
          <div class="card p-5 md:col-span-2">
            <div class="label-eyebrow mb-3">Notes</div>
            {project.notes ? (
              <p class="text-sm whitespace-pre-wrap text-ink/90">{project.notes}</p>
            ) : (
              <p class="text-sm text-slate italic">No notes recorded.</p>
            )}
          </div>
        </section>

        <section class="mb-8">
          <div class="flex items-baseline justify-between mb-3">
            <h2 class="font-display font-semibold text-lg">Contributors</h2>
            <span class="text-xs text-slate">Who logged time, and how much</span>
          </div>
          {contributors.length === 0 ? (
            <Empty title="No time entries logged" hint="No one has logged time against this project (yet, or in the imported window)." />
          ) : (
            <div class="card overflow-hidden">
              <table class="table-base">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th class="text-right">Hours</th>
                    <th class="text-right">Entries</th>
                    <th>Last entry</th>
                  </tr>
                </thead>
                <tbody>
                  {contributors.map((c) => (
                    <tr>
                      <td>
                        <a href={`/people/${c.user_id}`} class="font-medium text-ink hover:text-accent">
                          {fullName(c.first_name, c.last_name)}
                        </a>
                      </td>
                      <td class="text-right tabular-nums">{hours(c.hours)}</td>
                      <td class="text-right tabular-nums">{c.entries}</td>
                      <td class="text-xs text-slate">{date(c.last_entry)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section class="mb-8">
          <h2 class="font-display font-semibold text-lg mb-3">Tasks</h2>
          {taskBreakdown.length === 0 ? (
            <Empty title="No tasks used" />
          ) : (
            <div class="card overflow-hidden">
              <table class="table-base">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th class="text-right">Hours</th>
                    <th class="text-right">Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {taskBreakdown.map((t) => (
                    <tr>
                      <td>{t.task_name}</td>
                      <td class="text-right tabular-nums">{hours(t.hours)}</td>
                      <td class="text-right tabular-nums">{t.entries}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section class="mb-8">
          <div class="flex items-baseline justify-between mb-3">
            <h2 class="font-display font-semibold text-lg">Recent time entries</h2>
            <a class="text-xs" href={`/time?project=${project.id}`}>View all →</a>
          </div>
          {recentEntries.length === 0 ? (
            <Empty title="No entries" />
          ) : (
            <div class="card overflow-hidden">
              <table class="table-base">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Person</th>
                    <th>Task</th>
                    <th class="text-right">Hours</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEntries.map((e) => (
                    <tr>
                      <td class="text-xs">{date(e.spent_date)}</td>
                      <td class="text-xs">{fullName(e.user_first, e.user_last)}</td>
                      <td class="text-xs">{e.task_name}</td>
                      <td class="text-right tabular-nums">{hours(e.hours)}</td>
                      <td class="text-xs text-ink/80">{truncate(e.notes, 120)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <ExpensesSection
          summary={expenses}
          viewAllHref={`/expenses?project=${project.id}&period=all`}
          showProject={false}
          currency={currency}
        />

        {invoices.length > 0 && (
          <section class="mb-8">
            <h2 class="font-display font-semibold text-lg mb-3">Invoices</h2>
            <div class="card overflow-hidden">
              <table class="table-base">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Issued</th>
                    <th>State</th>
                    <th class="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr>
                      <td><a href={`/invoices/${inv.id}`}>{inv.number ?? `#${inv.id}`}</a></td>
                      <td class="text-xs">{date(inv.issue_date)}</td>
                      <td class="text-xs uppercase tracking-wider">{inv.state}</td>
                      <td class="text-right tabular-nums">{money(inv.amount, inv.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
};

const Row: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div class="flex justify-between gap-4 text-sm">
    <dt class="text-slate">{label}</dt>
    <dd class="text-ink tabular-nums">{value}</dd>
  </div>
);
