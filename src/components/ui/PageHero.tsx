import { BrandLogo } from "@/components/brand/BrandLogo";
import { cn } from "@/lib/utils";

export function PageHero({
  eyebrow,
  title,
  description,
  className,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-6 overflow-hidden rounded-2xl border border-white/10 bg-brand-hero p-6 text-white shadow-[var(--shadow-premium)] hero-pattern",
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="hidden shrink-0 rounded-xl border border-white/15 bg-white/10 p-2.5 backdrop-blur-sm sm:block">
            <BrandLogo size="sm" showWordmark={false} inverted />
          </div>
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-100">
                {eyebrow}
              </p>
            )}
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-[1.65rem]">
              {title}
            </h1>
            {description && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-sky-50/95">
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
