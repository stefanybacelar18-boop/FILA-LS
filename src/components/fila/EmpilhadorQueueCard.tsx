"use client";

import type { QueueEntry } from "@/lib/types";
import { isDriverCalled, isActiveQueueStatus } from "@/lib/queue";
import { entryHasPrioridade } from "@/lib/queue-priorities";
import { entryRetornoRacksVazios } from "@/lib/queue-badges";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PrevisaoDisplay } from "@/components/fila/PrevisaoDisplay";
import { cn } from "@/lib/utils";
import { Star, MapPin } from "lucide-react";

type EmpilhadorQueueCardProps = {
  entry: QueueEntry;
  position: number;
  selected?: boolean;
  isNext?: boolean;
  onClick: () => void;
};

/** Card da fila — layout em grade para celular do empilhador */
export function EmpilhadorQueueCard({
  entry,
  position,
  selected = false,
  isNext = false,
  onClick,
}: EmpilhadorQueueCardProps) {
  const active = isActiveQueueStatus(entry.status);
  const called = active && isDriverCalled(entry);
  const priority = entryHasPrioridade(entry);
  const racks = entryRetornoRacksVazios(entry);
  const firstName = entry.nome.split(" ")[0];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border bg-white p-3 text-left shadow-sm transition active:scale-[0.995]",
        selected && "border-brand/40 ring-2 ring-brand/15",
        !selected && isNext && "border-emerald-300 bg-emerald-50/30",
        !selected && !isNext && priority && active && "border-amber-200/80",
        !selected && !isNext && !priority && active && "border-slate-200/90",
        !active && "border-slate-200/70 bg-slate-50/60"
      )}
    >
      <div className="grid grid-cols-[2.5rem_1fr_auto] gap-x-3 gap-y-2">
        <div
          className={cn(
            "row-span-2 flex h-10 w-10 items-center justify-center self-start rounded-lg text-sm font-bold tabular-nums",
            isNext && active && "bg-emerald-600 text-white",
            !isNext && priority && active && "bg-amber-100 text-amber-900",
            !isNext && !priority && active && "bg-slate-100 text-slate-600",
            !active && "bg-slate-200/70 text-slate-500"
          )}
        >
          {position}
        </div>

        <div className="min-w-0">
          <p className="truncate text-base font-bold leading-tight text-brand">
            {entry.minuta || "—"}
          </p>
          <p className="mt-0.5 font-mono text-lg font-bold leading-none tracking-wide text-slate-900">
            {entry.placa_cavalo || entry.placa}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={entry.status} className="shrink-0" />
          {isNext && active && (
            <span className="text-[10px] font-bold uppercase text-emerald-700">Próximo</span>
          )}
        </div>

        <div className="col-span-2 min-w-0">
          <p className="truncate text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{firstName}</span>
            <span className="text-slate-400"> · </span>
            <span className="text-slate-500">{entry.transportadora}</span>
          </p>
        </div>
      </div>

      {entry.previsao_descarregamento && (
        <div className="mt-2.5 border-t border-slate-100 pt-2.5">
          <PrevisaoDisplay
            previsao={entry.previsao_descarregamento}
            automatic={entry.previsao_automatica}
            compact={false}
            className="w-full justify-center py-1.5 text-xs"
          />
        </div>
      )}

      {(priority || called || racks || (entry.volume_motos != null && entry.volume_motos > 0)) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {priority && active && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
              <Star className="h-3 w-3" aria-hidden />
              Prioridade
            </span>
          )}
          {called && entry.doca && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
              <MapPin className="h-3 w-3" aria-hidden />
              {entry.doca}
            </span>
          )}
          {called && !entry.doca && (
            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
              Chamado
            </span>
          )}
          {racks && (
            <span className="rounded-md bg-teal-100 px-2 py-0.5 text-[10px] font-bold uppercase text-teal-900">
              Retorna racks
            </span>
          )}
          {entry.volume_motos != null && entry.volume_motos > 0 && (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              {entry.volume_motos} motos
            </span>
          )}
        </div>
      )}
    </button>
  );
}
