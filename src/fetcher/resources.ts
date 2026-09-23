import type pg from "pg";
import type { ResourceDef } from "./types.js";
import { upsertBatch } from "./upsert.js";

async function upsertChildren(
  executor: pg.PoolClient | pg.Pool,
  table: string,
  parentField: string,
  parentId: number,
  items: Record<string, unknown>[],
) {
  const rows = items.map((i) => ({ ...i, [parentField]: parentId }));
  const def: ResourceDef = {
    name: `__nested_${table}`,
    label: table,
    path: "",
    envelopeKey: "",
    table,
  };
  // Use the same client/pool we were given so this stays inside any open tx.
  await upsertBatch(def, rows, "release" in executor ? (executor as pg.PoolClient) : undefined);
}

export const RESOURCES: ResourceDef[] = [
  {
    name: "company",
    label: "Company",
    path: "/company",
    envelopeKey: "",
    table: "company",
  },
  {
    name: "roles",
    label: "Roles",
    path: "/roles",
    envelopeKey: "roles",
    table: "roles",
    supportsUpdatedSince: true,
  },
  {
    name: "users",
    label: "Users",
    path: "/users",
    envelopeKey: "users",
    table: "users",
    supportsUpdatedSince: true,
  },
  {
    name: "user_teammates",
    label: "User teammates",
    path: "/users",
    envelopeKey: "users",
    table: "user_teammates",
    dependsOn: ["users"],
  },
  {
    name: "clients",
    label: "Clients",
    path: "/clients",
    envelopeKey: "clients",
    table: "clients",
    supportsUpdatedSince: true,
  },
  {
    name: "client_contacts",
    label: "Client contacts",
    path: "/contacts",
    envelopeKey: "contacts",
    table: "client_contacts",
    dependsOn: ["clients"],
    supportsUpdatedSince: true,
  },
  {
    name: "projects",
    label: "Projects",
    path: "/projects",
    envelopeKey: "projects",
    table: "projects",
    dependsOn: ["clients"],
    supportsUpdatedSince: true,
  },
  {
    name: "tasks",
    label: "Tasks",
    path: "/tasks",
    envelopeKey: "tasks",
    table: "tasks",
    supportsUpdatedSince: true,
  },
  {
    name: "task_assignments",
    label: "Task assignments",
    path: "/task_assignments",
    envelopeKey: "task_assignments",
    table: "task_assignments",
    dependsOn: ["projects", "tasks"],
    supportsUpdatedSince: true,
  },
  {
    name: "user_assignments",
    label: "User assignments",
    path: "/user_assignments",
    envelopeKey: "user_assignments",
    table: "user_assignments",
    dependsOn: ["projects", "users"],
    supportsUpdatedSince: true,
  },
  {
    name: "invoice_item_categories",
    label: "Invoice item categories",
    path: "/invoice_item_categories",
    envelopeKey: "invoice_item_categories",
    table: "invoice_item_categories",
    supportsUpdatedSince: true,
  },
  {
    name: "invoices",
    label: "Invoices",
    path: "/invoices",
    envelopeKey: "invoices",
    table: "invoices",
    dependsOn: ["clients"],
    supportsUpdatedSince: true,
    afterUpsert: async (executor, item) => {
      const id = item.id as number;
      if (Array.isArray(item.line_items)) {
        await upsertChildren(
          executor,
          "invoice_line_items",
          "invoice_id",
          id,
          item.line_items as Record<string, unknown>[],
        );
      }
    },
  },
  {
    name: "invoice_payments",
    label: "Invoice payments",
    path: "/invoices/{invoice_id}/payments",
    envelopeKey: "invoice_payments",
    table: "invoice_payments",
    dependsOn: ["invoices"],
  },
  {
    name: "invoice_messages",
    label: "Invoice messages",
    path: "/invoices/{invoice_id}/messages",
    envelopeKey: "invoice_messages",
    table: "invoice_messages",
    dependsOn: ["invoices"],
  },
  {
    name: "estimate_item_categories",
    label: "Estimate item categories",
    path: "/estimate_item_categories",
    envelopeKey: "estimate_item_categories",
    table: "estimate_item_categories",
    supportsUpdatedSince: true,
  },
  {
    name: "estimates",
    label: "Estimates",
    path: "/estimates",
    envelopeKey: "estimates",
    table: "estimates",
    dependsOn: ["clients"],
    supportsUpdatedSince: true,
    afterUpsert: async (executor, item) => {
      const id = item.id as number;
      if (Array.isArray(item.line_items)) {
        await upsertChildren(
          executor,
          "estimate_line_items",
          "estimate_id",
          id,
          item.line_items as Record<string, unknown>[],
        );
      }
    },
  },
  {
    name: "estimate_messages",
    label: "Estimate messages",
    path: "/estimates/{estimate_id}/messages",
    envelopeKey: "estimate_messages",
    table: "estimate_messages",
    dependsOn: ["estimates"],
  },
  {
    name: "time_entries",
    label: "Time entries",
    path: "/time_entries",
    envelopeKey: "time_entries",
    table: "time_entries",
    dependsOn: ["projects", "tasks", "users"],
    supportsUpdatedSince: true,
  },
  {
    name: "expense_categories",
    label: "Expense categories",
    path: "/expense_categories",
    envelopeKey: "expense_categories",
    table: "expense_categories",
    supportsUpdatedSince: true,
  },
  {
    name: "expenses",
    label: "Expenses",
    path: "/expenses",
    envelopeKey: "expenses",
    table: "expenses",
    dependsOn: ["projects", "users", "expense_categories"],
    supportsUpdatedSince: true,
    // `receipt` is an object without an id, so keep it as JSONB and also
    // lift its fields into parsed columns for querying.
    jsonFields: ["receipt"],
    transform: (item) => {
      const receipt = (item.receipt ?? null) as {
        url?: string | null;
        file_name?: string | null;
        file_size?: number | null;
        content_type?: string | null;
      } | null;
      return {
        ...item,
        receipt_url: receipt?.url ?? null,
        receipt_file_name: receipt?.file_name ?? null,
        receipt_file_size: receipt?.file_size ?? null,
        receipt_content_type: receipt?.content_type ?? null,
      };
    },
  },
  {
    // Not a Harvest list endpoint: downloads each expense's receipt file
    // (see runExpenseReceipts in runner.ts) into expense_receipts.
    name: "expense_receipts",
    label: "Expense receipts (files)",
    path: "{expense.receipt.url}",
    envelopeKey: "",
    table: "expense_receipts",
    dependsOn: ["expenses"],
  },
];

export const RESOURCES_BY_NAME = new Map(RESOURCES.map((r) => [r.name, r]));

export function fetchOrder(): ResourceDef[] {
  const visited = new Set<string>();
  const out: ResourceDef[] = [];
  function visit(r: ResourceDef) {
    if (visited.has(r.name)) return;
    visited.add(r.name);
    for (const dep of r.dependsOn ?? []) {
      const d = RESOURCES_BY_NAME.get(dep);
      if (d) visit(d);
    }
    out.push(r);
  }
  for (const r of RESOURCES) visit(r);
  return out;
}
