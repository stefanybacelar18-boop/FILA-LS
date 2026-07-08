"use client";

import { memo } from "react";
import type { QueueEntry } from "@/lib/types";
import { isActiveQueueStatus } from "@/lib/queue";
import { PrevisaoDisplay } from "@/components/fila/PrevisaoDisplay";
import { PrioridadeVencimentoBadge } from "@/components/fila/PrioridadeVencimentoBadge";
import { shouldShowEmVencimentoBadge } from "@/lib/queue-vencimento-badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

type MotoristaQueueCardProps = {
  entry: QueueEntry;
  position: number;
  isMine?: boolean;
  showDriverName?: boolean;
  showStatus?: boolean;
  emVencimento?: boolean;
  minimal?: boolean;
};

/** Card somente leitura — minuta e status */
export const MotoristaQueueCard = memo(function MotoristaQueueCard({
  entry,
  position,
  isMine = false,
  showDriverName = false,
  showStatus = false,
  emVencimento = false,
  minimal = false,
}: MotoristaQueueCardProps) {
  const active = isActiveQueueStatus(entry.status);
  const showPrevisao = !minimal && active && Boolean(entry.previsao_descarregamento);
  const prioridadeVencimento = emVencimento || shouldShowEmVencimentoBadge(entry);
  const showMineRow = !minimal && ((showDriverName && isMine) || isMine);

  if (minimal) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border px-3 py-2.5",
          isMine
            ? "border-brand/35 bg-brand-muted/25 ring-1 ring-brand/20"
            : "border-slate-200/90 bg-white",
          prioridadeVencimento && !isMine && "border-red-200/80"
        )}
      >
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums",
            isMine && "bg-brand text-white",
            !isMine && prioridadeVencimento && "bg-red-50 text-red-900",
            !isMine && !prioridadeVencimento && "bg-slate-100 text-slate-600"
          )}
        >
          {position}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-brand">{entry.minuta || "—"}</p>
          {prioridadeVencimento && !isMine && (
            <PrioridadeVencimentoBadge className="mt-1 w-fit max-w-full scale-90 origin-left" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border bg-white p-3 text-left shadow-sm",
        prioridadeVencimento && !isMine && "border-red-200/90",
        isMine && "border-brand/40 bg-brand-muted/30 ring-2 ring-brand/15",
        isMine && prioridadeVencimento && "border-red-300/80"
      )}
    >
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 self-start items-center justify-center rounded-xl text-sm font-bold tabular-nums",
          prioridadeVencimento && !isMine && "bg-red-100 text-red-900",
          isMine && "bg-brand text-white shadow-sm",
          !isMine && !prioridadeVencimento && "bg-slate-100 text-slate-600"
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
          {showStatus && (
            <StatusBadge status={entry.status} compact className="mt-0.5 shrink-0" />
          )}
        </div>

        {(prioridadeVencimento || showPrevisao) && (
          <div className="flex flex-col gap-1.5">
            {prioridadeVencimento && (
              <PrioridadeVencimentoBadge className="w-fit max-w-full" />
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

        {showMineRow && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {showDriverName && isMine && (
              <p className="truncate text-sm font-semibold text-slate-800">
                {entry.nome?.trim() || "—"}
              </p>
            )}
            {isMine && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-brand">
                Você
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
