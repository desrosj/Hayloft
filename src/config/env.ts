import "dotenv/config";
import { z } from "zod";

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);

const optStr = z
  .string()
  .optional()
  .transform(emptyToUndef as (v: string | undefined) => string | undefined);

const reqStr = (msg: string) =>
  z
    .string({ required_error: msg })
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.string({ required_error: msg }).min(1, msg));

const schema = z.object({
  // Only required when actually talking to the Harvest API (the fetcher).
  // The web app and seed-demo run fine without them.
  HARVEST_ACCOUNT_ID: optStr,
  HARVEST_ACCESS_TOKEN: optStr,
  // Harvest asks that API clients identify themselves with a contact in the
  // User-Agent — set HARVEST_USER_AGENT to include your email in .env.
  HARVEST_USER_AGENT: optStr.default("Hayloft (github.com/WebDevStudios/hayloft)"),
  // When set, the fetcher writes expense receipt files into this directory
  // (one subfolder per expense) instead of storing the bytes in Postgres, and
  // the web app reads them back from there. Leave unset to keep receipts in
  // the database (the default, and the only option on ephemeral hosts).
  RECEIPTS_DIR: optStr,

  APP_PASSWORD_HASH: optStr,
  SESSION_SECRET: optStr.refine(
    (v) => v === undefined || v.length >= 16,
    "SESSION_SECRET must be at least 16 characters",
  ),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Postgres connection. Railway provides this automatically when you add a Postgres service.
  // Locally, point this at docker-compose's postgres: postgresql://hayloft:dev@localhost:5432/hayloft
  DATABASE_URL: reqStr("DATABASE_URL required"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function loadEnv(opts: { requireWeb?: boolean; requireHarvest?: boolean } = {}): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".") || "(env)"}: ${issue.message}`);
    }
    process.exit(1);
  }
  if (opts.requireHarvest) {
    if (!parsed.data.HARVEST_ACCOUNT_ID || !parsed.data.HARVEST_ACCESS_TOKEN) {
      console.error(
        "HARVEST_ACCOUNT_ID and HARVEST_ACCESS_TOKEN required — create a personal access token at https://id.getharvest.com/developers",
      );
      process.exit(1);
    }
  }
  if (opts.requireWeb) {
    if (!parsed.data.APP_PASSWORD_HASH) {
      console.error(
        "APP_PASSWORD_HASH required. Generate with: npm run hash-password -- 'your-password'",
      );
      process.exit(1);
    }
    if (!parsed.data.SESSION_SECRET) {
      console.error("SESSION_SECRET required. Generate with: openssl rand -hex 32");
      process.exit(1);
    }
  }
  cached = parsed.data;
  return cached;
}
