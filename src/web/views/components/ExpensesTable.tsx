import type { FC } from "hono/jsx";
import { Empty } from "./Empty.js";
import { date, fullName, money, truncate } from "../../lib/format.js";
import type { ExpenseSummary } from "../../lib/expenses.js";

interface Props {
  summary: ExpenseSummary;
  /** link for the "View all →" affordance, e.g. /expenses?project=123&period=all */
  viewAllHref?: string;
  /** hide when this table lives on a person's page, etc. */
  showPerson?: boolean;
  showProject?: boolean;
  currency?: string | null;
  title?: string;
  emptyTitle?: string;
}

/**
 * Compact "recent expenses" block used on project, person, client and invoice
 * detail pages. Renders nothing at all when the entity has no expenses, so
 * accounts without the expense feature never see an empty section.
 */
export const ExpensesSection: FC<Props> = ({
  summary,
  viewAllHref,
  showPerson = true,
  showProject = true,
  currency,
  title = "Expenses",
  emptyTitle = "No expenses",
}) => {
  if (summary.count === 0) return null;
  const shownAll = summary.rows.length >= summary.count;
  return (
    <section class="mb-8">
      <div class="flex items-baseline justify-between mb-3 gap-4 flex-wrap">
        <h2 class="font-display font-semibold text-lg">
          {title}
          <span class="text-xs text-slate font-normal font-body ml-2">
            {money(summary.amount, currency ?? summary.rows[0]?.currency ?? "USD")} across {summary.count}{" "}
            {summary.count === 1 ? "expense" : "expenses"}
          </span>
        </h2>
        {viewAllHref && (
          <a class="text-xs" href={viewAllHref}>
            {shownAll ? "Browse →" : `View all ${summary.count} →`}
          </a>
        )}
      </div>
      {summary.rows.length === 0 ? (
        <Empty title={emptyTitle} />
      ) : (
        <div class="card overflow-hidden">
          <table class="table-base">
            <thead>
              <tr>
                <th>Date</th>
                {showPerson && <th>Person</th>}
                {showProject && <th>Project</th>}
                <th>Category</th>
                <th class="text-right">Cost</th>
                <th>Billable</th>
                <th>Receipt</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((e) => (
                <tr class="hover:bg-surface/40">
                  <td class="text-xs whitespace-nowrap">
                    <a href={`/expenses/${e.id}`} class="font-medium text-ink hover:text-accent">
                      {date(e.spent_date)}
                    </a>
                  </td>
                  {showPerson && (
                    <td class="text-xs whitespace-nowrap">
                      {e.user_id ? (
                        <a href={`/people/${e.user_id}`}>{fullName(e.user_first, e.user_last)}</a>
                      ) : (
                        fullName(e.user_first, e.user_last)
                      )}
                    </td>
                  )}
                  {showProject && (
                    <td class="text-xs">
                      {e.project_id ? (
                        <a href={`/projects/${e.project_id}`}>{e.project_name ?? "—"}</a>
                      ) : (
                        e.project_name ?? "—"
                      )}
                    </td>
                  )}
                  <td class="text-xs">{e.category_name ?? "—"}</td>
                  <td class="text-right tabular-nums">{money(e.total_cost, e.currency ?? currency)}</td>
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
                      <span class="text-slate" title="Not downloaded yet">📎 pending</span>
                    ) : (
                      <span class="text-slate">—</span>
                    )}
                  </td>
                  <td class="text-xs text-ink/80">{truncate(e.notes, 90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
