import { cn } from "@/lib/utils";
import { formatVencimentoLabel, daysUntilVencimento } from "@/lib/minuta-intelligence";
import { Bike } from "lucide-react";

export function MinutaMetaBadge({
  volumeMotos,
  menorVencimento,
  compact = false,
  className,
}: {
  volumeMotos?: number | null;
  menorVencimento?: string | null;
  compact?: boolean;
  className?: string;
}) {
  if (volumeMotos == null && !menorVencimento) return null;

  const vencLabel = formatVencimentoLabel(menorVencimento);
  const days = daysUntilVencimento(menorVencimento);
  const urgent = days === 1;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {volumeMotos != null && volumeMotos > 0 && (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-md bg-slate-100 font-medium text-slate-600",
            compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
          )}
        >
          <Bike className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
          {volumeMotos} motos
        </span>
      )}
      {vencLabel && (
        <span
          className={cn(
            "rounded-md font-medium",
            urgent ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-500",
            compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
          )}
        >
          {vencLabel}
        </span>
      )}
    </div>
  );
}
