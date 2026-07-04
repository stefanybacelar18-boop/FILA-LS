import { BrandLogo } from "@/components/brand/BrandLogo";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function PageHero({
  eyebrow,
  title,
  description,
  className,
  children,
  variant = "brand",
  icon: Icon,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
  variant?: "brand" | "light";
  icon?: LucideIcon;
}) {
  const isLight = variant === "light";

  return (
    <div
      className={cn(
        isLight
          ? "mb-6 rounded-[var(--radius-card)] border border-slate-200/90 bg-white p-6 shadow-[var(--shadow-card)]"
          : "mb-6 overflow-hidden rounded-2xl border border-white/10 bg-brand-hero p-6 text-white shadow-[var(--shadow-premium)] hero-pattern",
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          {isLight && Icon ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-muted text-brand ring-1 ring-brand/10">
              <Icon className="h-6 w-6" />
            </div>
          ) : (
            <div className="hidden shrink-0 rounded-xl border border-white/15 bg-white/10 p-2.5 backdrop-blur-sm sm:block">
              <BrandLogo size="sm" showWordmark={false} inverted />
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <p
                className={cn(
                  "text-[11px] font-bold uppercase tracking-[0.12em]",
                  isLight ? "section-eyebrow" : "text-sky-100"
                )}
              >
                {eyebrow}
              </p>
            )}
            <h1
              className={cn(
                "mt-1 text-2xl font-bold tracking-tight sm:text-[1.65rem]",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              {title}
            </h1>
            {description && (
              <p
                className={cn(
                  "mt-2 max-w-2xl text-sm leading-relaxed",
                  isLight ? "text-slate-500" : "text-sky-50/95"
                )}
              >
                {description}
              </p>
            )}
          </div>
        </div>
        {children && <div className="shrink-0">{children}</div>}
      </div>
    </div>
  );
}
