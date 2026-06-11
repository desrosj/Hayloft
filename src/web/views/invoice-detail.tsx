import type { FC } from "hono/jsx";
import { Layout } from "./layout.js";
import { PageHeader, StatCard } from "./components/PageHeader.js";
import { Empty } from "./components/Empty.js";
import { date, dateTime, money, num } from "../lib/format.js";

interface InvoiceDetailProps {
  invoice: {
    id: number;
    number: string | null;
    purchase_order: string | null;
    subject: string | null;
    notes: string | null;
    state: string | null;
    currency: string | null;
    amount: number;
    due_amount: number | null;
    tax: number | null;
    tax_amount: number | null;
    tax2: number | null;
    tax2_amount: number | null;
    discount: number | null;
    discount_amount: number | null;
    issue_date: string | null;
    due_date: string | null;
    payment_term: string | null;
    sent_at: string | null;
    paid_at: string | null;
    closed_at: string | null;
    period_start: string | null;
    period_end: string | null;
    created_at: string | null;
    client_id: number | null;
    client_name: string | null;
    estimate_id: number | null;
  };
  lineItems: {
    id: number;
    kind: string | null;
    description: string | null;
    quantity: number | null;
    unit_price: number | null;
    amount: number | null;
    project_id: number | null;
    project_name: string | null;
  }[];
  payments: {
    id: number;
    paid_date: string | null;
    paid_at: string | null;
    amount: number | null;
    recorded_by: string | null;
    notes: string | null;
    payment_gateway: string | null;
    transaction_id: string | null;
  }[];
  messages: {
    id: number;
    sent_at: string | null;
    sent_by: string | null;
    sent_by_email: string | null;
    recipients: string | null;
    subject: string | null;
    body: string | null;
    event_type: string | null;
  }[];
}

export const InvoiceDetail: FC<InvoiceDetailProps> = ({
  invoice,
  lineItems,
  payments,
  messages,
}) => {
  const currency = invoice.currency ?? "USD";
  const paid = (invoice.amount ?? 0) - (invoice.due_amount ?? 0);

  return (
    <Layout title={`Invoice ${invoice.number ?? invoice.id}`} activeNav="invoices" authed>
      <div class="mx-auto max-w-7xl px-6 py-8">
        <PageHeader
          eyebrow={
            invoice.client_id ? (
              <a href={`/clients/${invoice.client_id}`} class="hover:text-accent">
                {invoice.client_name}
              </a>
            ) : (
              "Invoice"
            )
          }
          title={`Invoice ${invoice.number ?? `#${invoice.id}`}`}
          subtitle={invoice.subject ?? undefined}
        >
          <span class="text-[10px] uppercase tracking-wider px-2 py-1 rounded border bg-surface text-slate border-edge">
            {invoice.state ?? "—"}
          </span>
        </PageHeader>

        <section class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard label="Amount" value={money(invoice.amount, currency)} />
          <StatCard label="Paid" value={money(paid, currency)} />
          <StatCard label="Outstanding" value={money(invoice.due_amount, currency)} />
          <StatCard label="Line items" value={lineItems.length} />
        </section>

        <section class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div class="card p-5">
            <div class="label-eyebrow mb-3">Invoice info</div>
            <dl class="text-sm space-y-1.5">
              <Row label="Number" value={invoice.number ?? `#${invoice.id}`} />
              <Row label="Purchase order" value={invoice.purchase_order ?? "—"} />
              <Row label="Issued" value={date(invoice.issue_date)} />
              <Row label="Due" value={date(invoice.due_date)} />
              <Row label="Period" value={invoice.period_start || invoice.period_end ? `${date(invoice.period_start)} → ${date(invoice.period_end)}` : "—"} />
              <Row label="Payment term" value={invoice.payment_term ?? "—"} />
              <Row label="Sent" value={dateTime(invoice.sent_at)} />
              <Row label="Paid" value={dateTime(invoice.paid_at)} />
              <Row label="Closed" value={dateTime(invoice.closed_at)} />
            </dl>
          </div>
          <div class="card p-5">
            <div class="label-eyebrow mb-3">Totals</div>
            <dl class="text-sm space-y-1.5">
              <Row label="Subtotal" value={money(invoice.amount, currency)} />
              {invoice.discount ? <Row label={`Discount (${invoice.discount}%)`} value={money(invoice.discount_amount, currency)} /> : null}
              {invoice.tax ? <Row label={`Tax (${invoice.tax}%)`} value={money(invoice.tax_amount, currency)} /> : null}
              {invoice.tax2 ? <Row label={`Tax 2 (${invoice.tax2}%)`} value={money(invoice.tax2_amount, currency)} /> : null}
              <Row label="Paid" value={money(paid, currency)} />
              <Row label="Outstanding" value={money(invoice.due_amount, currency)} />
            </dl>
          </div>
          <div class="card p-5">
            <div class="label-eyebrow mb-3">Notes</div>
            {invoice.notes ? (
              <p class="text-sm whitespace-pre-wrap text-ink/90">{invoice.notes}</p>
            ) : (
              <p class="text-sm text-slate italic">No notes.</p>
            )}
          </div>
        </section>

        <section class="mb-8">
          <h2 class="font-display font-semibold text-lg mb-3">Line items</h2>
          {lineItems.length === 0 ? (
            <Empty title="No line items" />
          ) : (
            <div class="card overflow-hidden">
              <table class="table-base">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Kind</th>
                    <th>Description</th>
                    <th class="text-right">Qty</th>
                    <th class="text-right">Unit price</th>
                    <th class="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li) => (
                    <tr>
                      <td class="text-xs">
                        {li.project_id ? (
                          <a href={`/projects/${li.project_id}`}>{li.project_name ?? "—"}</a>
                        ) : (
                          li.project_name ?? "—"
                        )}
                      </td>
                      <td class="text-xs">{li.kind ?? "—"}</td>
                      <td class="text-xs">{li.description ?? "—"}</td>
                      <td class="text-right tabular-nums">{num(li.quantity)}</td>
                      <td class="text-right tabular-nums">{money(li.unit_price, currency)}</td>
                      <td class="text-right tabular-nums">{money(li.amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {payments.length > 0 && (
          <section class="mb-8">
            <h2 class="font-display font-semibold text-lg mb-3">Payments</h2>
            <div class="card overflow-hidden">
              <table class="table-base">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Recorded by</th>
                    <th>Gateway</th>
                    <th>Transaction</th>
                    <th class="text-right">Amount</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr>
                      <td class="text-xs whitespace-nowrap">{date(p.paid_date ?? p.paid_at)}</td>
                      <td class="text-xs">{p.recorded_by ?? "—"}</td>
                      <td class="text-xs">{p.payment_gateway ?? "—"}</td>
                      <td class="text-xs">{p.transaction_id ?? "—"}</td>
                      <td class="text-right tabular-nums">{money(p.amount, currency)}</td>
                      <td class="text-xs">{p.notes ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {messages.length > 0 && (
          <section class="mb-8">
            <h2 class="font-display font-semibold text-lg mb-3">Messages</h2>
            <div class="space-y-3">
              {messages.map((m) => (
                <details class="card p-4">
                  <summary class="cursor-pointer flex justify-between gap-4 flex-wrap">
                    <span class="text-sm">
                      <span class="font-medium">{m.event_type ?? "Message"}</span>
                      {m.subject && <span class="text-slate"> · {m.subject}</span>}
                    </span>
                    <span class="text-xs text-slate">{dateTime(m.sent_at)}</span>
                  </summary>
                  <div class="mt-3 text-xs text-slate">
                    <div>From: {m.sent_by ?? "—"} {m.sent_by_email ? `<${m.sent_by_email}>` : ""}</div>
                    <div>To: {m.recipients ?? "—"}</div>
                  </div>
                  {m.body && (
                    <pre class="mt-3 text-sm whitespace-pre-wrap font-body text-ink/90">{m.body}</pre>
                  )}
                </details>
              ))}
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
    <dd class="text-ink tabular-nums text-right">{value}</dd>
  </div>
);
