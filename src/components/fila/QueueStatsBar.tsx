import { cn } from "@/lib/utils";
import { Clock, Megaphone, Layers } from "lucide-react";

type QueueStatsBarProps = {
  waiting: number;
  called: number;
  total?: number;
  className?: string;
};

export function QueueStatsBar({ waiting, called, total, className }: QueueStatsBarProps) {
  const items = [
    {
      label: "Aguardando",
      value: waiting,
      icon: Clock,
      tone: "amber" as const,
    },
    {
      label: "Chamados",
      value: called,
      icon: Megaphone,
      tone: "emerald" as const,
    },
    ...(total != null
      ? [
          {
            label: "Exibindo",
            value: total,
            icon: Layers,
            tone: "brand" as const,
          },
        ]
      : []),
  ];

  const tones = {
    amber: "border-amber-200/80 bg-amber-50/80 text-amber-900 [&_svg]:text-amber-600",
    emerald: "border-emerald-200/80 bg-emerald-50/80 text-emerald-900 [&_svg]:text-emerald-600",
    brand: "border-brand/15 bg-brand-muted/60 text-brand-dark [&_svg]:text-brand",
  };

  return (
    <div className={cn("grid gap-2 sm:grid-cols-3", className)}>
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
