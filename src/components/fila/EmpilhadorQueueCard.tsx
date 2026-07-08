"use client";

import { memo } from "react";
import type { QueueEntry } from "@/lib/types";
import { isDriverCalled, isActiveQueueStatus, isAusenteQueueStatus } from "@/lib/queue";
import { entryHasPrioridade } from "@/lib/queue-priorities";
import { entryRetornoRacksVazios } from "@/lib/queue-badges";
import { MinutaMetaBadge } from "@/components/fila/MinutaMetaBadge";
import { isNfVencida } from "@/lib/minuta-intelligence";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PrevisaoDisplay } from "@/components/fila/PrevisaoDisplay";
import { cn, getDriverFirstName } from "@/lib/utils";
import { Star, AlertTriangle } from "lucide-react";

function getCarretaPlaca(entry: QueueEntry): string {
  return entry.placa_carreta?.trim() || entry.placa?.trim() || "—";
}

type EmpilhadorQueueCardProps = {
  entry: QueueEntry;
  position: number;
  selected?: boolean;
  isNext?: boolean;
  onClick: () => void;
  /** Ajustes visuais para a lista admin em desktop */
  variant?: "default" | "admin";
};

/** Card da fila — layout em grade para celular do empilhador */
export const EmpilhadorQueueCard = memo(function EmpilhadorQueueCard({
  entry,
  position,
  selected = false,
  isNext = false,
  onClick,
  variant = "default",
}: EmpilhadorQueueCardProps) {
  const isAdmin = variant === "admin";
  const absent = isAusenteQueueStatus(entry.status);
  const active = isActiveQueueStatus(entry.status);
  const inactive = !active && !absent;
  const called = active && isDriverCalled(entry);
  const priority = entryHasPrioridade(entry);
  const racks = entryRetornoRacksVazios(entry);
  const firstName = getDriverFirstName(entry.nome);
  const hasMinutaMeta =
    (entry.volume_motos != null && entry.volume_motos > 0) || Boolean(entry.menor_vencimento);
  const hasFooterBadges = priority || called || racks;
  const hasPrevisao = Boolean(entry.previsao_descarregamento) && active;
  const hasCapacidadeAviso = Boolean(entry.capacidade_aviso) && active;
  const nfVencida = isNfVencida(entry.menor_vencimento) && active && !priority;
  const hasFooter = hasPrevisao || hasCapacidadeAviso || (hasFooterBadges && (active || isAdmin));

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border bg-white text-left transition active:scale-[0.995]",
        isAdmin ? "p-3.5 shadow-[var(--shadow-card)] lg:p-4" : "p-3 shadow-sm",
        selected && "border-brand/40 ring-2 ring-brand/15",
        !selected && isNext && "border-emerald-300 bg-emerald-50/30",
        !selected && !isNext && absent && "border-red-200/90 bg-red-50/40",
        !selected && !isNext && !absent && nfVencida && "border-red-200/80 bg-red-50/15",
        !selected && !isNext && !absent && priority && active && !nfVencida && "border-amber-200/80",
        !selected && !isNext && !absent && !priority && active && hasCapacidadeAviso && "border-amber-200/80 bg-amber-50/20",
        !selected && !isNext && !absent && !priority && active && !hasCapacidadeAviso && !nfVencida && "border-slate-200/90",
        !selected && inactive && isAdmin && "border-slate-200/70 bg-slate-50/60 opacity-90"
      )}
    >
      <div
        className={cn(
          "grid grid-cols-[2.5rem_1fr_auto] gap-x-3 gap-y-2",
          isAdmin && "lg:grid-cols-[3rem_1fr_auto] lg:gap-x-4"
        )}
      >
        <div
          className={cn(
            "row-span-2 flex items-center justify-center self-start rounded-lg font-bold tabular-nums",
            isAdmin ? "h-11 w-11 text-sm lg:h-12 lg:w-12" : "h-10 w-10 text-sm",
            absent && "bg-red-100 text-red-800",
            isNext && active && "bg-emerald-600 text-white",
            inactive && isAdmin && "bg-slate-100 text-slate-500",
            !isNext && !absent && !inactive && nfVencida && "bg-red-100 text-red-900",
            !isNext && !absent && !inactive && priority && active && !nfVencida && "bg-amber-100 text-amber-900",
            !isNext && !absent && !inactive && !priority && active && !nfVencida && "bg-slate-100 text-slate-600"
          )}
        >
          {position}
        </div>

        <div className="min-w-0">
          <p
            className={cn(
              "truncate font-bold leading-tight tracking-tight text-brand",
              isAdmin ? "text-lg lg:text-xl" : "text-lg"
            )}
          >
            {entry.minuta || "—"}
          </p>
          <p className="mt-0.5 font-mono text-sm font-medium leading-none tracking-wide text-slate-600">
            {getCarretaPlaca(entry)}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1 self-start">
          <StatusBadge status={entry.status} className="shrink-0" />
          {isNext && active && (
            <span className="text-[10px] font-bold uppercase text-emerald-700">Próximo</span>
          )}
          {absent && (
            <span className="text-[10px] font-semibold text-red-700">No topo · aguardando</span>
          )}
        </div>

        <div className={cn("col-span-2 min-w-0", isAdmin ? "space-y-1" : "space-y-1.5")}>
          <p className="truncate text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{firstName}</span>
            <span className="text-slate-400"> · </span>
            <span className="text-slate-500">{entry.transportadora || "—"}</span>
          </p>
          {hasMinutaMeta && (
            <MinutaMetaBadge
              compact
              staffView
              volumeMotos={entry.volume_motos}
              menorVencimento={entry.menor_vencimento}
            />
          )}
          {hasCapacidadeAviso && (
            <p className="flex items-start gap-1 text-xs font-semibold text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {entry.capacidade_aviso}
            </p>
          )}
        </div>
      </div>

      {hasFooter && (
        <div
          className={cn(
            "mt-2.5 border-t border-slate-100 pt-2.5",
            isAdmin && "flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"
          )}
        >
          {hasPrevisao && (
            <PrevisaoDisplay
              previsao={entry.previsao_descarregamento!}
              automatic={entry.previsao_automatica}
              compact={false}
              className={cn(
                "text-xs",
                isAdmin ? "w-full justify-start py-0 lg:flex-1" : "w-full justify-center py-1.5"
              )}
            />
          )}

          {hasFooterBadges && (active || isAdmin) && (
            <div
              className={cn(
                "flex flex-wrap gap-1.5",
                isAdmin && hasPrevisao && "lg:shrink-0 lg:justify-end"
              )}
            >
              {priority && active && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                  <Star className="h-3 w-3" aria-hidden />
                  {entry.prioridade_automatica ? "Prioridade NF" : "Prioridade"}
                </span>
              )}
              {called && (
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                  Chamado
                </span>
              )}
              {racks && (
                <span className="rounded-md bg-teal-100 px-2 py-0.5 text-[10px] font-bold uppercase text-teal-900">
                  Retorna racks
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </button>
  );
});
