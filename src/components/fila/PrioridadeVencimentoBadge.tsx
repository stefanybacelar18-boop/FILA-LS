import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";

const LABEL = "Em vencimento";

export function getPrioridadeVencimentoLabel(): string {
  return LABEL;
}

export function PrioridadeVencimentoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900",
        className
      )}
      title="Subiu na fila por vencimento da NF"
    >
      <Zap className="h-3 w-3 shrink-0 text-amber-600" aria-hidden />
      {LABEL}
    </span>
  );
}
