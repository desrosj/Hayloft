import type { FC, PropsWithChildren } from "hono/jsx";

interface EmptyProps {
  title: string;
  hint?: string;
}

export const Empty: FC<PropsWithChildren<EmptyProps>> = ({ title, hint, children }) => {
  return (
    <div class="card py-12 px-6 text-center">
      <div class="font-display text-lg text-ink">{title}</div>
      {hint && <p class="text-sm text-slate mt-2 max-w-md mx-auto">{hint}</p>}
      {children && <div class="mt-4">{children}</div>}
    </div>
  );
};
