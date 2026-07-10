import { cn } from "@/lib/utils";
import {
  formatVencimentoLabel,
  daysUntilVencimento,
  isNfVencida,
} from "@/lib/minuta-intelligence";
import { AlertTriangle, Bike } from "lucide-react";

export function MinutaMetaBadge({
  volumeMotos,
  menorVencimento,
  volumeEstimado = false,
  compact = false,
  className,
  /** Destaque operacional (empilhador/admin): NF vencida ou vencendo em vermelho. */
  staffView = false,
}: {
  volumeMotos?: number | null;
  menorVencimento?: string | null;
  /** Volume veio da média (62), minuta ainda não importada. */
  volumeEstimado?: boolean;
  compact?: boolean;
  className?: string;
  staffView?: boolean;
}) {
  const showVolume = volumeMotos != null && volumeMotos > 0;
  const showEstimado = staffView && volumeEstimado;
  if (!showVolume && !menorVencimento && !showEstimado) return null;

  const vencLabel = formatVencimentoLabel(menorVencimento);
  const days = daysUntilVencimento(menorVencimento);
  const vencida = staffView && isNfVencida(menorVencimento);
  const vencendo = staffView && !vencida && days != null && days >= 0 && days <= 1;
  const nfUrgente = vencida || vencendo;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {showEstimado && (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 font-semibold text-amber-900",
            compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
          )}
          title="Minuta sem importação da ConsultaGeral — volume médio 62 usado no estoque"
        >
          <AlertTriangle className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
          Sem importação
        </span>
      )}
      {showVolume && (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md font-semibold tabular-nums",
            volumeEstimado
              ? "border border-amber-200 bg-amber-50 text-amber-900"
              : "bg-slate-100 text-slate-700",
            compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
          )}
          title={
            volumeEstimado
              ? `${volumeMotos} motos (média estimada — importe a ConsultaGeral)`
              : `${volumeMotos} motos`
          }
        >
          <Bike className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden />
          {volumeMotos}
          {volumeEstimado ? " · média" : ""}
        </span>
      )}
      {vencLabel && (
        <span
          className={cn(
            "rounded-md font-medium",
            nfUrgente && "border border-red-200 bg-red-50 font-semibold text-red-800",
            !nfUrgente && "bg-slate-50 text-slate-500",
            compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
          )}
          title={
            vencida
              ? "NF vencida — sem prioridade automática; admin pode definir prioridade manual"
              : vencendo
                ? "NF vence em breve — prioridade na fila"
                : undefined
          }
        >
          {vencLabel}
        </span>
      )}
    </div>
  );
}
