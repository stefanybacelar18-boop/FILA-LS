import { getStatusColor, getStatusLabel, getStatusShortLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

const statusDot: Record<string, string> = {
  aguardando_descarregamento: "bg-brand",
  ausente: "bg-orange-500",
  finalizado: "bg-emerald-500",
};

export function StatusBadge({
  status,
  className,
  compact = false,
}: {
  status: string;
  className?: string;
  compact?: boolean;
}) {
  const dot = statusDot[status] ?? "bg-slate-400";
  const label = compact ? getStatusShortLabel(status) : getStatusLabel(status);

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border font-medium leading-snug",
        compact ? "px-2 py-0.5 text-[10px]" : "rounded-md px-2 py-0.5 text-[11px]",
        getStatusColor(status),
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}
