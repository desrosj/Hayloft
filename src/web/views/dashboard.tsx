import type { FC } from "hono/jsx";
import { Layout } from "./layout.js";
import { PageHeader, StatCard } from "./components/PageHeader.js";
import { Empty } from "./components/Empty.js";
import { date, fullName, hours, money } from "../lib/format.js";

interface RecentProject {
  id: number;
  name: string;
  code: string | null;
  client_id: number | null;
  client_name: string | null;
  hours: number;
  contributors: number;
  last_entry: string;
}

interface TopContributor {
  id: number;
  first_name: string | null;
  last_name: string | null;
  hours: number;
  projects: number;
}

interface RecentInvoice {
  id: number;
  number: string | null;
  client_id: number | null;
  client_name: string | null;
  issue_date: string | null;
  state: string | null;
  amount: number | null;
  due_amount: number | null;
  currency: string | null;
}

interface DashboardProps {
  totals: {
    projects: number;
    clients: number;
    people: number;
    timeEntries: number;
    earliestEntry: string | null;
    latestEntry: string | null;
    lastSyncAt: string | null;
    expenses: number;
    expensesWithReceipts: number;
  };
  monthly: {
    activeProjects: number;
    contributors: number;
    hours: number;
    invoiced: number;
    expenses: number;
  };
  recentProjects: RecentProject[];
  topContributors: TopContributor[];
  recentInvoices: RecentInvoice[];
}

const stateBadge = (state: string | null) => {
  switch ((state ?? "").toLowerCase()) {
    case "paid":
      return "bg-green-50 text-green-700 border-green-200";
    case "open":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "draft":
      return "bg-surface text-slate border-edge";
    default:
      return "bg-ink/5 text-ink border-edge";
  }
};

const fmt = new Intl.NumberFormat("en-US");

export const Dashboard: FC<DashboardProps> = ({
  totals,
  monthly,
  recentProjects,
  topContributors,
  recentInvoices,
}) => {
  return (
    <Layout title="Dashboard" activeNav="dashboard" authed>
      <div class="mx-auto max-w-7xl px-6 py-8">
        <PageHeader
          eyebrow="Overview"
          title="Hayloft"
          subtitle={
            totals.earliestEntry && totals.latestEntry
              ? `${fmt.format(totals.timeEntries)} time entries spanning ${date(totals.earliestEntry)} → ${date(totals.latestEntry)}.`
              : "Read-only snapshot of your archived Harvest history."
          }
        />

        <section class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard label="Active projects" value={monthly.activeProjects} hint="last 30 days" />
          <StatCard label="Contributors" value={monthly.contributors} hint="last 30 days" />
          <StatCard label="Hours logged" value={hours(monthly.hours)} hint="last 30 days" />
          <StatCard
            label="Invoiced"
            value={money(monthly.invoiced)}
            hint={
              monthly.expenses > 0
                ? `last 30 days · ${money(monthly.expenses)} in expenses`
                : "last 30 days"
            }
          />
        </section>

        <section class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div class="card p-5 lg:col-span-2">
            <div class="flex items-baseline justify-between mb-3">
              <h2 class="font-display font-semibold text-lg">Recent project activity</h2>
              <a class="text-xs" href="/projects">View all projects →</a>
            </div>
            {recentProjects.length === 0 ? (
              <Empty title="No activity in the last 30 days" />
            ) : (
              <table class="table-base">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Client</th>
                    <th class="text-right">Hours</th>
                    <th class="text-right">People</th>
                    <th>Last entry</th>
                  </tr>
                </thead>
                <tbody>
                  {recentProjects.map((p) => (
                    <tr class="hover:bg-surface/40">
                      <td>
                        <a href={`/projects/${p.id}`} class="font-medium text-ink hover:text-accent">
                          {p.name}
                        </a>
                        {p.code && <div class="text-xs text-slate">{p.code}</div>}
                      </td>
                      <td class="text-xs">
                        {p.client_id ? (
                          <a href={`/clients/${p.client_id}`}>{p.client_name}</a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td class="text-right tabular-nums">{hours(p.hours)}</td>
                      <td class="text-right tabular-nums">{p.contributors}</td>
                      <td class="text-xs text-slate">{date(p.last_entry)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div class="card p-5">
            <div class="flex items-baseline justify-between mb-3">
              <h2 class="font-display font-semibold text-lg">Top contributors</h2>
              <span class="text-xs text-slate">last 90 days</span>
            </div>
            {topContributors.length === 0 ? (
              <Empty title="No activity" />
            ) : (
              <ul class="space-y-2">
                {topContributors.map((u) => (
                  <li>
                    <a
                      href={`/people/${u.id}`}
                      class="flex items-baseline justify-between gap-3 text-sm hover:text-accent"
                    >
                      <span class="text-ink font-medium truncate">
                        {fullName(u.first_name, u.last_name)}
                      </span>
                      <span class="tabular-nums text-slate text-xs whitespace-nowrap">
                        {hours(u.hours)} hrs · {u.projects} proj
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div class="card p-5">
            <div class="flex items-baseline justify-between mb-3">
              <h2 class="font-display font-semibold text-lg">Recent invoices</h2>
              <a class="text-xs" href="/invoices">View all →</a>
            </div>
            {recentInvoices.length === 0 ? (
              <Empty title="No invoices in the last 90 days" />
            ) : (
              <table class="table-base">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Client</th>
                    <th>Issued</th>
                    <th>State</th>
                    <th class="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map((inv) => (
                    <tr>
                      <td>
                        <a href={`/invoices/${inv.id}`} class="font-medium text-ink hover:text-accent">
                          {inv.number ?? `#${inv.id}`}
                        </a>
                      </td>
                      <td class="text-xs">
                        {inv.client_id ? (
                          <a href={`/clients/${inv.client_id}`}>{inv.client_name}</a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td class="text-xs">{date(inv.issue_date)}</td>
                      <td>
                        <span class={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${stateBadge(inv.state)}`}>
                          {inv.state ?? "—"}
                        </span>
                      </td>
                      <td class="text-right tabular-nums">{money(inv.amount, inv.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div class="card p-5">
            <h2 class="font-display font-semibold text-lg mb-3">Archive totals</h2>
            <dl class="text-sm space-y-2">
              <Row label="Projects" value={fmt.format(totals.projects)} />
              <Row label="Clients" value={fmt.format(totals.clients)} />
              <Row label="People" value={fmt.format(totals.people)} />
              <Row label="Time entries" value={fmt.format(totals.timeEntries)} />
              <Row
                label="Expenses"
                value={
                  totals.expenses > 0
                    ? `${fmt.format(totals.expenses)} (${fmt.format(totals.expensesWithReceipts)} with receipts)`
                    : "—"
                }
              />
              <Row label="Last sync" value={totals.lastSyncAt ? date(totals.lastSyncAt) : "—"} />
            </dl>
            <div class="mt-4 pt-4 border-t border-edge">
              <a href="/admin" class="text-xs text-slate hover:text-accent">
                Sync status & admin →
              </a>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
};

const Row: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div class="flex justify-between gap-4">
    <dt class="text-slate">{label}</dt>
    <dd class="text-ink tabular-nums">{value}</dd>
  </div>
);
