import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  className,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between",
        className
      )}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-muted text-brand ring-1 ring-brand/10">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="section-eyebrow">{eyebrow}</p>}
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
              {description}
            </p>
          )}
        </div>
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
