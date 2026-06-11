import type { FC } from "hono/jsx";
import { Layout } from "./layout.js";
import { PageHeader, StatCard } from "./components/PageHeader.js";
import { Empty } from "./components/Empty.js";
import { activeBadge, date, hours, money } from "../lib/format.js";

interface ClientDetailProps {
  client: {
    id: number;
    name: string;
    is_active: number;
    address: string | null;
    currency: string | null;
    created_at: string | null;
    updated_at: string | null;
  };
  stats: {
    project_count: number;
    active_project_count: number;
    total_hours: number;
    billable_hours: number;
    entry_count: number;
    contributor_count: number;
    invoice_count: number;
    invoiced_amount: number;
    paid_amount: number;
    outstanding_amount: number;
  };
  contacts: {
    id: number;
    title: string | null;
    first_name: string;
    last_name: string;
    email: string | null;
    phone_office: string | null;
    phone_mobile: string | null;
  }[];
  projects: {
    id: number;
    name: string;
    code: string | null;
    is_active: number;
    starts_on: string | null;
    ends_on: string | null;
    hours: number;
    last_entry: string | null;
  }[];
  invoices: {
    id: number;
    number: string;
    issue_date: string;
    due_date: string | null;
    state: string;
    amount: number;
    due_amount: number;
    currency: string;
  }[];
  estimates: {
    id: number;
    number: string;
    issue_date: string;
    state: string;
    amount: number;
    currency: string;
  }[];
}

export const ClientDetail: FC<ClientDetailProps> = ({
  client,
  stats,
  contacts,
  projects,
  invoices,
  estimates,
}) => {
  const badge = activeBadge(client.is_active);
  const currency = client.currency ?? "USD";

  return (
    <Layout title={client.name} activeNav="clients" authed>
      <div class="mx-auto max-w-7xl px-6 py-8">
        <PageHeader eyebrow="Client" title={client.name}>
          <span class={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${badge.classes}`}>
            {badge.text}
          </span>
        </PageHeader>

        <section class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard
            label="Projects"
            value={stats.project_count}
            hint={stats.active_project_count ? `${stats.active_project_count} active` : undefined}
          />
          <StatCard label="Total hours" value={hours(stats.total_hours)} hint={`${hours(stats.billable_hours)} billable`} />
          <StatCard
            label="Invoiced"
            value={money(stats.invoiced_amount, currency)}
            hint={`${stats.invoice_count} invoice${stats.invoice_count === 1 ? "" : "s"}`}
          />
          <StatCard
            label="Outstanding"
            value={money(stats.outstanding_amount, currency)}
            hint={`${money(stats.paid_amount, currency)} paid`}
          />
        </section>

        <section class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div class="card p-5">
            <div class="label-eyebrow mb-3">Address</div>
            {client.address ? (
              <p class="text-sm whitespace-pre-wrap text-ink/90">{client.address}</p>
            ) : (
              <p class="text-sm text-slate italic">No address.</p>
            )}
          </div>
          <div class="card p-5">
            <div class="label-eyebrow mb-3">Contacts</div>
            {contacts.length === 0 ? (
              <p class="text-sm text-slate italic">No contacts.</p>
            ) : (
              <ul class="text-sm space-y-2">
                {contacts.map((ct) => (
                  <li>
                    <div class="font-medium text-ink">
                      {ct.title ? `${ct.title} ` : ""}
                      {ct.first_name} {ct.last_name}
                    </div>
                    <div class="text-xs text-slate">
                      {ct.email && <a href={`mailto:${ct.email}`}>{ct.email}</a>}
                      {ct.email && (ct.phone_office || ct.phone_mobile) && " · "}
                      {ct.phone_office || ct.phone_mobile || ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section class="mb-8">
          <h2 class="font-display font-semibold text-lg mb-3">Projects</h2>
          {projects.length === 0 ? (
            <Empty title="No projects for this client" />
          ) : (
            <div class="card overflow-hidden">
              <table class="table-base">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Status</th>
                    <th>Dates</th>
                    <th class="text-right">Hours</th>
                    <th>Last entry</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => {
                    const badge = activeBadge(p.is_active);
                    return (
                      <tr>
                        <td>
                          <a href={`/projects/${p.id}`} class="font-medium text-ink hover:text-accent">
                            {p.name}
                          </a>
                          {p.code && <div class="text-xs text-slate">{p.code}</div>}
                        </td>
                        <td>
                          <span class={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${badge.classes}`}>
                            {badge.text}
                          </span>
                        </td>
                        <td class="text-xs text-slate">
                          {p.starts_on || p.ends_on ? `${date(p.starts_on)} → ${date(p.ends_on)}` : "—"}
                        </td>
                        <td class="text-right tabular-nums">{hours(p.hours)}</td>
                        <td class="text-xs text-slate">{date(p.last_entry)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {invoices.length > 0 && (
          <section class="mb-8">
            <h2 class="font-display font-semibold text-lg mb-3">Invoices</h2>
            <div class="card overflow-hidden">
              <table class="table-base">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Issued</th>
                    <th>Due</th>
                    <th>State</th>
                    <th class="text-right">Amount</th>
                    <th class="text-right">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr>
                      <td><a href={`/invoices/${inv.id}`}>{inv.number ?? `#${inv.id}`}</a></td>
                      <td class="text-xs">{date(inv.issue_date)}</td>
                      <td class="text-xs">{date(inv.due_date)}</td>
                      <td class="text-xs uppercase tracking-wider">{inv.state}</td>
                      <td class="text-right tabular-nums">{money(inv.amount, inv.currency)}</td>
                      <td class="text-right tabular-nums">{money(inv.due_amount, inv.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {estimates.length > 0 && (
          <section class="mb-8">
            <h2 class="font-display font-semibold text-lg mb-3">Estimates</h2>
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
                  {estimates.map((est) => (
                    <tr>
                      <td>{est.number ?? `#${est.id}`}</td>
                      <td class="text-xs">{date(est.issue_date)}</td>
                      <td class="text-xs uppercase tracking-wider">{est.state}</td>
                      <td class="text-right tabular-nums">{money(est.amount, est.currency)}</td>
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
