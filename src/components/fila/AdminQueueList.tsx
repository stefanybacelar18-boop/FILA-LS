"use client";

import { useMemo } from "react";
import type { QueueEntry } from "@/lib/types";
import { compareQueueOrder } from "@/lib/queue";
import { AdminQueueCard } from "@/components/fila/AdminQueueCard";
import type { AdminQueueFilter } from "@/components/fila/AdminQueueActionBar";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

function matchesMinutaSearch(entry: QueueEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const minuta = (entry.minuta ?? "").toLowerCase();
  const placa = (entry.placa_carreta ?? entry.placa ?? "").toLowerCase();
  const motorista = (entry.nome ?? "").toLowerCase();
  const transportadora = (entry.transportadora ?? "").toLowerCase();
  return (
    minuta.includes(q) ||
    placa.includes(q) ||
    motorista.includes(q) ||
    transportadora.includes(q)
  );
}

type AdminQueueListProps = {
  operationalList: QueueEntry[];
  closedList: QueueEntry[];
  filter: AdminQueueFilter;
  selectedId: string | null;
  nextToCallId: string | null;
  searchQuery: string;
  onSelect: (entry: QueueEntry) => void;
  className?: string;
};

/** Lista desktop — exibe aguardando OU finalizados, nunca os dois juntos */
export function AdminQueueList({
  operationalList,
  closedList,
  filter,
  selectedId,
  nextToCallId,
  searchQuery,
  onSelect,
  className,
}: AdminQueueListProps) {
  const onFinalizados = filter === "finalizados";

  const { entries, positions } = useMemo(() => {
    const source = onFinalizados ? closedList : operationalList;
    const filtered = searchQuery.trim()
      ? source.filter((entry) => matchesMinutaSearch(entry, searchQuery))
      : source;
    const sorted = [...filtered].sort(compareQueueOrder);
    const positionMap = new Map<string, number>();
    sorted.forEach((entry, index) => positionMap.set(entry.id, index + 1));
    return { entries: sorted, positions: positionMap };
  }, [operationalList, closedList, searchQuery, onFinalizados]);

  const hasSearch = searchQuery.trim().length > 0;

  return (
    <div className={cn("admin-queue-list", className)}>
      {entries.length === 0 ? (
        <Card className="admin-queue-list__empty">
          <p className="text-sm text-slate-500">
            {hasSearch
              ? "Nenhuma minuta encontrada para esta busca."
              : onFinalizados
                ? "Nenhuma minuta finalizada no histórico carregado."
                : "Nenhum veículo aguardando na fila."}
          </p>
        </Card>
      ) : (
        <div className="admin-queue-list__items">
          {entries.map((entry) => (
            <AdminQueueCard
              key={entry.id}
              entry={entry}
              position={positions.get(entry.id) ?? 0}
              selected={selectedId === entry.id}
              isNext={!onFinalizados && entry.id === nextToCallId}
              onClick={() => onSelect(entry)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
