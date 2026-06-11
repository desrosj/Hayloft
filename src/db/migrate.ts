import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exec, closePool } from "../lib/db.js";
import { logger } from "../lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const schemaPath = resolve(__dirname, "schema.sql");
  const schema = readFileSync(schemaPath, "utf8");
  await exec(schema);
  logger.info("Schema applied");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await migrate();
  } finally {
    await closePool();
  }
  process.exit(0);
}
