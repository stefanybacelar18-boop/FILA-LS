import { cn } from "@/lib/utils";
import Link from "next/link";
import { HTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

const accentStyles = {
  brand: "bg-brand",
  blue: "bg-brand",
  green: "bg-emerald-500",
  amber: "bg-amber-400",
  slate: "bg-slate-300",
} as const;

/** Card de métrica — fundo branco, detalhe de cor mínimo */
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
  return (
    <div
      className={cn(
        "relative rounded-[var(--radius-card)] border border-slate-200/75 bg-white px-4 py-4 shadow-[var(--shadow-card)]",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "absolute inset-y-3 left-0 w-0.5 rounded-full",
          accentStyles[accent]
        )}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2 pl-2">
        <p className="text-xs font-medium text-slate-500">{title}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />}
      </div>
      <p className="mt-1.5 pl-2 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
        {value}
      </p>
      {subtitle && <p className="mt-0.5 pl-2 text-xs text-slate-400">{subtitle}</p>}
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
      className="group flex items-center gap-3 rounded-[var(--radius-card)] border border-slate-200/75 bg-white p-4 shadow-[var(--shadow-card)] transition duration-200 hover:border-brand/20 hover:shadow-[var(--shadow-elevated)]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-muted/80 text-brand">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-800">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-snug text-slate-500">{description}</p>
        )}
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
      <h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2>
      {subtitle && (
        <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{subtitle}</p>
      )}
    </div>
  );
}
