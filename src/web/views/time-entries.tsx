import type { FC } from "hono/jsx";
import { Layout } from "./layout.js";
import { PageHeader, StatCard } from "./components/PageHeader.js";
import { Pagination } from "./components/Pagination.js";
import { Empty } from "./components/Empty.js";
import { PeriodPills } from "./components/PeriodPills.js";
import { date, fullName, hours, truncate } from "../lib/format.js";
import { PERIOD_LABELS, type Period } from "../lib/period.js";

export interface TimeEntryRow {
  id: number;
  spent_date: string;
  hours: number;
  notes: string | null;
  billable: number;
  is_billed: number;
  user_id: number | null;
  user_first: string | null;
  user_last: string | null;
  project_id: number | null;
  project_name: string | null;
  client_id: number | null;
  client_name: string | null;
  task_id: number | null;
  task_name: string | null;
}

interface TimeEntriesProps {
  rows: TimeEntryRow[];
  total: number;
  page: number;
  perPage: number;
  totals: { hours: number; billable_hours: number };
  filters: {
    from?: string;
    to?: string;
    user?: string;
    project?: string;
    client?: string;
    task?: string;
    billable?: string;
    billed?: string;
  };
  period: Period;
  users: { id: number; first_name: string; last_name: string }[];
  projects: { id: number; name: string }[];
  clients: { id: number; name: string }[];
  tasks: { id: number; name: string }[];
}

export const TimeEntries: FC<TimeEntriesProps> = ({
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
  tasks,
}) => {
  const periodLabel = PERIOD_LABELS[period].toLowerCase();
  const query: Record<string, string | undefined> = {
    ...filters,
    period: period === "month" ? undefined : period,
  };
  const usingExplicitDates = !!filters.from;
  return (
    <Layout title="Time entries" activeNav="time" authed>
      <div class="mx-auto max-w-7xl px-6 py-8">
        <PageHeader
          eyebrow="Browse"
          title="Time entries"
          subtitle={
            usingExplicitDates
              ? `Showing entries in your custom date range.`
              : `Showing entries from the ${periodLabel}. Use the date inputs below to override.`
          }
        >
          <PeriodPills basePath="/time" query={query} period={period} />
        </PageHeader>

        <section class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Entries shown" value={total} />
          <StatCard label="Hours (filtered)" value={hours(totals.hours)} />
          <StatCard label="Billable hours" value={hours(totals.billable_hours)} />
          <StatCard
            label="Non-billable"
            value={hours(totals.hours - totals.billable_hours)}
          />
        </section>

        <form method="get" action="/time" class="card p-4 mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
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
            <label class="field-label" for="task">Task</label>
            <select id="task" name="task" class="field-input">
              <option value="">All</option>
              {tasks.map((t) => (
                <option value={String(t.id)} selected={filters.task === String(t.id)}>
                  {t.name}
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
          <div class="col-span-2 md:col-span-4 flex gap-2 justify-end mt-1">
            <a href="/time" class="btn-ghost">Reset</a>
            <button type="submit" class="btn-primary">Apply filters</button>
          </div>
        </form>

        {rows.length === 0 ? (
          <Empty title="No entries match" hint="Loosen the filters above." />
        ) : (
          <div class="card overflow-hidden">
            <table class="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Person</th>
                  <th>Client / Project</th>
                  <th>Task</th>
                  <th class="text-right">Hours</th>
                  <th>Billable</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr>
                    <td class="text-xs whitespace-nowrap">{date(e.spent_date)}</td>
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
                    <td class="text-xs">{e.task_name ?? "—"}</td>
                    <td class="text-right tabular-nums">{hours(e.hours)}</td>
                    <td class="text-xs">
                      {e.billable === 1 ? (
                        <span class="text-accent">Yes{e.is_billed === 1 ? " · billed" : ""}</span>
                      ) : (
                        <span class="text-slate">No</span>
                      )}
                    </td>
                    <td class="text-xs text-ink/80">{truncate(e.notes, 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              basePath="/time"
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
