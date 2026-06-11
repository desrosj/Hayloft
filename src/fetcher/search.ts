import { exec, q, qScalar, getPool } from "../lib/db.js";
import { logger } from "../lib/logger.js";

/**
 * Rebuilds the unified search index. Postgres' tsvector + GIN handles ranked
 * full-text search across every textual resource.
 */
export async function rebuildSearchIndex() {
  logger.info("rebuilding search index");
  await exec("DELETE FROM search_index");

  const pool = getPool();
  const insert = async (
    kind: string,
    ref_id: number | string,
    title: string,
    subtitle: string,
    body: string,
  ) => {
    await pool.query(
      "INSERT INTO search_index (kind, ref_id, title, subtitle, body) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (kind, ref_id) DO UPDATE SET title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, body = EXCLUDED.body",
      [kind, ref_id, title, subtitle, body],
    );
  };

  type Client = { id: number; name: string; address: string | null };
  const clients = await q<Client>("SELECT id, name, address FROM clients");
  for (const c of clients) {
    await insert("client", c.id, c.name ?? "", "Client", c.address ?? "");
  }

  type Project = {
    id: number;
    name: string;
    code: string | null;
    notes: string | null;
    client_name: string | null;
  };
  const projects = await q<Project>(
    `SELECT p.id, p.name, p.code, p.notes, c.name AS client_name
     FROM projects p LEFT JOIN clients c ON c.id = p.client_id`,
  );
  for (const p of projects) {
    await insert(
      "project",
      p.id,
      p.name ?? "",
      p.client_name ? `${p.client_name}${p.code ? ` · ${p.code}` : ""}` : (p.code ?? ""),
      p.notes ?? "",
    );
  }

  const tasks = await q<{ id: number; name: string }>("SELECT id, name FROM tasks");
  for (const t of tasks) {
    await insert("task", t.id, t.name ?? "", "Task", "");
  }

  type User = {
    id: number;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
  const users = await q<User>("SELECT id, first_name, last_name, email FROM users");
  for (const u of users) {
    await insert(
      "user",
      u.id,
      `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim(),
      u.email ?? "",
      "",
    );
  }

  type Invoice = {
    id: number;
    number: string | null;
    subject: string | null;
    notes: string | null;
    client_name: string | null;
  };
  const invoices = await q<Invoice>(
    `SELECT i.id, i.number, i.subject, i.notes, c.name AS client_name
     FROM invoices i LEFT JOIN clients c ON c.id = i.client_id`,
  );
  for (const i of invoices) {
    await insert(
      "invoice",
      i.id,
      `Invoice ${i.number ?? i.id}`,
      i.client_name ?? "",
      `${i.subject ?? ""} ${i.notes ?? ""}`.trim(),
    );
  }

  type TimeEntry = {
    id: number;
    notes: string;
    spent_date: string;
    project_name: string | null;
    first_name: string | null;
    last_name: string | null;
  };
  const entries = await q<TimeEntry>(
    `SELECT t.id, t.notes, t.spent_date, p.name AS project_name,
            u.first_name, u.last_name
     FROM time_entries t
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN users u ON u.id = t.user_id
     WHERE t.notes IS NOT NULL AND length(t.notes) > 0`,
  );
  for (const t of entries) {
    await insert(
      "time_entry",
      t.id,
      `${t.project_name ?? "—"} · ${t.spent_date}`,
      `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim(),
      t.notes,
    );
  }

  const count = await qScalar<number>("SELECT count(*)::int FROM search_index");
  logger.info({ count }, "search index rebuilt");
}
