const numberFmt = new Intl.NumberFormat("en-US");
const hoursFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return numberFmt.format(n);
}

export function hours(h: number | null | undefined): string {
  if (h === null || h === undefined) return "—";
  return hoursFmt.format(h);
}

export function money(
  amount: number | null | undefined,
  currency: string | null | undefined = "USD",
): string {
  if (amount === null || amount === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency ?? ""} ${amount.toFixed(2)}`.trim();
  }
}

export function date(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function fullName(
  first: string | null | undefined,
  last: string | null | undefined,
): string {
  const f = first ?? "";
  const l = last ?? "";
  return `${f} ${l}`.trim() || "—";
}

export function truncate(s: string | null | undefined, max = 80): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function activeBadge(isActive: number | boolean | null | undefined): {
  text: string;
  classes: string;
} {
  const active = isActive === 1 || isActive === true;
  return active
    ? {
        text: "Active",
        classes: "bg-green-50 text-green-700 border-green-200",
      }
    : {
        text: "Archived",
        classes: "bg-surface text-slate border-edge",
      };
}

export function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function yesNo(v: boolean | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v === true || v === 1 ? "Yes" : "No";
}
