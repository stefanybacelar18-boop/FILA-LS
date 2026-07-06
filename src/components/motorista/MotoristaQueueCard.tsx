"use client";

import { memo } from "react";
import type { QueueEntry } from "@/lib/types";
import { isActiveQueueStatus } from "@/lib/queue";
import { PrevisaoDisplay } from "@/components/fila/PrevisaoDisplay";
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
  return (
    <div
      className={cn(
        "w-full rounded-xl border bg-white p-3 text-left shadow-sm",
        isMine && "border-brand/40 bg-brand-muted/30 ring-2 ring-brand/15"
      )}
    >
      <div className="grid grid-cols-[2.5rem_1fr] gap-x-3 gap-y-1">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center self-start rounded-lg text-sm font-bold tabular-nums",
            isMine ? "bg-brand text-white" : "bg-slate-100 text-slate-600"
          )}
        >
          {position}
        </div>

        <div className="min-w-0">
          <p className="truncate text-lg font-bold leading-tight tracking-tight text-brand">
            {entry.minuta || "—"}
          </p>
          {showStatus && (
            <div className="mt-1.5">
              <StatusBadge status={entry.status} />
            </div>
          )}
          {showDriverName && isMine && (
            <p className="mt-1 truncate text-sm font-semibold text-slate-900">
              {entry.nome?.trim() || "—"}
            </p>
          )}
          {isMine && (
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-brand">Você</p>
          )}
        </div>
      </div>

      {isActiveQueueStatus(entry.status) && entry.previsao_descarregamento && (
        <div className="mt-2.5 border-t border-slate-100 pt-2.5">
          <PrevisaoDisplay
            previsao={entry.previsao_descarregamento}
            automatic={entry.previsao_automatica}
            compact={false}
            className="w-full justify-start text-xs"
          />
        </div>
      )}
    </div>
  );
});
