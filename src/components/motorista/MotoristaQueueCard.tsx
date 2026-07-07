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
  /** Calculado na lista — prioridade ou subiu vs. ordem de check-in */
  emVencimento?: boolean;
};

/** Card somente leitura — minuta e status */
export const MotoristaQueueCard = memo(function MotoristaQueueCard({
  entry,
  position,
  isMine = false,
  showDriverName = false,
  showStatus = false,
  emVencimento = false,
}: MotoristaQueueCardProps) {
  const active = isActiveQueueStatus(entry.status);
  const showPrevisao = active && Boolean(entry.previsao_descarregamento);
  const prioridadeVencimento = emVencimento || shouldShowEmVencimentoBadge(entry);

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
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums",
          prioridadeVencimento && !isMine && "bg-red-100 text-red-900",
          isMine && "bg-brand text-white shadow-sm",
          !isMine && !prioridadeVencimento && "bg-slate-100 text-slate-600"
        )}
      >
        {position}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Minuta
            </p>
            <p className="truncate text-lg font-bold leading-tight tracking-tight text-brand">
              {entry.minuta || "—"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {prioridadeVencimento && <PrioridadeVencimentoBadge />}
            {showStatus && <StatusBadge status={entry.status} compact />}
          </div>
        </div>

        {(showDriverName && isMine) || isMine ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
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
        ) : null}

        {showPrevisao && (
          <div className="mt-2">
            <PrevisaoDisplay
              previsao={entry.previsao_descarregamento}
              automatic={entry.previsao_automatica}
              compact
            />
          </div>
        )}
      </div>
    </div>
  );
});
