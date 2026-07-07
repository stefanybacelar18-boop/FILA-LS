import { cn } from "@/lib/utils";
import { Star } from "lucide-react";

const LABEL = "Em vencimento";

export function getPrioridadeVencimentoLabel(): string {
  return LABEL;
}

/** Mesmo estilo do badge de prioridade no painel empilhador/admin. */
export function PrioridadeVencimentoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900",
        className
      )}
      title="Subiu na fila por prioridade de vencimento da NF"
    >
      <Star className="h-3 w-3 shrink-0" aria-hidden />
      {LABEL}
    </span>
  );
}
