import { rebuildSearchIndex } from "../fetcher/search.js";
import { closePool } from "../lib/db.js";

const start = Date.now();
await rebuildSearchIndex();
console.log(`✓ Rebuilt in ${((Date.now() - start) / 1000).toFixed(1)}s`);
await closePool();
process.exit(0);
