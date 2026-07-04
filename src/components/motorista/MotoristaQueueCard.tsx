"use client";

import type { QueueEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

function getCarretaPlaca(entry: QueueEntry): string {
  return entry.placa_carreta?.trim() || entry.placa?.trim() || "—";
}

type MotoristaQueueCardProps = {
  entry: QueueEntry;
  position: number;
  isMine?: boolean;
};

/** Card somente leitura — minuta e placa, mesmo visual do empilhador */
export function MotoristaQueueCard({ entry, position, isMine = false }: MotoristaQueueCardProps) {
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
          <p className="mt-0.5 font-mono text-sm font-medium leading-none tracking-wide text-slate-600">
            {getCarretaPlaca(entry)}
          </p>
          {isMine && (
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-brand">Você</p>
          )}
        </div>
      </div>
    </div>
  );
}
