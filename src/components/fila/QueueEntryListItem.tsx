"use client";

import type { QueueEntry } from "@/lib/types";
import { isDriverCalled, isActiveQueueStatus } from "@/lib/queue";
import { entryHasPrioridade } from "@/lib/queue-priorities";
import { entryRetornoRacksVazios } from "@/lib/queue-badges";
import { QueueEntryBadges } from "@/components/fila/QueueEntryBadges";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RacksVaziosBadge } from "@/components/fila/RacksVaziosBadge";
import { cn } from "@/lib/utils";
import { Megaphone, Star } from "lucide-react";

type QueueEntryListItemProps = {
  entry: QueueEntry;
  position: number;
  selected?: boolean;
  isNext?: boolean;
  variant?: "admin" | "mobile";
  onClick: () => void;
};

export function QueueEntryListItem({
  entry,
  position,
  selected = false,
  isNext = false,
  variant = "admin",
  onClick,
}: QueueEntryListItemProps) {
  const active = isActiveQueueStatus(entry.status);
  const called = active && isDriverCalled(entry);
  const priority = entryHasPrioridade(entry);
  const isMobile = variant === "mobile";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full rounded-[var(--radius-card)] border text-left transition duration-150",
        "shadow-sm hover:shadow-[var(--shadow-card)] active:scale-[0.995]",
        isMobile ? "p-3.5 min-h-[4.75rem]" : "p-4",
        selected && "border-brand/50 bg-brand-muted/50 ring-2 ring-brand/20 shadow-[var(--shadow-card)]",
        !selected && isNext && active && "border-emerald-300/80 bg-emerald-50/40 ring-1 ring-emerald-200/60",
        !selected && !isNext && priority && active && "border-amber-200/90 bg-amber-50/40",
        !selected && !isNext && !priority && active && "border-slate-200/90 bg-white hover:border-slate-300",
        !selected && !active && "border-slate-200/70 bg-slate-50/80 opacity-90"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl font-bold tabular-nums",
            isMobile ? "h-11 w-11 text-sm" : "h-10 w-10 text-xs",
            isNext && active && "bg-emerald-600 text-white shadow-sm",
            !isNext && priority && active && "bg-amber-100 text-amber-900",
            !isNext && !priority && active && "bg-slate-100 text-slate-600",
            !active && "bg-slate-200/80 text-slate-500"
          )}
          aria-label={`Posição ${position}`}
        >
          {position}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold tracking-tight text-brand">
              {entry.minuta || "—"}
            </span>
            {priority && active && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                <Star className="h-3 w-3" aria-hidden />
                Prioridade
              </span>
            )}
            {entryRetornoRacksVazios(entry) && <RacksVaziosBadge />}
            {isNext && active && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                Próximo
              </span>
            )}
          </div>

          <p className="mt-0.5 font-mono text-[15px] font-semibold leading-tight text-slate-900 sm:text-sm">
            {entry.placa_cavalo || entry.placa}
            <span className="ml-2 font-sans text-sm font-normal text-slate-500">
              {entry.nome.split(" ")[0]}
            </span>
          </p>

          <QueueEntryBadges
            entry={entry}
            compact
            showRacks={false}
            layout="inline"
            className="mt-1.5"
          />
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={entry.status} />
          {called && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              <Megaphone className="h-3 w-3" aria-hidden />
              {entry.doca ? entry.doca : "Chamado"}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
