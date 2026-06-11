import type { FC } from "hono/jsx";
import { Layout } from "./layout.js";
import { PageHeader } from "./components/PageHeader.js";
import { Empty } from "./components/Empty.js";
import { truncate } from "../lib/format.js";

export interface SearchHit {
  kind: string;
  ref_id: number;
  title: string;
  subtitle: string;
  snippet: string;
}

interface SearchProps {
  q: string;
  grouped: Record<string, SearchHit[]>;
  total: number;
}

const KIND_META: Record<string, { label: string; href: (id: number) => string }> = {
  project: { label: "Projects", href: (id) => `/projects/${id}` },
  client: { label: "Clients", href: (id) => `/clients/${id}` },
  user: { label: "People", href: (id) => `/people/${id}` },
  task: { label: "Tasks", href: (id) => `/time?task=${id}` },
  invoice: { label: "Invoices", href: (id) => `/invoices/${id}` },
  time_entry: { label: "Time entries", href: (id) => `/time?q=${id}` },
};

const ORDER = ["project", "client", "user", "invoice", "task", "time_entry"];

export const SearchView: FC<SearchProps> = ({ q, grouped, total }) => {
  return (
    <Layout title={q ? `Search: ${q}` : "Search"} authed>
      <div class="mx-auto max-w-5xl px-6 py-8">
        <PageHeader
          eyebrow="Search"
          title={q ? `Results for "${q}"` : "Search the archive"}
          subtitle={
            q
              ? `${total} ${total === 1 ? "match" : "matches"} across projects, clients, people, invoices, tasks, and time-entry notes.`
              : "Use the search box in the header to find projects, clients, people, invoices, or any text in time-entry notes."
          }
        />

        {!q && (
          <Empty
            title="Type something in the search bar"
            hint="Searches use prefix matching, so partial words work. Example: 'redesi' matches 'redesign'."
          />
        )}

        {q && total === 0 && (
          <Empty title="No matches" hint="Try different keywords, or check spelling." />
        )}

        {ORDER.map((kind) => {
          const hits = grouped[kind];
          if (!hits || hits.length === 0) return null;
          const meta = KIND_META[kind] ?? { label: kind, href: () => "/" };
          return (
            <section class="mb-8">
              <div class="flex items-baseline gap-3 mb-3">
                <h2 class="font-display font-semibold text-lg">{meta.label}</h2>
                <span class="text-xs text-slate">{hits.length}</span>
              </div>
              <ul class="space-y-2">
                {hits.map((h) => (
                  <li class="card p-4 hover:border-accent transition">
                    <a href={meta.href(h.ref_id)} class="block">
                      <div class="font-medium text-ink hover:text-accent">{h.title}</div>
                      {h.subtitle && <div class="text-xs text-slate mt-0.5">{h.subtitle}</div>}
                      {h.snippet && (
                        <div
                          class="text-sm text-ink/80 mt-2"
                          dangerouslySetInnerHTML={{ __html: h.snippet }}
                        />
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Layout>
  );
};
