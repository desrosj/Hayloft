import type { FC, PropsWithChildren } from "hono/jsx";

interface LayoutProps {
  title?: string;
  activeNav?: string;
  authed?: boolean;
}

const NAV = [
  { key: "dashboard", href: "/", label: "Dashboard" },
  { key: "projects", href: "/projects", label: "Projects" },
  { key: "clients", href: "/clients", label: "Clients" },
  { key: "people", href: "/people", label: "People" },
  { key: "time", href: "/time", label: "Time" },
  { key: "expenses", href: "/expenses", label: "Expenses" },
  { key: "invoices", href: "/invoices", label: "Invoices" },
];

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({
  title,
  activeNav,
  authed,
  children,
}) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title ? `${title} — Hayloft` : "Hayloft"}</title>
        <link rel="stylesheet" href="/styles.css" />
        <meta name="robots" content="noindex,nofollow" />
      </head>
      <body class="min-h-screen flex flex-col">
        {authed && (
          <header class="bg-ink text-white">
            <div class="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
              <a href="/" class="font-display font-bold text-lg tracking-tight text-white hover:no-underline">
                <span class="text-white">hayloft</span>
                <span class="text-accent ml-2 text-[11px] uppercase tracking-widest align-middle">Harvest archive</span>
              </a>
              <nav class="flex items-center gap-5 flex-wrap">
                {NAV.map((n) => (
                  <a
                    href={n.href}
                    class={`nav-link ${activeNav === n.key ? "active" : ""}`}
                  >
                    {n.label}
                  </a>
                ))}
                <form action="/logout" method="post" class="inline">
                  <button type="submit" class="nav-link cursor-pointer">
                    Log out
                  </button>
                </form>
              </nav>
            </div>
            <div class="bg-ink-light border-t border-white/5">
              <div class="mx-auto max-w-7xl px-6 py-2">
                <form action="/search" method="get" class="flex items-center gap-2">
                  <input
                    type="search"
                    name="q"
                    placeholder="Search projects, clients, people, time entry notes, expenses, invoices…"
                    class="flex-1 rounded bg-ink border border-white/10 px-3 py-1.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-accent"
                  />
                  <button type="submit" class="btn-primary py-1.5 px-4 text-[11px]">
                    Search
                  </button>
                </form>
              </div>
            </div>
          </header>
        )}

        <main class="flex-1">{children}</main>

        <footer class="bg-ink text-white/50 text-xs py-4 mt-12">
          <div class="mx-auto max-w-7xl px-6 flex items-center justify-between flex-wrap gap-2">
            <span>
              Hayloft — read-only Harvest archive · Built by{" "}
              <a href="https://webdevstudios.com" class="text-white/70 hover:text-white">
                WebDevStudios
              </a>
            </span>
            <span class="text-white/30">v0.1</span>
          </div>
        </footer>
      </body>
    </html>
  );
};
