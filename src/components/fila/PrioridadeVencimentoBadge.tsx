import { cn } from "@/lib/utils";
import { Star } from "lucide-react";

export const PRIORIDADE_VENCIMENTO_LABEL = "Prioridade vencimento";

export function getPrioridadeVencimentoLabel(): string {
  return PRIORIDADE_VENCIMENTO_LABEL;
}

/** Prioridade por vencimento da NF — destaque vermelho (diferente do status Ausente). */
export function PrioridadeVencimentoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase leading-tight text-red-800",
        className
      )}
      title="Esta minuta subiu na fila por prioridade de vencimento da NF"
    >
      <Star className="h-3 w-3 shrink-0 fill-red-500 text-red-500" aria-hidden />
      <span className="truncate">{PRIORIDADE_VENCIMENTO_LABEL}</span>
    </span>
  );
}
