import { cn } from "@/lib/utils";

/** Cabeçalho de página — variante light sem logo duplicada */
export function PageHero({
  eyebrow,
  title,
  description,
  className,
  children,
  variant = "brand",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
  variant?: "brand" | "light";
}) {
  const isLight = variant === "light";

  if (isLight) {
    return (
      <div
        className={cn(
          "mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
          className
        )}
      >
        <div className="min-w-0">
          {eyebrow && <p className="section-eyebrow">{eyebrow}</p>}
          <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">{title}</h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">{description}</p>
          )}
        </div>
        {children && <div className="shrink-0">{children}</div>}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mb-6 overflow-hidden rounded-2xl border border-white/10 bg-brand-hero p-6 text-white shadow-[var(--shadow-premium)] hero-pattern",
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-100">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[1.65rem]">{title}</h1>
          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-sky-50/95">{description}</p>
          )}
        </div>
        {children && <div className="shrink-0 sm:pt-1">{children}</div>}
      </div>
    </div>
  );
}
