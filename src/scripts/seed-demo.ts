/**
 * Seed a small deterministic fake dataset so the UI can be explored (and
 * screenshotted) without a Harvest account. Idempotent: rows upsert by id.
 *
 *   npm run seed-demo
 */
import { getPool, named, closePool } from "../lib/db.js";
import { rebuildSearchIndex } from "../fetcher/search.js";

// Deterministic PRNG so re-runs produce identical data.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260611);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;

const pool = getPool();

async function upsert(table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  const placeholders = cols.map((c) => `@${c}`).join(", ");
  const updates = cols
    .filter((c) => c !== "id")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");
  const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})
               ON CONFLICT (id) DO UPDATE SET ${updates}`;
  const { text, values } = named(sql, row);
  await pool.query(text, values);
}

const iso = (d: Date) => d.toISOString();
const day = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

console.log("Seeding demo data…");

await upsert("company", {
  id: 1,
  name: "Acme Digital",
  base_uri: "https://acmedigital.harvestapp.com",
  full_domain: "acmedigital.harvestapp.com",
  is_active: true,
  week_start_day: "Monday",
  time_format: "decimal",
  plan_type: "standard",
  weekly_capacity: 144000,
  invoice_feature: true,
  estimate_feature: true,
  expense_feature: true,
  raw_json: "{}",
});

const users = [
  { id: 101, first_name: "Maya", last_name: "Okafor", email: "maya@acmedigital.example" },
  { id: 102, first_name: "Tom", last_name: "Reyes", email: "tom@acmedigital.example" },
  { id: 103, first_name: "Priya", last_name: "Nair", email: "priya@acmedigital.example" },
  { id: 104, first_name: "Sam", last_name: "Whitfield", email: "sam@acmedigital.example" },
  { id: 105, first_name: "Lena", last_name: "Kowalski", email: "lena@acmedigital.example" },
  { id: 106, first_name: "Dev", last_name: "Aronson", email: "dev@acmedigital.example" },
];
for (const u of users) {
  await upsert("users", {
    ...u,
    is_active: u.id !== 106,
    is_contractor: u.id === 105,
    weekly_capacity: 144000,
    default_hourly_rate: 150,
    timezone: "Eastern Time (US & Canada)",
    created_at: iso(daysAgo(900)),
    updated_at: iso(daysAgo(10)),
    raw_json: "{}",
  });
}

const clients = [
  { id: 201, name: "Bluebird Coffee Roasters", currency: "USD" },
  { id: 202, name: "Northwind Outfitters", currency: "USD" },
  { id: 203, name: "Caldera Health", currency: "USD" },
  { id: 204, name: "Pine & Post Realty", currency: "USD" },
];
for (const c of clients) {
  await upsert("clients", {
    ...c,
    is_active: c.id !== 204,
    created_at: iso(daysAgo(800)),
    updated_at: iso(daysAgo(30)),
    raw_json: "{}",
  });
}

const projects = [
  { id: 301, client_id: 201, name: "E-commerce Replatform", code: "BLUE-01", budget: 80000 },
  { id: 302, client_id: 201, name: "Holiday Campaign Site", code: "BLUE-02", budget: 18000 },
  { id: 303, client_id: 202, name: "Catalog & Inventory Portal", code: "NW-01", budget: 120000 },
  { id: 304, client_id: 202, name: "Mobile App Discovery", code: "NW-02", budget: 25000 },
  { id: 305, client_id: 203, name: "Patient Portal Redesign", code: "CAL-01", budget: 95000 },
  { id: 306, client_id: 203, name: "HIPAA Compliance Audit", code: "CAL-02", budget: 30000 },
  { id: 307, client_id: 204, name: "Listing Site MVP", code: "PINE-01", budget: 45000 },
  { id: 308, client_id: 204, name: "Ongoing Maintenance", code: "PINE-02", budget: 12000 },
];
for (const p of projects) {
  await upsert("projects", {
    ...p,
    is_active: ![302, 307].includes(p.id),
    is_billable: true,
    bill_by: "Project",
    budget_by: "project",
    hourly_rate: 150,
    starts_on: day(daysAgo(700)),
    created_at: iso(daysAgo(700)),
    updated_at: iso(daysAgo(5)),
    raw_json: "{}",
  });
}

const tasks = [
  { id: 401, name: "Development" },
  { id: 402, name: "Design" },
  { id: 403, name: "Project Management" },
  { id: 404, name: "QA & Testing" },
  { id: 405, name: "Discovery & Strategy" },
  { id: 406, name: "Meetings" },
];
for (const t of tasks) {
  await upsert("tasks", {
    ...t,
    billable_by_default: t.id !== 406,
    is_active: true,
    is_default: false,
    created_at: iso(daysAgo(900)),
    updated_at: iso(daysAgo(900)),
    raw_json: "{}",
  });
}

const NOTES = [
  "Sprint planning and backlog grooming",
  "Implemented checkout flow edge cases",
  "Design review with client stakeholders",
  "Wrote integration tests for cart service",
  "Refactored product import pipeline",
  "Weekly status call",
  "Accessibility audit fixes",
  "Homepage hero iterations",
  "Deployment and release notes",
  "Bug triage and hotfixes",
  "Content model workshop",
  "Performance profiling on listing pages",
];

let entryId = 50_000;
let totalEntries = 0;
for (let d = 540; d >= 1; d--) {
  const date = daysAgo(d);
  const dow = date.getUTCDay();
  if (dow === 0 || dow === 6) continue; // weekends off
  for (const u of users) {
    if (u.id === 106 && d < 200) continue; // Dev left the team
    const entriesToday = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < entriesToday; i++) {
      const project = pick(projects);
      const task = pick(tasks);
      const hours = Math.round((0.5 + rand() * 3.5) * 4) / 4;
      await upsert("time_entries", {
        id: entryId++,
        spent_date: day(date),
        user_id: u.id,
        client_id: project.client_id,
        project_id: project.id,
        task_id: task.id,
        hours,
        rounded_hours: hours,
        notes: pick(NOTES),
        billable: task.id !== 406,
        is_billed: d > 60,
        is_locked: d > 60,
        is_closed: d > 60,
        is_running: false,
        billable_rate: task.id !== 406 ? 150 : null,
        created_at: iso(date),
        updated_at: iso(date),
        raw_json: "{}",
      });
      totalEntries++;
    }
  }
}

let invoiceId = 60_000;
let lineId = 70_000;
for (let month = 17; month >= 0; month--) {
  for (const c of clients) {
    if (rand() < 0.25) continue;
    const issue = daysAgo(month * 30 + 15);
    const amount = Math.round((4000 + rand() * 21000) / 100) * 100;
    const paid = month > 1 || rand() < 0.5;
    const id = invoiceId++;
    await upsert("invoices", {
      id,
      client_id: c.id,
      number: `${2025 - Math.floor(month / 12)}-${String(id).slice(-4)}`,
      subject: `${c.name} — professional services`,
      amount,
      due_amount: paid ? 0 : amount,
      currency: "USD",
      state: paid ? "paid" : "open",
      issue_date: day(issue),
      due_date: day(new Date(issue.getTime() + 30 * 86_400_000)),
      paid_at: paid ? iso(new Date(issue.getTime() + 20 * 86_400_000)) : null,
      paid_date: paid ? day(new Date(issue.getTime() + 20 * 86_400_000)) : null,
      period_start: day(new Date(issue.getTime() - 30 * 86_400_000)),
      period_end: day(issue),
      created_at: iso(issue),
      updated_at: iso(issue),
      raw_json: "{}",
    });
    const clientProjects = projects.filter((p) => p.client_id === c.id);
    for (const p of clientProjects) {
      await upsert("invoice_line_items", {
        id: lineId++,
        invoice_id: id,
        project_id: p.id,
        kind: "Service",
        description: `${p.name}: professional services`,
        quantity: 1,
        unit_price: Math.round(amount / clientProjects.length),
        amount: Math.round(amount / clientProjects.length),
        taxed: false,
        taxed2: false,
        raw_json: "{}",
      });
    }
  }
}

console.log(`✓ ${users.length} people, ${clients.length} clients, ${projects.length} projects, ${totalEntries} time entries, ${invoiceId - 60_000} invoices`);

console.log("Rebuilding search index…");
await rebuildSearchIndex();

await closePool();
console.log("✓ Demo data ready — npm run dev and log in to explore.");
process.exit(0);
