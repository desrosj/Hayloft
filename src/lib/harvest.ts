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

export interface DownloadResult {
  data: Buffer;
  contentType: string | null;
}

// Receipt uploads in Harvest are capped well below this; the guard just keeps
// a misbehaving response from ballooning memory.
const MAX_DOWNLOAD_BYTES = 32 * 1024 * 1024;

// Only these count as "try again": everything else in the 5xx range (501
// Not Implemented, 505 HTTP Version Not Supported, ...) is deterministic and
// retrying just burns time and rate limit.
const RETRYABLE_5XX = new Set([500, 502, 503, 504]);

/** Credentials only ever go to Harvest's own hosts, never to storage/CDN origins. */
function isHarvestHost(url: URL): boolean {
  const h = url.hostname.toLowerCase();
  return h === "harvestapp.com" || h.endsWith(".harvestapp.com") || h.endsWith(".getharvest.com");
}

/** Compact description of a failed response for logs and fetch_error. */
async function describeResponse(res: Response): Promise<string> {
  const interesting = ["server", "via", "x-cache", "content-type", "location", "x-request-id"];
  const headers = interesting
    .map((k) => [k, res.headers.get(k)] as const)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  let body = "";
  try {
    body = (await res.text()).replace(/\s+/g, " ").trim().slice(0, 300);
  } catch {
    // ignore unreadable bodies
  }
  return [headers ? `[${headers}]` : "", body].filter(Boolean).join(" ");
}

/**
 * Download a file that Harvest links to (e.g. an expense receipt URL such as
 * https://{subdomain}.harvestapp.com/expenses/{id}/receipt).
 *
 * Harvest authenticates these with the same bearer token + account id as the
 * API, then typically redirects to a signed storage URL. Redirects are
 * followed manually so credentials are only ever sent to the Harvest origin.
 */
export async function harvestDownload(
  url: string,
  opts: { maxBytes?: number; signal?: AbortSignal } = {},
): Promise<DownloadResult> {
  const env = loadEnv({ requireHarvest: true });
  const maxBytes = opts.maxBytes ?? MAX_DOWNLOAD_BYTES;

  // Parse up front: this both validates the URL Harvest gave us and makes
  // sure the request line is properly percent-encoded.
  let current = new URL(url).toString();
  let withAuth = isHarvestHost(new URL(current));
  let hops = 0;
  let attempt = 0;
  const maxAttempts = 6;
  const trail = (): string => (hops > 0 ? ` (after ${hops} redirect${hops === 1 ? "" : "s"} from ${url})` : "");

  while (true) {
    // Only Harvest-origin requests count against the API rate limit.
    if (withAuth) await throttle(false);
    attempt++;

    const headers: Record<string, string> = {
      "User-Agent": env.HARVEST_USER_AGENT,
      Accept: "*/*",
    };
    if (withAuth) {
      headers.Authorization = `Bearer ${env.HARVEST_ACCESS_TOKEN}`;
      headers["Harvest-Account-Id"] = env.HARVEST_ACCOUNT_ID!;
    }

    const res = await fetch(current, {
      method: "GET",
      headers,
      redirect: "manual",
      signal: opts.signal,
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new HarvestError(res.status, current, `redirect without Location${trail()}`);
      if (++hops > 5) throw new HarvestError(res.status, current, `too many redirects${trail()}`);
      const next = new URL(location, current);
      // Keep credentials only while we stay on the same Harvest origin.
      withAuth = withAuth && isHarvestHost(next) && next.origin === new URL(current).origin;
      logger.debug({ from: current, to: next.toString(), withAuth }, "download redirect");
      current = next.toString();
      continue;
    }

    if (res.ok) {
      const contentType = res.headers.get("content-type");
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > maxBytes) {
        throw new HarvestError(res.status, current, `file too large (${declared} bytes)`);
      }
      // A 200 HTML page here means we were bounced to a login screen rather
      // than handed the file — surface that instead of archiving the HTML.
      if (contentType && /text\/html/i.test(contentType)) {
        throw new HarvestError(res.status, current, `received an HTML page instead of a file (auth?)${trail()}`);
      }
      const data = Buffer.from(await res.arrayBuffer());
      if (data.length > maxBytes) {
        throw new HarvestError(res.status, current, `file too large (${data.length} bytes)`);
      }
      return { data, contentType };
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? "15");
      logger.warn({ url: current, retryAfter, attempt }, "rate limited (429) on download; waiting");
      await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
      continue;
    }

    if (RETRYABLE_5XX.has(res.status) && attempt < maxAttempts) {
      const backoff = Math.min(2 ** attempt * 500, 15_000);
      logger.warn({ url: current, status: res.status, attempt, backoff }, "5xx on download; retrying");
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    const detail = await describeResponse(res);
    logger.warn(
      { url: current, status: res.status, withAuth, hops, detail },
      "download failed",
    );
    throw new HarvestError(res.status, current, `${detail}${trail()}`);
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
