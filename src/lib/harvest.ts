import { loadEnv } from "../config/env.js";
import { logger } from "./logger.js";

const BASE = "https://api.harvestapp.com/v2";

// General API: 100 requests per 15 seconds.
// Reports API: 100 requests per 15 minutes.
// We pace ourselves at ~90/15s with a soft window, then respect Retry-After.

interface RateState {
  windowStart: number;
  count: number;
  cap: number;
  windowMs: number;
}

const generalRate: RateState = {
  windowStart: Date.now(),
  count: 0,
  cap: 90,
  windowMs: 15_000,
};
const reportsRate: RateState = {
  windowStart: Date.now(),
  count: 0,
  cap: 90,
  windowMs: 15 * 60_000,
};

async function throttle(isReportsApi: boolean) {
  const r = isReportsApi ? reportsRate : generalRate;
  const now = Date.now();
  if (now - r.windowStart >= r.windowMs) {
    r.windowStart = now;
    r.count = 0;
  }
  if (r.count >= r.cap) {
    const wait = r.windowStart + r.windowMs - now;
    if (wait > 0) {
      logger.debug({ wait, kind: isReportsApi ? "reports" : "general" }, "rate-limit pre-wait");
      await new Promise((res) => setTimeout(res, wait + 50));
      r.windowStart = Date.now();
      r.count = 0;
    }
  }
  r.count++;
}

export interface RateSnapshot {
  general: { used: number; cap: number };
  reports: { used: number; cap: number };
}

export function rateSnapshot(): RateSnapshot {
  return {
    general: { used: generalRate.count, cap: generalRate.cap },
    reports: { used: reportsRate.count, cap: reportsRate.cap },
  };
}

export interface HarvestPage<T> {
  data: T[];
  total_pages: number;
  page: number;
  per_page: number;
  total_entries: number;
  next_page: number | null;
  previous_page: number | null;
  links?: Record<string, string | null>;
}

export interface FetchOpts {
  isReportsApi?: boolean;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

export async function harvestFetch<T = unknown>(
  path: string,
  opts: FetchOpts = {},
): Promise<T> {
  const env = loadEnv({ requireHarvest: true });
  const url = new URL(BASE + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  let attempt = 0;
  const maxAttempts = 6;

  while (true) {
    await throttle(opts.isReportsApi ?? false);
    attempt++;

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.HARVEST_ACCESS_TOKEN}`,
        // requireHarvest above guarantees these are set
        "Harvest-Account-Id": env.HARVEST_ACCOUNT_ID!,
        "User-Agent": env.HARVEST_USER_AGENT,
        Accept: "application/json",
      },
      signal: opts.signal,
    });

    if (res.ok) {
      return (await res.json()) as T;
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? "15");
      logger.warn(
        { path, retryAfter, attempt },
        "rate limited (429); waiting before retry",
      );
      await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
      continue;
    }

    if (res.status >= 500 && attempt < maxAttempts) {
      const backoff = Math.min(2 ** attempt * 500, 15_000);
      logger.warn(
        { path, status: res.status, attempt, backoff },
        "5xx from Harvest; retrying with backoff",
      );
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    const body = await res.text();
    throw new HarvestError(res.status, path, body);
  }
}

export class HarvestError extends Error {
  status: number;
  path: string;
  body: string;
  constructor(status: number, path: string, body: string) {
    super(`Harvest ${status} at ${path}: ${body.slice(0, 500)}`);
    this.status = status;
    this.path = path;
    this.body = body;
    this.name = "HarvestError";
  }
}

export async function* paginate<T>(
  path: string,
  opts: FetchOpts & { perPage?: number; startPage?: number } = {},
): AsyncGenerator<{ page: HarvestPage<T>; pageNum: number }, void, void> {
  const perPage = opts.perPage ?? 100;
  let pageNum = opts.startPage ?? 1;
  while (true) {
    const page = await harvestFetch<HarvestPage<T>>(path, {
      ...opts,
      query: { ...opts.query, page: pageNum, per_page: perPage },
    });
    yield { page, pageNum };
    if (!page.next_page) break;
    pageNum = page.next_page;
  }
}

// "data" key varies per endpoint (e.g., /users → { users: [...] }).
// This unwraps any of the listing endpoints to a flat array of items.
export function unwrap<T>(page: unknown, key: string): T[] {
  const obj = page as Record<string, unknown>;
  return (obj[key] as T[]) ?? [];
}
