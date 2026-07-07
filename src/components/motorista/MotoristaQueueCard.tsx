"use client";

import { memo } from "react";
import type { QueueEntry } from "@/lib/types";
import { isActiveQueueStatus } from "@/lib/queue";
import { PrevisaoDisplay } from "@/components/fila/PrevisaoDisplay";
import { PrioridadeVencimentoBadge } from "@/components/fila/PrioridadeVencimentoBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

type MotoristaQueueCardProps = {
  entry: QueueEntry;
  position: number;
  isMine?: boolean;
  /** Exibe nome do motorista — área logada do motorista */
  showDriverName?: boolean;
  /** Exibe badge de status (fila pública) */
  showStatus?: boolean;
};

/** Card somente leitura — minuta e status */
export const MotoristaQueueCard = memo(function MotoristaQueueCard({
  entry,
  position,
  isMine = false,
  showDriverName = false,
  showStatus = false,
}: MotoristaQueueCardProps) {
  const active = isActiveQueueStatus(entry.status);
  const showPrevisao = active && Boolean(entry.previsao_descarregamento);
  const prioridadeVencimento = active && Boolean(entry.prioridade_automatica);

  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border bg-white p-3 text-left shadow-sm",
        prioridadeVencimento && !isMine && "border-amber-200/90",
        isMine && "border-brand/40 bg-brand-muted/30 ring-2 ring-brand/15",
        isMine && prioridadeVencimento && "border-amber-300/80"
      )}
    >
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums",
          prioridadeVencimento && !isMine && "bg-amber-100 text-amber-900",
          isMine && "bg-brand text-white shadow-sm",
          !isMine && !prioridadeVencimento && "bg-slate-100 text-slate-600"
        )}
      >
        {position}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
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

        {prioridadeVencimento && (
          <div className="mt-1.5">
            <PrioridadeVencimentoBadge />
          </div>
        )}

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
