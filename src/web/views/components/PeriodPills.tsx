import type { FC } from "hono/jsx";
import { PERIOD_LABELS, type Period } from "../../lib/period.js";

interface Props {
  basePath: string;
  query: Record<string, string | undefined>;
  period: Period;
}

const ORDER: Period[] = ["month", "year", "all"];

function hrefFor(basePath: string, query: Record<string, string | undefined>, period: Period): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "" && k !== "page" && k !== "period") {
      params.set(k, v);
    }
  }
  params.set("period", period);
  return `${basePath}?${params.toString()}`;
}

export const PeriodPills: FC<Props> = ({ basePath, query, period }) => {
  return (
    <div class="inline-flex items-center rounded border border-edge overflow-hidden bg-white">
      {ORDER.map((p, i) => {
        const active = p === period;
        return (
          <a
            href={hrefFor(basePath, query, p)}
            class={`text-[11px] uppercase tracking-wider font-medium px-3 py-1.5 transition ${
              active
                ? "bg-ink text-white"
                : "text-slate hover:bg-surface"
            } ${i < ORDER.length - 1 ? "border-r border-edge" : ""}`}
          >
            {PERIOD_LABELS[p]}
          </a>
        );
      })}
    </div>
  );
};
