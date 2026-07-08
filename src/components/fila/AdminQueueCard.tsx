"use client";

import { memo } from "react";
import type { QueueEntry } from "@/lib/types";
import { isActiveQueueStatus } from "@/lib/queue";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn, formatPrevisaoDate } from "@/lib/utils";
import { Calendar } from "lucide-react";

function getCarretaPlaca(entry: QueueEntry): string {
  return entry.placa_carreta?.trim() || entry.placa?.trim() || "—";
}

type AdminQueueCardProps = {
  entry: QueueEntry;
  position: number;
  selected?: boolean;
  isNext?: boolean;
  onClick: () => void;
};

/** Card minimalista da fila admin — somente dados essenciais para scan rápido */
export const AdminQueueCard = memo(function AdminQueueCard({
  entry,
  position,
  selected = false,
  isNext = false,
  onClick,
}: AdminQueueCardProps) {
  const active = isActiveQueueStatus(entry.status);
  const previsao = entry.previsao_descarregamento?.trim();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={selected}
      className={cn(
        "admin-queue-card group w-full text-left transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
        selected && "admin-queue-card--selected",
        isNext && active && "admin-queue-card--next"
      )}
    >
      <span className="admin-queue-card__position tabular-nums">{position}</span>

      <div className="admin-queue-card__body min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold tracking-tight text-brand">
              {entry.minuta || "—"}
            </p>
            <p className="mt-0.5 font-mono text-sm text-slate-600">{getCarretaPlaca(entry)}</p>
          </div>
          <StatusBadge status={entry.status} compact className="shrink-0" />
        </div>

        <p className="mt-2 truncate text-sm text-slate-800">{entry.nome?.trim() || "—"}</p>
        <p className="truncate text-sm text-slate-500">{entry.transportadora?.trim() || "—"}</p>

        {previsao && (
          <p className="admin-queue-card__previsao mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <Calendar className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
            <span>
              Previsão {formatPrevisaoDate(previsao)}
              {entry.previsao_automatica && active && (
                <span className="text-slate-400"> · auto</span>
              )}
            </span>
          </p>
        )}
      </div>
    </button>
  );
});
