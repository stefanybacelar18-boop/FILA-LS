"use client";

import { useMemo } from "react";
import type { QueueEntry } from "@/lib/types";
import { compareQueueOrder } from "@/lib/queue";
import { filterOperationalPanelEntries } from "@/lib/constants";
import { MotoristaQueueCard } from "@/components/motorista/MotoristaQueueCard";
import { ListOrdered } from "lucide-react";

type MotoristaQueueListProps = {
  entries: QueueEntry[];
  highlightId?: string;
  title?: string;
};

/** Lista da fila para motorista — somente leitura, minuta e placa */
export function MotoristaQueueList({
  entries,
  highlightId,
  title = "Fila de descarga",
}: MotoristaQueueListProps) {
  const sorted = useMemo(() => {
    const operational = filterOperationalPanelEntries(entries);
    return [...operational].sort(compareQueueOrder);
  }, [entries]);

  const positionById = useMemo(() => {
    const map = new Map<string, number>();
    sorted.forEach((entry, index) => {
      map.set(entry.id, index + 1);
    });
    return map;
  }, [sorted]);

  return (
    <section className="overflow-hidden rounded-card border border-slate-200/90 bg-white shadow-[var(--shadow-card)]">
      <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3.5">
        <h2 className="flex items-center gap-2 text-base font-bold text-brand">
          <ListOrdered className="h-5 w-5 shrink-0" aria-hidden />
          {title}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {sorted.length}{" "}
          {sorted.length === 1 ? "minuta na fila" : "minutas na fila"} · ordem operacional
        </p>
      </div>

      {sorted.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">
          Nenhuma minuta ativa na fila agora.
        </p>
      ) : (
        <div className="space-y-2 p-3">
          {sorted.map((entry) => (
            <MotoristaQueueCard
              key={entry.id}
              entry={entry}
              position={positionById.get(entry.id) ?? 0}
              isMine={entry.id === highlightId}
            />
          ))}
        </div>
      )}
    </section>
  );
}
