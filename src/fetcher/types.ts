import type pg from "pg";

export interface ProgressInfo {
  resource: string;
  page: number;
  totalPages: number;
  itemsSeen: number;
  itemsWritten: number;
  totalEntries: number;
}

export type FetchMode = "full" | "sync";

export interface ResourceDef {
  /** key used in CLI flags and sync_state */
  name: string;
  /** human-readable label */
  label: string;
  /** Harvest API path */
  path: string;
  /** the array key inside the JSON envelope (e.g., "users" for /users) */
  envelopeKey: string;
  /** target Postgres table */
  table: string;
  /** does this resource support `updated_since`? Most do. */
  supportsUpdatedSince?: boolean;
  /** is this resource on the Reports API (heavier rate limit)? */
  isReportsApi?: boolean;
  /** other resources that must be fetched first */
  dependsOn?: string[];
  /** column mapping: API field → SQL column (defaults to identity) */
  fieldMap?: Record<string, string>;
  /** fields that need JSON-stringifying before insert */
  jsonFields?: string[];
  /** fields to drop from the row before insert */
  dropFields?: string[];
  /** custom post-write hook (e.g., expand nested arrays) */
  afterUpsert?: (
    executor: pg.PoolClient | pg.Pool,
    item: Record<string, unknown>,
  ) => Promise<void>;
}
