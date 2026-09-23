import { q, qOne } from "../../lib/db.js";

export interface ExpenseSummaryRow {
  id: number;
  spent_date: string;
  user_id: number | null;
  user_first: string | null;
  user_last: string | null;
  project_id: number | null;
  project_name: string | null;
  category_name: string | null;
  total_cost: number | null;
  currency: string | null;
  billable: boolean | null;
  is_billed: boolean | null;
  notes: string | null;
  has_receipt: boolean;
  receipt_stored: boolean;
}

export interface ExpenseSummary {
  count: number;
  amount: number;
  rows: ExpenseSummaryRow[];
}

type ExpenseScope = "project_id" | "user_id" | "client_id" | "invoice_id";

/**
 * Expenses attached to one project / person / client / invoice, plus totals.
 * Shared by the detail pages so each shows the same "recent expenses" block.
 */
export async function expensesFor(
  scope: ExpenseScope,
  id: number,
  limit = 20,
): Promise<ExpenseSummary> {
  const [agg, rows] = await Promise.all([
    qOne<{ count: number; amount: number }>(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total_cost), 0)::float AS amount
       FROM expenses WHERE ${scope} = @id`,
      { id },
    ).catch(() => undefined),
    q<ExpenseSummaryRow>(
      `
      SELECT e.id, e.spent_date,
             e.user_id, u.first_name AS user_first, u.last_name AS user_last,
             e.project_id, p.name AS project_name,
             ec.name AS category_name,
             e.total_cost, c.currency, e.billable, e.is_billed, e.notes,
             (e.receipt_url IS NOT NULL) AS has_receipt,
             (r.data IS NOT NULL OR r.file_path IS NOT NULL) AS receipt_stored
      FROM expenses e
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN projects p ON p.id = e.project_id
      LEFT JOIN clients c ON c.id = e.client_id
      LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
      LEFT JOIN expense_receipts r ON r.expense_id = e.id
      WHERE e.${scope} = @id
      ORDER BY e.spent_date DESC, e.id DESC
      LIMIT @limit
      `,
      { id, limit },
    ).catch(() => []),
  ]);
  return {
    count: Number(agg?.count ?? 0),
    amount: Number(agg?.amount ?? 0),
    rows,
  };
}
