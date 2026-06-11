export type Period = "month" | "year" | "all";

export const PERIOD_LABELS: Record<Period, string> = {
  month: "Last 30 days",
  year: "Last 12 months",
  all: "All time",
};

export function parsePeriod(query: Record<string, string | undefined>): Period {
  const p = query.period;
  if (p === "year" || p === "all") return p;
  return "month";
}

/**
 * Returns an ISO YYYY-MM-DD cutoff for the given period, or null for "all".
 * Use with a `>=` comparison against a DATE or TIMESTAMPTZ column.
 */
export function periodCutoff(period: Period): string | null {
  if (period === "all") return null;
  const days = period === "month" ? 30 : 365;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
