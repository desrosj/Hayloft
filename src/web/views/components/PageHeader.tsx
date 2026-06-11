import type { FC, PropsWithChildren } from "hono/jsx";

interface PageHeaderProps {
  eyebrow?: string | unknown;
  title: string;
  subtitle?: string;
}

export const PageHeader: FC<PropsWithChildren<PageHeaderProps>> = ({
  eyebrow,
  title,
  subtitle,
  children,
}) => {
  return (
    <header class="mb-6 flex items-start justify-between gap-6 flex-wrap">
      <div>
        {eyebrow ? <div class="label-eyebrow">{eyebrow as never}</div> : null}
        <h1 class="font-display font-bold text-3xl mt-1 text-ink">
          {title}
        </h1>
        {subtitle && <p class="text-sm text-slate mt-2">{subtitle}</p>}
      </div>
      {children && <div class="flex items-center gap-3">{children}</div>}
    </header>
  );
};

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
}

export const StatCard: FC<StatCardProps> = ({ label, value, hint }) => {
  const formatted =
    typeof value === "number" ? new Intl.NumberFormat("en-US").format(value) : value;
  return (
    <div class="card p-4">
      <div class="label-eyebrow">{label}</div>
      <div class="font-display font-bold text-2xl mt-1 text-ink">
        {formatted}
      </div>
      {hint && <div class="text-xs text-slate mt-1">{hint}</div>}
    </div>
  );
};
