import { Command } from "commander";
import cliProgress from "cli-progress";
import { exec, q, closePool } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { migrate } from "../db/migrate.js";
import { RESOURCES, fetchOrder, RESOURCES_BY_NAME } from "./resources.js";
import { runResource, rateSnapshot } from "./runner.js";
import { rebuildSearchIndex } from "./search.js";
import type { FetchMode } from "./types.js";

const program = new Command();

program
  .name("fetch")
  .description("Pull Harvest data into the Postgres archive")
  .option("-r, --resource <name>", "Single resource (or comma-separated list)")
  .option("--resources <names>", "Comma-separated list of resources")
  .option("-l, --limit <n>", "Stop after N items per resource", (v) => Number(v))
  .option("-p, --pages <n>", "Stop after N pages per resource", (v) => Number(v))
  .option("--start-page <n>", "Resume from page N (1-indexed)", (v) => Number(v))
  .option("--since <iso>", "updated_since override (e.g., 2025-01-01)")
  .option("--mode <mode>", "full | sync (default: full)", "full")
  .option("--dry-run", "Show what would be fetched, write nothing")
  .option("--list", "List known resources and exit")
  .option("--reset-resource <name>", "TRUNCATE one table before refetching")
  .option("--no-search-index", "Skip rebuilding the FTS search index at the end")
  .parse(process.argv);

const opts = program.opts<{
  resource?: string;
  resources?: string;
  limit?: number;
  pages?: number;
  startPage?: number;
  since?: string;
  mode: FetchMode;
  dryRun?: boolean;
  list?: boolean;
  resetResource?: string;
  searchIndex: boolean;
}>();

if (opts.list) {
  console.log("\nAvailable resources (fetched in this order):\n");
  for (const r of fetchOrder()) {
    const deps = r.dependsOn?.length ? `  ← depends on: ${r.dependsOn.join(", ")}` : "";
    console.log(`  ${r.name.padEnd(30)} ${r.label}${deps}`);
  }
  console.log();
  process.exit(0);
}

await migrate();

const requested = (opts.resource ?? opts.resources)
  ?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (requested) {
  for (const name of requested) {
    if (!RESOURCES_BY_NAME.has(name)) {
      console.error(`Unknown resource: ${name}`);
      console.error(`Available: ${RESOURCES.map((r) => r.name).join(", ")}`);
      process.exit(1);
    }
  }
}

if (opts.resetResource) {
  const def = RESOURCES_BY_NAME.get(opts.resetResource);
  if (!def) {
    console.error(`Unknown resource: ${opts.resetResource}`);
    process.exit(1);
  }
  console.log(`Wiping table: ${def.table}`);
  await exec(`TRUNCATE TABLE ${def.table} CASCADE`);
  await exec(`DELETE FROM sync_state WHERE resource = '${def.name.replace(/'/g, "''")}'`);
}

const SPINE_RESOURCES = new Set([
  "users",
  "clients",
  "projects",
  "tasks",
  "invoice_item_categories",
  "roles",
]);

if (opts.limit !== undefined && requested) {
  const spineHit = requested.filter((n) => SPINE_RESOURCES.has(n));
  if (spineHit.length > 0) {
    console.warn(
      `\n⚠  --limit on FK-target resource(s) [${spineHit.join(", ")}] will break joins.`,
    );
    console.warn(
      `   E.g., time entries with user_ids missing from a partial users table will show "—" for names.`,
    );
    console.warn(
      `   For smoke testing, prefer --limit on time_entries/invoices instead.\n`,
    );
  }
}

const toRun = requested
  ? requested.map((n) => RESOURCES_BY_NAME.get(n)!).filter(Boolean)
  : fetchOrder();

if (opts.dryRun) {
  console.log("\nDRY RUN — would fetch the following resources in order:\n");
  for (const r of toRun) {
    const params: string[] = [];
    if (opts.limit) params.push(`limit=${opts.limit}`);
    if (opts.pages) params.push(`pages=${opts.pages}`);
    if (opts.since) params.push(`since=${opts.since}`);
    if (opts.mode === "sync") params.push("mode=sync");
    console.log(
      `  ${r.name.padEnd(30)} ${r.path}${params.length ? `  (${params.join(", ")})` : ""}`,
    );
  }
  console.log();
  process.exit(0);
}

const startedAt = new Date();
const runIdRows = await q<{ id: number }>(
  "INSERT INTO fetch_runs (started_at, resource, mode, status) VALUES (@started, @resource, @mode, 'running') RETURNING id",
  { started: startedAt.toISOString(), resource: requested?.join(",") ?? "all", mode: opts.mode },
);
const runId = runIdRows[0]!.id;

const multibar = new cliProgress.MultiBar(
  {
    clearOnComplete: false,
    hideCursor: true,
    format:
      " {bar} | {resource} | {value}/{total} items | page {page}/{totalPages} | {status}",
  },
  cliProgress.Presets.shades_classic,
);

let totalSeen = 0;
let totalWritten = 0;

const rateInterval = setInterval(() => {
  const r = rateSnapshot();
  logger.debug({ rate: r }, "rate snapshot");
}, 5000);

console.log(`\n┌─ HAYLOFT — fetch starting ${startedAt.toISOString()}`);
console.log(`├─ Mode: ${opts.mode}${opts.since ? ` · since=${opts.since}` : ""}`);
console.log(`├─ Resources: ${toRun.map((r) => r.name).join(", ")}`);
if (opts.limit) console.log(`├─ Limit: ${opts.limit} items per resource`);
if (opts.pages) console.log(`├─ Pages: ${opts.pages} pages per resource`);
console.log(`└─ Run id: ${runId}\n`);

const skipped: { name: string; reason: string }[] = [];

try {
  for (const def of toRun) {
    const bar = multibar.create(100, 0, {
      resource: def.name.padEnd(28),
      page: 0,
      totalPages: "?",
      status: "starting",
    });

    try {
      const result = await runResource({
        def,
        mode: opts.mode,
        limit: opts.limit,
        maxPages: opts.pages,
        startPage: opts.startPage,
        since: opts.since,
        onProgress: (info) => {
          bar.setTotal(Math.max(info.totalEntries, info.itemsSeen));
          bar.update(info.itemsSeen, {
            page: info.page,
            totalPages: info.totalPages,
            status: `${info.itemsWritten} written`,
          });
        },
      });

      bar.update(bar.getTotal(), { status: `done · ${result.itemsWritten} written` });
      totalSeen += result.itemsSeen;
      totalWritten += result.itemsWritten;
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      const isSkippable = /\b(40[34]|422)\b/.test(message);
      if (isSkippable) {
        bar.update(bar.getTotal() || 1, { status: `skipped · ${message.slice(0, 40)}…` });
        skipped.push({ name: def.name, reason: message });
        logger.warn({ resource: def.name, err: message }, "skipping resource");
      } else {
        throw err;
      }
    }

    await q(
      "UPDATE fetch_runs SET records_seen = @seen, records_written = @written WHERE id = @id",
      { seen: totalSeen, written: totalWritten, id: runId },
    );
  }

  multibar.stop();
  clearInterval(rateInterval);

  const endedAt = new Date();
  await q(
    "UPDATE fetch_runs SET ended_at = @ended, status = 'success', records_seen = @seen, records_written = @written WHERE id = @id",
    { ended: endedAt.toISOString(), seen: totalSeen, written: totalWritten, id: runId },
  );

  const dur = ((endedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1);
  console.log(`\n✓ Fetch done in ${dur}s · seen ${totalSeen} items · wrote ${totalWritten} rows`);

  if (skipped.length > 0) {
    console.log(`\n⚠ Skipped ${skipped.length} resource(s) (likely permissions or feature disabled):`);
    for (const s of skipped) {
      console.log(`  - ${s.name}: ${s.reason.slice(0, 100)}`);
    }
    console.log();
  }

  if (opts.searchIndex) {
    try {
      console.log("Rebuilding search index...");
      await rebuildSearchIndex();
      console.log("✓ Search index rebuilt\n");
    } catch (err) {
      console.error(`⚠ Search index rebuild failed: ${(err as Error).message}`);
      console.error("  Data is fine — re-run with `npm run reindex` to retry.\n");
    }
  } else {
    console.log();
  }
} catch (err) {
  multibar.stop();
  clearInterval(rateInterval);
  const message = (err as Error).message ?? String(err);
  await q(
    "UPDATE fetch_runs SET ended_at = @ended, status = 'error', error = @err, records_seen = @seen, records_written = @written WHERE id = @id",
    {
      ended: new Date().toISOString(),
      err: message,
      seen: totalSeen,
      written: totalWritten,
      id: runId,
    },
  );
  logger.error({ err: message }, "fetch failed");
  console.error(`\n✗ Failed: ${message}\n`);
  console.error("Re-run the same command to resume — upserts are idempotent.");
  await closePool();
  process.exit(1);
}

await closePool();
process.exit(0);
