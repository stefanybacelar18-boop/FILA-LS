"use client";

import { useMemo } from "react";
import type { QueueEntry } from "@/lib/types";
import { compareQueueOrder } from "@/lib/queue";
import { AdminQueueCard } from "@/components/fila/AdminQueueCard";
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
  showClosed: boolean;
  selectedId: string | null;
  nextToCallId: string | null;
  searchQuery: string;
  onSelect: (entry: QueueEntry) => void;
  className?: string;
};

/** Lista desktop da fila admin — cards minimalistas */
export function AdminQueueList({
  operationalList,
  closedList,
  showClosed,
  selectedId,
  nextToCallId,
  searchQuery,
  onSelect,
  className,
}: AdminQueueListProps) {
  const { operational, closed, operationalPositions, closedPositions } = useMemo(() => {
    const filterList = (list: QueueEntry[]) => {
      const filtered = searchQuery.trim()
        ? list.filter((entry) => matchesMinutaSearch(entry, searchQuery))
        : list;
      const sorted = [...filtered].sort(compareQueueOrder);
      const positions = new Map<string, number>();
      sorted.forEach((entry, index) => positions.set(entry.id, index + 1));
      return { sorted, positions };
    };

    const op = filterList(operationalList);
    const cl = filterList(closedList);

    return {
      operational: op.sorted,
      closed: cl.sorted,
      operationalPositions: op.positions,
      closedPositions: cl.positions,
    };
  }, [operationalList, closedList, searchQuery]);

  const totalVisible = operational.length + (showClosed ? closed.length : 0);
  const hasSearch = searchQuery.trim().length > 0;

  return (
    <div className={cn("admin-queue-list", className)}>
      {totalVisible === 0 ? (
        <Card className="admin-queue-list__empty">
          <p className="text-sm text-slate-500">
            {hasSearch
              ? "Nenhuma minuta encontrada para esta busca."
              : "Nenhum veículo aguardando na fila."}
          </p>
        </Card>
      ) : (
        <div className="admin-queue-list__sections">
          {operational.length > 0 && (
            <section>
              {showClosed && (
                <p className="admin-queue-list__section-label">Fila do pátio</p>
              )}
              <div className="admin-queue-list__items">
                {operational.map((entry) => (
                  <AdminQueueCard
                    key={entry.id}
                    entry={entry}
                    position={operationalPositions.get(entry.id) ?? 0}
                    selected={selectedId === entry.id}
                    isNext={entry.id === nextToCallId}
                    onClick={() => onSelect(entry)}
                  />
                ))}
              </div>
            </section>
          )}

          {showClosed && closed.length > 0 && (
            <section>
              <p className="admin-queue-list__section-label">Finalizados</p>
              <div className="admin-queue-list__items">
                {closed.map((entry) => (
                  <AdminQueueCard
                    key={entry.id}
                    entry={entry}
                    position={operational.length + (closedPositions.get(entry.id) ?? 0)}
                    selected={selectedId === entry.id}
                    isNext={false}
                    onClick={() => onSelect(entry)}
                  />
                ))}
              </div>
            </section>
          )}

          {showClosed && closed.length === 0 && operational.length > 0 && !hasSearch && (
            <Card className="admin-queue-list__empty admin-queue-list__empty--compact">
              <p className="text-sm text-slate-500">
                Nenhuma minuta finalizada no histórico carregado.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
