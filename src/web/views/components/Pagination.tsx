import type { FC } from "hono/jsx";
import { pageHref, totalPages } from "../../lib/pagination.js";

interface PaginationProps {
  basePath: string;
  query: Record<string, string | undefined>;
  page: number;
  perPage: number;
  total: number;
}

export const Pagination: FC<PaginationProps> = ({
  basePath,
  query,
  page,
  perPage,
  total,
}) => {
  const tp = totalPages(total, perPage);
  if (tp <= 1) {
    return (
      <div class="flex items-center justify-between text-xs text-slate py-3 px-1">
        <span>{total.toLocaleString()} {total === 1 ? "result" : "results"}</span>
      </div>
    );
  }

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  const window = 2;
  const pages: (number | "...")[] = [];
  for (let i = 1; i <= tp; i++) {
    if (
      i === 1 ||
      i === tp ||
      (i >= page - window && i <= page + window)
    ) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <div class="flex items-center justify-between text-xs text-slate py-3 px-1">
      <span>
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <nav class="flex items-center gap-1">
        {page > 1 && (
          <a class="px-2 py-1 border border-edge rounded hover:bg-white" href={pageHref(basePath, query, page - 1)}>
            ‹ Prev
          </a>
        )}
        {pages.map((p) =>
          p === "..." ? (
            <span class="px-2 py-1 text-slate">…</span>
          ) : p === page ? (
            <span class="px-2 py-1 border border-ink bg-ink text-white rounded">{p}</span>
          ) : (
            <a class="px-2 py-1 border border-edge rounded hover:bg-white" href={pageHref(basePath, query, p)}>
              {p}
            </a>
          ),
        )}
        {page < tp && (
          <a class="px-2 py-1 border border-edge rounded hover:bg-white" href={pageHref(basePath, query, page + 1)}>
            Next ›
          </a>
        )}
      </nav>
    </div>
  );
};
