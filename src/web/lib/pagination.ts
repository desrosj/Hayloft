export interface PageParams {
  page: number;
  perPage: number;
  offset: number;
}

export function parsePage(query: Record<string, string | undefined>, defaultPerPage = 50): PageParams {
  const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
  const perPage = Math.min(500, Math.max(10, parseInt(query.per ?? String(defaultPerPage), 10) || defaultPerPage));
  return { page, perPage, offset: (page - 1) * perPage };
}

export function pageHref(
  basePath: string,
  query: Record<string, string | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "" && k !== "page") params.set(k, v);
  }
  params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function totalPages(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}
