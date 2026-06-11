import { Hono } from "hono";
import { q } from "../../lib/db.js";
import { SearchView, type SearchHit } from "../views/search.js";

export const searchRoutes = new Hono();

/**
 * Build a Postgres tsquery from free text. Each token becomes a prefix match
 * (`word:*`) joined with AND. Non-alphanumeric input is dropped.
 */
function buildTsQuery(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => `${t}:*`)
    .join(" & ");
}

searchRoutes.get("/search", async (c) => {
  const qStr = (c.req.query("q") ?? "").trim();

  if (!qStr) {
    return c.html(<SearchView q="" grouped={{}} total={0} />);
  }

  const tsq = buildTsQuery(qStr);
  if (!tsq) {
    return c.html(<SearchView q={qStr} grouped={{}} total={0} />);
  }

  let hits: SearchHit[] = [];
  try {
    hits = await q<SearchHit>(
      `
        SELECT kind,
               ref_id,
               title,
               subtitle,
               ts_headline(
                 'english',
                 COALESCE(body, ''),
                 to_tsquery('english', @tsq),
                 'StartSel=<mark class="bg-accent/30 px-0.5">, StopSel=</mark>, MaxFragments=2, MaxWords=20, MinWords=5, ShortWord=2'
               ) AS snippet
        FROM search_index
        WHERE tsv @@ to_tsquery('english', @tsq)
        ORDER BY ts_rank(tsv, to_tsquery('english', @tsq)) DESC
        LIMIT 300
      `,
      { tsq },
    );
  } catch {
    hits = [];
  }

  const grouped: Record<string, SearchHit[]> = {};
  for (const h of hits) {
    if (!grouped[h.kind]) grouped[h.kind] = [];
    grouped[h.kind]!.push(h);
  }

  return c.html(<SearchView q={qStr} grouped={grouped} total={hits.length} />);
});
