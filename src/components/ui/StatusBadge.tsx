import { getStatusColor, getStatusLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

const statusDot: Record<string, string> = {
  aguardando_descarregamento: "bg-brand",
  ausente: "bg-orange-500",
  finalizado: "bg-emerald-500",
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
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-snug",
        getStatusColor(status),
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} aria-hidden />
      {getStatusLabel(status)}
    </span>
  );
}
