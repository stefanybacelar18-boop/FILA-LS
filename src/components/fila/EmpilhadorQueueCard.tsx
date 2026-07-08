"use client";

import { memo } from "react";
import type { QueueEntry } from "@/lib/types";
import { isDriverCalled, isActiveQueueStatus, isAusenteQueueStatus } from "@/lib/queue";
import { entryHasPrioridade } from "@/lib/queue-priorities";
import { entryRetornoRacksVazios } from "@/lib/queue-badges";
import { MinutaMetaBadge } from "@/components/fila/MinutaMetaBadge";
import { isNfVencidaOuVencendo } from "@/lib/minuta-intelligence";
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
  variant?: "default" | "admin";
};

/** Card mobile — espelha MotoristaQueueCard; detalhes no sheet ao tocar */
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
  const showPrevisao = Boolean(entry.previsao_descarregamento) && active;
  const hasCapacidadeAviso = Boolean(entry.capacidade_aviso) && active;
  const nfUrgente = active && isNfVencidaOuVencendo(entry.menor_vencimento);
  const hasFooter = showPrevisao || hasCapacidadeAviso || (hasFooterBadges && (active || isAdmin));

  if (!isAdmin) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "touch-target flex w-full gap-3 rounded-xl border bg-white p-3 text-left shadow-sm transition active:scale-[0.995]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25",
          "border-slate-200/90",
          selected && "border-brand/40 bg-brand-muted/30 ring-2 ring-brand/15",
          !selected && isNext && active && "border-brand/35 bg-brand-muted/25 ring-1 ring-brand/20",
          !selected && nfUrgente && "border-red-200/90 bg-red-50/25"
        )}
      >
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 self-start items-center justify-center rounded-xl text-sm font-bold tabular-nums",
            nfUrgente && "bg-red-100 text-red-900",
            !nfUrgente && isNext && active && "bg-brand text-white shadow-sm",
            !nfUrgente && !isNext && "bg-slate-100 text-slate-600"
          )}
        >
          {position}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Minuta
              </p>
              <p className="truncate text-lg font-bold leading-tight tracking-tight text-brand">
                {entry.minuta || "—"}
              </p>
            </div>
            <StatusBadge status={entry.status} compact className="mt-0.5 shrink-0" />
          </div>

          {(nfUrgente || showPrevisao) && (
            <div className="flex flex-col gap-1.5">
              {nfUrgente && (
                <MinutaMetaBadge compact staffView menorVencimento={entry.menor_vencimento} />
              )}
              {showPrevisao && (
                <PrevisaoDisplay
                  previsao={entry.previsao_descarregamento}
                  automatic={entry.previsao_automatica}
                  compact
                  className="w-fit max-w-full"
                />
              )}
            </div>
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "touch-target w-full rounded-xl border bg-white text-left transition active:scale-[0.995]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25",
        "p-3.5 shadow-[var(--shadow-card)] lg:p-4",
        selected && "border-brand/40 ring-2 ring-brand/15",
        !selected && isNext && "border-emerald-300 bg-emerald-50/30",
        !selected && !isNext && absent && "border-red-200/90 bg-red-50/40",
        !selected && !isNext && !absent && nfUrgente && "border-red-200/80 bg-red-50/15",
        !selected && !isNext && !absent && priority && active && !nfUrgente && "border-amber-200/80",
        !selected &&
          !isNext &&
          !absent &&
          !priority &&
          active &&
          hasCapacidadeAviso &&
          "border-amber-200/80 bg-amber-50/20",
        !selected &&
          !isNext &&
          !absent &&
          !priority &&
          active &&
          !hasCapacidadeAviso &&
          !nfUrgente &&
          "border-slate-200/90",
        !selected && inactive && "border-slate-200/70 bg-slate-50/60 opacity-90"
      )}
    >
      <div className="grid grid-cols-[2.5rem_1fr_auto] gap-x-3 gap-y-2 lg:grid-cols-[3rem_1fr_auto] lg:gap-x-4">
        <div
          className={cn(
            "row-span-2 flex h-11 w-11 items-center justify-center self-start rounded-lg text-sm font-bold tabular-nums lg:h-12 lg:w-12",
            absent && "bg-red-100 text-red-800",
            isNext && active && "bg-emerald-600 text-white",
            inactive && "bg-slate-100 text-slate-500",
            !isNext && !absent && !inactive && nfUrgente && "bg-red-100 text-red-900",
            !isNext && !absent && !inactive && priority && active && !nfUrgente && "bg-amber-100 text-amber-900",
            !isNext && !absent && !inactive && !priority && active && !nfUrgente && "bg-slate-100 text-slate-600"
          )}
        >
          {position}
        </div>

        <div className="min-w-0">
          <p className="truncate text-lg font-bold leading-tight tracking-tight text-brand lg:text-xl">
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
        </div>

        <div className="col-span-2 min-w-0 space-y-1">
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
        <div className="mt-2.5 flex flex-col gap-2 border-t border-slate-100 pt-2.5 lg:flex-row lg:items-center lg:justify-between">
          {showPrevisao && (
            <PrevisaoDisplay
              previsao={entry.previsao_descarregamento!}
              automatic={entry.previsao_automatica}
              compact={false}
              className="w-full justify-start py-0 text-xs lg:flex-1"
            />
          )}
          {hasFooterBadges && active && (
            <div
              className={cn(
                "flex flex-wrap gap-1.5",
                showPrevisao && "lg:shrink-0 lg:justify-end"
              )}
            >
              {priority && (
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
