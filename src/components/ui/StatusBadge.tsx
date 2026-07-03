import { getStatusColor, getStatusLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

const statusDot: Record<string, string> = {
  aguardando_descarregamento: "bg-amber-500",
  ausente: "bg-red-500",
  finalizado: "bg-slate-400",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const dot = statusDot[status] ?? "bg-slate-400";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
        getStatusColor(status),
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} aria-hidden />
      {getStatusLabel(status)}
    </span>
  );
}
