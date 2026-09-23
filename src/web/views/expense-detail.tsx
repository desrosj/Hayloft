import type { FC } from "hono/jsx";
import { Layout } from "./layout.js";
import { PageHeader, StatCard } from "./components/PageHeader.js";
import { bytes, date, dateTime, fullName, money, num, yesNo } from "../lib/format.js";

export interface ExpenseDetailRecord {
  id: number;
  spent_date: string | null;
  notes: string | null;
  units: number | null;
  total_cost: number | null;
  billable: boolean | null;
  is_billed: boolean | null;
  is_closed: boolean | null;
  is_locked: boolean | null;
  locked_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  user_id: number | null;
  user_first: string | null;
  user_last: string | null;
  user_assignment_id: number | null;
  client_id: number | null;
  client_name: string | null;
  currency: string | null;
  project_id: number | null;
  project_name: string | null;
  project_code: string | null;
  category_id: number | null;
  category_name: string | null;
  category_unit_name: string | null;
  category_unit_price: number | null;
  invoice_id: number | null;
  invoice_number: string | null;
  receipt_url: string | null;
  receipt_file_name: string | null;
  receipt_file_size: number | null;
  receipt_content_type: string | null;
  raw_json: unknown;
}

export interface StoredReceipt {
  file_name: string | null;
  content_type: string | null;
  file_size: number | null;
  fetched_at: string | null;
  fetch_error: string | null;
  /** relative path under RECEIPTS_DIR when the file lives on disk */
  file_path: string | null;
  /** archived somewhere (Postgres bytes or a file on disk) */
  stored: boolean;
}

interface ExpenseDetailProps {
  expense: ExpenseDetailRecord;
  receipt: StoredReceipt | null;
  newerId: number | null;
  olderId: number | null;
}

const isImage = (ct: string | null) => !!ct && /^image\/(png|jpe?g|gif|webp)$/i.test(ct);
const isPdf = (ct: string | null) => !!ct && /^application\/pdf$/i.test(ct);

export const ExpenseDetail: FC<ExpenseDetailProps> = ({ expense, receipt, newerId, olderId }) => {
  const currency = expense.currency ?? "USD";
  const person = fullName(expense.user_first, expense.user_last);
  const title = `${expense.category_name ?? "Expense"} · ${money(expense.total_cost, currency)}`;
  const receiptHref = `/expenses/${expense.id}/receipt`;
  const stored = receipt?.stored ?? false;
  const storedType = receipt?.content_type ?? expense.receipt_content_type;

  let rawPretty = "";
  try {
    rawPretty = JSON.stringify(expense.raw_json ?? {}, null, 2);
  } catch {
    rawPretty = String(expense.raw_json ?? "");
  }

  return (
    <Layout title={title} activeNav="expenses" authed>
      <div class="mx-auto max-w-7xl px-6 py-8">
        <PageHeader
          eyebrow={
            <span>
              <a href="/expenses" class="hover:text-accent">Expenses</a>
              {expense.client_id && (
                <span>
                  {" · "}
                  <a href={`/clients/${expense.client_id}`} class="hover:text-accent">
                    {expense.client_name}
                  </a>
                </span>
              )}
            </span>
          }
          title={title}
          subtitle={`${date(expense.spent_date)} · ${person}${expense.project_name ? ` · ${expense.project_name}` : ""}`}
        >
          {expense.billable ? (
            <span class="text-[10px] uppercase tracking-wider px-2 py-1 rounded border bg-accent/10 text-accent border-accent/30">
              Billable
            </span>
          ) : (
            <span class="text-[10px] uppercase tracking-wider px-2 py-1 rounded border bg-surface text-slate border-edge">
              Non-billable
            </span>
          )}
          {expense.is_billed && (
            <span class="text-[10px] uppercase tracking-wider px-2 py-1 rounded border bg-green-50 text-green-700 border-green-200">
              Billed
            </span>
          )}
          {expense.is_locked && (
            <span class="text-[10px] uppercase tracking-wider px-2 py-1 rounded border bg-ink/5 text-ink border-edge" title={expense.locked_reason ?? ""}>
              Locked
            </span>
          )}
          <nav class="inline-flex items-center rounded border border-edge overflow-hidden bg-white ml-2">
            {newerId ? (
              <a href={`/expenses/${newerId}`} class="text-[11px] uppercase tracking-wider font-medium px-3 py-1.5 text-slate hover:bg-surface border-r border-edge hover:no-underline" title="Newer expense">
                ‹ Newer
              </a>
            ) : (
              <span class="text-[11px] uppercase tracking-wider font-medium px-3 py-1.5 text-slate/40 border-r border-edge">‹ Newer</span>
            )}
            {olderId ? (
              <a href={`/expenses/${olderId}`} class="text-[11px] uppercase tracking-wider font-medium px-3 py-1.5 text-slate hover:bg-surface hover:no-underline" title="Older expense">
                Older ›
              </a>
            ) : (
              <span class="text-[11px] uppercase tracking-wider font-medium px-3 py-1.5 text-slate/40">Older ›</span>
            )}
          </nav>
        </PageHeader>

        <section class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard label="Total cost" value={money(expense.total_cost, currency)} hint={currency} />
          <StatCard
            label="Units"
            value={expense.units !== null && expense.units !== undefined ? num(expense.units) : "—"}
            hint={
              expense.category_unit_name
                ? `${expense.category_unit_name}${expense.category_unit_price ? ` @ ${money(expense.category_unit_price, currency)}` : ""}`
                : undefined
            }
          />
          <StatCard label="Date" value={date(expense.spent_date)} />
          <StatCard
            label="Receipt"
            value={stored ? "Archived" : expense.receipt_url ? "Pending" : "None"}
            hint={receipt?.file_size ?? expense.receipt_file_size ? bytes(receipt?.file_size ?? expense.receipt_file_size) : undefined}
          />
        </section>

        <section class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div class="card p-5">
            <div class="label-eyebrow mb-3">Expense info</div>
            <dl class="text-sm space-y-1.5">
              <Row label="Date" value={date(expense.spent_date)} />
              <Row label="Person" value={person} href={expense.user_id ? `/people/${expense.user_id}` : undefined} />
              <Row label="Client" value={expense.client_name ?? "—"} href={expense.client_id ? `/clients/${expense.client_id}` : undefined} />
              <Row
                label="Project"
                value={expense.project_name ? `${expense.project_name}${expense.project_code ? ` (${expense.project_code})` : ""}` : "—"}
                href={expense.project_id ? `/projects/${expense.project_id}` : undefined}
              />
              <Row label="Category" value={expense.category_name ?? "—"} href={expense.category_id ? `/expenses?category=${expense.category_id}&period=all` : undefined} />
              <Row label="Units" value={expense.units !== null && expense.units !== undefined ? `${num(expense.units)}${expense.category_unit_name ? ` ${expense.category_unit_name}` : ""}` : "—"} />
              <Row label="Unit price" value={expense.category_unit_price ? money(expense.category_unit_price, currency) : "—"} />
              <Row label="Total cost" value={money(expense.total_cost, currency)} />
            </dl>
          </div>
          <div class="card p-5">
            <div class="label-eyebrow mb-3">Billing & status</div>
            <dl class="text-sm space-y-1.5">
              <Row label="Billable" value={yesNo(expense.billable)} />
              <Row label="Billed" value={yesNo(expense.is_billed)} />
              <Row
                label="Invoice"
                value={expense.invoice_id ? (expense.invoice_number ?? `#${expense.invoice_id}`) : "—"}
                href={expense.invoice_id ? `/invoices/${expense.invoice_id}` : undefined}
              />
              <Row label="Locked" value={expense.is_locked ? `Yes${expense.locked_reason ? ` — ${expense.locked_reason}` : ""}` : "No"} />
              <Row label="Closed" value={yesNo(expense.is_closed)} />
              <Row label="Created" value={dateTime(expense.created_at)} />
              <Row label="Updated" value={dateTime(expense.updated_at)} />
              <Row label="Harvest ID" value={String(expense.id)} />
              <Row label="User assignment" value={expense.user_assignment_id ? String(expense.user_assignment_id) : "—"} />
            </dl>
          </div>
          <div class="card p-5">
            <div class="label-eyebrow mb-3">Notes</div>
            {expense.notes ? (
              <p class="text-sm whitespace-pre-wrap text-ink/90">{expense.notes}</p>
            ) : (
              <p class="text-sm text-slate italic">No notes.</p>
            )}
          </div>
        </section>

        <section class="mb-8">
          <div class="flex items-baseline justify-between mb-3">
            <h2 class="font-display font-semibold text-lg">Receipt</h2>
            {stored && (
              <div class="flex items-center gap-3 text-xs">
                <a href={receiptHref} target="_blank" rel="noopener">Open</a>
                <a href={`${receiptHref}?download=1`}>Download</a>
              </div>
            )}
          </div>
          <div class="card p-5">
            {stored ? (
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2">
                  {isImage(storedType) ? (
                    <a href={receiptHref} target="_blank" rel="noopener" class="block">
                      <img
                        src={receiptHref}
                        alt={receipt?.file_name ?? "Receipt"}
                        class="max-h-[720px] w-auto max-w-full rounded border border-edge bg-surface"
                      />
                    </a>
                  ) : isPdf(storedType) ? (
                    <iframe
                      src={receiptHref}
                      title={receipt?.file_name ?? "Receipt"}
                      class="w-full h-[720px] rounded border border-edge bg-surface"
                    ></iframe>
                  ) : (
                    <div class="rounded border border-dashed border-edge p-8 text-center text-sm text-slate">
                      No inline preview for this file type.{" "}
                      <a href={`${receiptHref}?download=1`}>Download {receipt?.file_name ?? "the file"}</a>.
                    </div>
                  )}
                </div>
                <dl class="text-sm space-y-1.5">
                  <Row label="File" value={receipt?.file_name ?? expense.receipt_file_name ?? "—"} />
                  <Row label="Type" value={storedType ?? "—"} />
                  <Row label="Size" value={bytes(receipt?.file_size ?? expense.receipt_file_size)} />
                  <Row label="Archived" value={dateTime(receipt?.fetched_at)} />
                  <Row label="Stored" value={receipt?.file_path ? `On disk · ${receipt.file_path}` : "In Postgres"} />
                  {expense.receipt_url && (
                    <div class="pt-2">
                      <a href={expense.receipt_url} target="_blank" rel="noopener" class="text-xs">
                        Original in Harvest ↗
                      </a>
                    </div>
                  )}
                </dl>
              </div>
            ) : expense.receipt_url ? (
              <div class="text-sm">
                <p class="text-ink/90">
                  Harvest has a receipt for this expense
                  {expense.receipt_file_name ? <span> (<span class="font-medium">{expense.receipt_file_name}</span>, {bytes(expense.receipt_file_size)})</span> : null}
                  , but the file has not been archived yet.
                </p>
                {receipt?.fetch_error && (
                  <p class="mt-2 text-xs text-red-700">
                    Last download attempt failed: {receipt.fetch_error}
                  </p>
                )}
                <p class="mt-3 text-xs text-slate">
                  Run <code class="bg-surface px-1 rounded">npm run fetch -- --resource expense_receipts</code> to download it.
                  {" "}
                  <a href={expense.receipt_url} target="_blank" rel="noopener">Original in Harvest ↗</a>
                </p>
              </div>
            ) : (
              <p class="text-sm text-slate italic">No receipt attached to this expense.</p>
            )}
          </div>
        </section>

        <section class="mb-8">
          <details class="card p-4">
            <summary class="cursor-pointer text-sm font-medium text-ink">
              Raw Harvest record
              <span class="text-xs text-slate font-normal ml-2">every field Harvest returned for this expense</span>
            </summary>
            <pre class="mt-3 text-xs whitespace-pre-wrap break-all bg-surface rounded p-3 text-ink/90">{rawPretty}</pre>
          </details>
        </section>
      </div>
    </Layout>
  );
};

const Row: FC<{ label: string; value: string; href?: string }> = ({ label, value, href }) => (
  <div class="flex justify-between gap-4 text-sm">
    <dt class="text-slate">{label}</dt>
    <dd class="text-ink tabular-nums text-right">
      {href ? <a href={href}>{value}</a> : value}
    </dd>
  </div>
);
