import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type RegistryStat = {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: "brand" | "amber" | "emerald" | "slate";
};

const tones = {
  brand: "border-brand/15 bg-brand-muted/60 text-brand-dark [&_svg]:text-brand",
  amber: "border-amber-200/80 bg-amber-50/80 text-amber-900 [&_svg]:text-amber-600",
  emerald: "border-emerald-200/80 bg-emerald-50/80 text-emerald-900 [&_svg]:text-emerald-600",
  slate: "border-slate-200/80 bg-slate-50/90 text-slate-700 [&_svg]:text-slate-500",
};

export function RegistryStatsBar({
  items,
  className,
}: {
  items: RegistryStat[];
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {items.map(({ label, value, icon: Icon, tone }) => (
        <div
          key={label}
          className={cn(
            "flex items-center gap-3 rounded-xl border px-4 py-3",
            tones[tone]
          )}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide opacity-80">
              {label}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
