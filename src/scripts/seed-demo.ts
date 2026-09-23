/**
 * Seed a small deterministic fake dataset so the UI can be explored (and
 * screenshotted) without a Harvest account. Idempotent: rows upsert by id.
 *
 *   npm run seed-demo
 */
import { deflateSync } from "node:zlib";
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

// ─── Expenses ────────────────────────────────────────────────────────
// A handful of categories, expenses sprinkled across the same timeline, and
// generated receipt files (PNG + PDF) so the receipt viewer can be exercised.

const expenseCategories = [
  { id: 501, name: "Travel", unit_name: null, unit_price: null },
  { id: 502, name: "Mileage", unit_name: "mile", unit_price: 0.67 },
  { id: 503, name: "Meals", unit_name: null, unit_price: null },
  { id: 504, name: "Software", unit_name: null, unit_price: null },
  { id: 505, name: "Equipment", unit_name: null, unit_price: null },
  { id: 506, name: "Lodging", unit_name: "night", unit_price: 189 },
];
for (const cat of expenseCategories) {
  await upsert("expense_categories", {
    ...cat,
    is_active: true,
    created_at: iso(daysAgo(900)),
    updated_at: iso(daysAgo(900)),
    raw_json: JSON.stringify(cat),
  });
}

const EXPENSE_NOTES: Record<number, string[]> = {
  501: ["Flight to client kickoff", "Train to on-site workshop", "Rideshare from airport", "Parking at conference"],
  502: ["Drive to client office", "Site visit round trip", "Mileage to print shop"],
  503: ["Team lunch during sprint review", "Dinner with client stakeholders", "Coffee for workshop attendees"],
  504: ["Design tool seat (monthly)", "Error-monitoring plan", "Stock photo license", "Domain renewal"],
  505: ["USB-C dock for on-site", "Replacement keyboard", "Portable monitor for demos"],
  506: ["Hotel for on-site week", "Conference hotel"],
};

// Minimal PNG encoder (no deps): RGB, filter type 0, single IDAT chunk.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function receiptPng(seed: number): Buffer {
  const w = 320;
  const h = 440;
  const hue = (seed * 47) % 360;
  const band = hslToRgb(hue, 0.55, 0.45);
  const raw = Buffer.alloc((w * 3 + 1) * h);
  const lines = 6 + (seed % 5);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (w * 3 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      let r = 250, g = 250, b = 247; // paper
      const margin = x < 24 || x >= w - 24;
      if (y < 56) { [r, g, b] = band; } // header band
      else if (!margin) {
        // "text" lines
        const lineIdx = Math.floor((y - 80) / 28);
        const inLine = y >= 80 && (y - 80) % 28 < 10 && lineIdx < lines;
        const lineLen = 120 + ((seed + lineIdx * 31) % 150);
        if (inLine && x < 24 + lineLen) { r = 70; g = 70; b = 80; }
        // amount block near the bottom
        if (y >= h - 90 && y < h - 62 && x >= w - 24 - 110) { r = 40; g = 40; b = 50; }
        // dashed tear line
        if (y === h - 40 && Math.floor(x / 8) % 2 === 0) { r = 180; g = 180; b = 180; }
      }
      const o = rowStart + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// Minimal single-page PDF with a few lines of Helvetica text.
function receiptPdf(lines: string[]): Buffer {
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  let content = "BT /F1 18 Tf 36 360 Td (RECEIPT) Tj ET\n";
  lines.forEach((line, i) => {
    content += `BT /F1 11 Tf 36 ${320 - i * 20} Td (${esc(line)}) Tj ET\n`;
  });
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const invoicesByClient = new Map<number, number[]>();
{
  const rows = await pool.query("SELECT id, client_id FROM invoices WHERE id >= 60000 ORDER BY id");
  for (const r of rows.rows as { id: number; client_id: number }[]) {
    const list = invoicesByClient.get(r.client_id) ?? [];
    list.push(r.id);
    invoicesByClient.set(r.client_id, list);
  }
}

let expenseId = 80_000;
let receiptsSeeded = 0;
for (let d = 540; d >= 1; d--) {
  // roughly one expense every ~3 days
  if (rand() > 0.34) continue;
  const spent = daysAgo(d);
  const u = pick(users);
  if (u.id === 106 && d < 200) continue;
  const project = pick(projects);
  const cat = pick(expenseCategories);
  let units: number | null = null;
  let total: number;
  if (cat.unit_price) {
    units = cat.id === 502 ? Math.round(10 + rand() * 120) : 1 + Math.floor(rand() * 4);
    total = Math.round(units * cat.unit_price * 100) / 100;
  } else {
    const base = cat.id === 501 ? 180 + rand() * 520 : cat.id === 505 ? 60 + rand() * 340 : cat.id === 504 ? 12 + rand() * 90 : 18 + rand() * 110;
    total = Math.round(base * 100) / 100;
  }
  const id = expenseId++;
  const billable = cat.id !== 504 || rand() < 0.3;
  const billed = billable && d > 60;
  const clientInvoices = invoicesByClient.get(project.client_id) ?? [];
  const invoiceId = billed && clientInvoices.length ? pick(clientInvoices) : null;
  const hasReceipt = rand() < 0.6;
  const isPdf = hasReceipt && rand() < 0.3;
  const fileName = hasReceipt ? `receipt-${id}.${isPdf ? "pdf" : "png"}` : null;
  const notes = pick(EXPENSE_NOTES[cat.id]!);
  const receiptUrl = hasReceipt ? `https://acmedigital.harvestapp.com/expenses/${id}/receipt` : null;
  let fileBytes: Buffer | null = null;
  if (hasReceipt) {
    fileBytes = isPdf
      ? receiptPdf([
          `Vendor: ${pick(["Skyline Air", "Metro Transit", "The Corner Bistro", "Pixel Tools Inc", "Harbor Hotel"])}`,
          `Date: ${day(spent)}`,
          `Description: ${notes}`,
          `Paid by: ${u.first_name} ${u.last_name}`,
          `Total: USD ${total.toFixed(2)}`,
        ])
      : receiptPng(id);
  }

  const raw = {
    id,
    notes,
    total_cost: total,
    units,
    is_closed: d > 60,
    is_locked: d > 60,
    is_billed: billed,
    locked_reason: d > 60 ? "Item Approved" : null,
    billable,
    spent_date: day(spent),
    created_at: iso(spent),
    updated_at: iso(spent),
    receipt: hasReceipt
      ? { url: receiptUrl, file_name: fileName, file_size: fileBytes!.length, content_type: isPdf ? "application/pdf" : "image/png" }
      : null,
    user: { id: u.id, name: `${u.first_name} ${u.last_name}` },
    user_assignment: { id: 90_000 + u.id, is_project_manager: false, is_active: true, budget: null, created_at: iso(daysAgo(700)), updated_at: iso(daysAgo(700)), hourly_rate: 150 },
    expense_category: { id: cat.id, name: cat.name, unit_price: cat.unit_price, unit_name: cat.unit_name },
    client: { id: project.client_id, name: clients.find((c) => c.id === project.client_id)!.name, currency: "USD" },
    project: { id: project.id, name: project.name, code: project.code },
    invoice: invoiceId ? { id: invoiceId, number: String(invoiceId) } : null,
  };

  await upsert("expenses", {
    id,
    spent_date: day(spent),
    user_id: u.id,
    user_assignment_id: 90_000 + u.id,
    client_id: project.client_id,
    project_id: project.id,
    expense_category_id: cat.id,
    invoice_id: invoiceId,
    notes,
    units,
    total_cost: total,
    billable,
    is_closed: d > 60,
    is_locked: d > 60,
    is_billed: billed,
    locked_reason: d > 60 ? "Item Approved" : null,
    receipt: raw.receipt ? JSON.stringify(raw.receipt) : null,
    receipt_url: receiptUrl,
    receipt_file_name: fileName,
    receipt_file_size: fileBytes?.length ?? null,
    receipt_content_type: hasReceipt ? (isPdf ? "application/pdf" : "image/png") : null,
    created_at: iso(spent),
    updated_at: iso(spent),
    raw_json: JSON.stringify(raw),
  });

  if (fileBytes) {
    // Leave a few receipts "pending" so the not-yet-downloaded state shows too.
    if (rand() < 0.1) continue;
    await pool.query(
      `INSERT INTO expense_receipts (expense_id, url, file_name, content_type, file_size, data, fetched_at, fetch_error)
       VALUES ($1, $2, $3, $4, $5, $6, now(), NULL)
       ON CONFLICT (expense_id) DO UPDATE SET url = EXCLUDED.url, file_name = EXCLUDED.file_name,
         content_type = EXCLUDED.content_type, file_size = EXCLUDED.file_size, data = EXCLUDED.data,
         fetched_at = now(), fetch_error = NULL`,
      [id, receiptUrl, fileName, isPdf ? "application/pdf" : "image/png", fileBytes.length, fileBytes],
    );
    receiptsSeeded++;
  }
}

console.log(`✓ ${users.length} people, ${clients.length} clients, ${projects.length} projects, ${totalEntries} time entries, ${invoiceId - 60_000} invoices, ${expenseId - 80_000} expenses (${receiptsSeeded} receipt files)`);

console.log("Rebuilding search index…");
await rebuildSearchIndex();

await closePool();
console.log("✓ Demo data ready — npm run dev and log in to explore.");
process.exit(0);
