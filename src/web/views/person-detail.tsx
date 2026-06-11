import type { FC } from "hono/jsx";
import { Layout } from "./layout.js";
import { PageHeader, StatCard } from "./components/PageHeader.js";
import { Empty } from "./components/Empty.js";
import { activeBadge, date, fullName, hours, money, truncate } from "../lib/format.js";

interface PersonDetailProps {
  person: {
    id: number;
    first_name: string;
    last_name: string;
    email: string | null;
    telephone: string | null;
    timezone: string | null;
    weekly_capacity: number | null;
    default_hourly_rate: number | null;
    cost_rate: number | null;
    is_active: number;
    is_contractor: number;
    roles: string | null;
    created_at: string | null;
    updated_at: string | null;
  };
  stats: {
    total_hours: number;
    billable_hours: number;
    entry_count: number;
    project_count: number;
    client_count: number;
    first_entry: string | null;
    last_entry: string | null;
  };
  byYear: { year: string; hours: number; billable: number; entries: number }[];
  byProject: {
    project_id: number;
    project_name: string;
    client_id: number | null;
    client_name: string | null;
    hours: number;
    entries: number;
    last_entry: string;
  }[];
  recentEntries: {
    id: number;
    spent_date: string;
    project_id: number | null;
    project_name: string;
    task_name: string;
    hours: number;
    notes: string | null;
    billable: number;
  }[];
}

export const PersonDetail: FC<PersonDetailProps> = ({
  person,
  stats,
  byYear,
  byProject,
  recentEntries,
}) => {
  const badge = activeBadge(person.is_active);
  let roleList: string[] = [];
  try {
    const parsed = person.roles ? JSON.parse(person.roles) : [];
    if (Array.isArray(parsed)) roleList = parsed;
  } catch {}

  return (
    <Layout title={fullName(person.first_name, person.last_name)} activeNav="people" authed>
      <div class="mx-auto max-w-7xl px-6 py-8">
        <PageHeader
          eyebrow={person.is_contractor === 1 ? "Contractor" : "Team member"}
          title={fullName(person.first_name, person.last_name)}
          subtitle={person.email ?? undefined}
        >
          <span class={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${badge.classes}`}>
            {badge.text}
          </span>
        </PageHeader>

        <section class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard label="Total hours" value={hours(stats.total_hours)} hint={`${hours(stats.billable_hours)} billable`} />
          <StatCard label="Time entries" value={stats.entry_count} />
          <StatCard label="Projects" value={stats.project_count} hint={`${stats.client_count} clients`} />
          <StatCard
            label="Active"
            value={
              stats.first_entry
                ? `${date(stats.first_entry).split(",")[0]} – ${date(stats.last_entry).split(",")[0]}`
                : "—"
            }
          />
        </section>

        <section class="card p-5 mb-8">
          <div class="label-eyebrow mb-3">Profile</div>
          <dl class="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
            <Row label="Telephone" value={person.telephone ?? "—"} />
            <Row label="Timezone" value={person.timezone ?? "—"} />
            <Row label="Weekly capacity" value={person.weekly_capacity ? `${person.weekly_capacity / 3600} hrs` : "—"} />
            <Row label="Default rate" value={person.default_hourly_rate ? money(person.default_hourly_rate) : "—"} />
            <Row label="Cost rate" value={person.cost_rate ? money(person.cost_rate) : "—"} />
            <Row label="Created" value={date(person.created_at)} />
            <Row label="Roles" value={roleList.length ? roleList.join(", ") : "—"} />
          </dl>
        </section>

        <section class="mb-8">
          <h2 class="font-display font-semibold text-lg mb-3">Hours by year</h2>
          {byYear.length === 0 ? (
            <Empty title="No time entries" />
          ) : (
            <div class="card overflow-hidden">
              <table class="table-base">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th class="text-right">Hours</th>
                    <th class="text-right">Billable</th>
                    <th class="text-right">Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {byYear.map((y) => (
                    <tr>
                      <td class="font-medium">{y.year}</td>
                      <td class="text-right tabular-nums">{hours(y.hours)}</td>
                      <td class="text-right tabular-nums">{hours(y.billable)}</td>
                      <td class="text-right tabular-nums">{y.entries}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section class="mb-8">
          <h2 class="font-display font-semibold text-lg mb-3">Hours by project</h2>
          {byProject.length === 0 ? (
            <Empty title="No projects" />
          ) : (
            <div class="card overflow-hidden">
              <table class="table-base">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Client</th>
                    <th class="text-right">Hours</th>
                    <th class="text-right">Entries</th>
                    <th>Last entry</th>
                  </tr>
                </thead>
                <tbody>
                  {byProject.map((p) => (
                    <tr>
                      <td>
                        <a href={`/projects/${p.project_id}`} class="font-medium text-ink hover:text-accent">
                          {p.project_name}
                        </a>
                      </td>
                      <td class="text-xs">
                        {p.client_id ? <a href={`/clients/${p.client_id}`}>{p.client_name}</a> : "—"}
                      </td>
                      <td class="text-right tabular-nums">{hours(p.hours)}</td>
                      <td class="text-right tabular-nums">{p.entries}</td>
                      <td class="text-xs text-slate">{date(p.last_entry)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section class="mb-8">
          <div class="flex items-baseline justify-between mb-3">
            <h2 class="font-display font-semibold text-lg">Recent entries</h2>
            <a class="text-xs" href={`/time?user=${person.id}`}>View all →</a>
          </div>
          {recentEntries.length === 0 ? (
            <Empty title="No entries" />
          ) : (
            <div class="card overflow-hidden">
              <table class="table-base">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Project</th>
                    <th>Task</th>
                    <th class="text-right">Hours</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEntries.map((e) => (
                    <tr>
                      <td class="text-xs">{date(e.spent_date)}</td>
                      <td class="text-xs">
                        {e.project_id ? <a href={`/projects/${e.project_id}`}>{e.project_name}</a> : e.project_name}
                      </td>
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
      </div>
    </Layout>
  );
};

const Row: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt class="text-[11px] uppercase tracking-wider text-slate">{label}</dt>
    <dd class="text-sm text-ink tabular-nums">{value}</dd>
  </div>
);
