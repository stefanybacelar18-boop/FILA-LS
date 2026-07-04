import { cn } from "@/lib/utils";
import Link from "next/link";
import { HTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

const accentStyles = {
  brand: {
    bar: "bg-brand",
    icon: "bg-brand-muted text-brand ring-1 ring-brand/10",
    value: "text-brand",
  },
  blue: {
    bar: "bg-brand",
    icon: "bg-brand-muted text-brand ring-1 ring-brand/10",
    value: "text-brand",
  },
  green: {
    bar: "bg-emerald-600",
    icon: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100",
    value: "text-emerald-700",
  },
  amber: {
    bar: "bg-amber-500",
    icon: "bg-amber-50 text-amber-600 ring-1 ring-amber-100",
    value: "text-amber-700",
  },
  slate: {
    bar: "bg-slate-400",
    icon: "bg-slate-100 text-slate-600 ring-1 ring-slate-200/80",
    value: "text-slate-800",
  },
} as const;

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = "brand",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  accent?: keyof typeof accentStyles;
}) {
  const styles = accentStyles[accent];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-card)] border border-slate-200/90 bg-white p-5 shadow-[var(--shadow-card)] transition duration-200 hover:shadow-[var(--shadow-elevated)]",
        className
      )}
      {...props}
    >
      <div className={cn("absolute inset-y-0 left-0 w-1", styles.bar)} aria-hidden />
      <div className="flex items-start justify-between gap-3 pl-2">
        <p className="section-eyebrow">{title}</p>
        {Icon && (
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              styles.icon
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <p
        className={cn(
          "mt-2 pl-2 text-3xl font-bold tabular-nums tracking-tight",
          styles.value
        )}
      >
        {value}
      </p>
      {subtitle && (
        <p className="mt-1 pl-2 text-xs text-slate-400">{subtitle}</p>
      )}
    </div>
  );
}

export function AdminToolCard({
  href,
  label,
  description,
  icon: Icon,
}: {
  href: string;
  label: string;
  description?: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-[var(--radius-card)] border border-slate-200/90 bg-white p-5 shadow-[var(--shadow-card)] transition duration-200 hover:border-brand/25 hover:shadow-[var(--shadow-elevated)]"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-muted text-brand ring-1 ring-brand/10 transition duration-200 group-hover:bg-brand group-hover:text-white group-hover:ring-brand/20">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800">{label}</p>
          {description && (
            <p className="mt-0.5 text-xs leading-snug text-slate-500">
              {description}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

export function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>
      {subtitle && (
        <p className="mt-1 text-sm leading-relaxed text-slate-500">{subtitle}</p>
      )}
    </div>
  );
}
