"use client";

import { useMemo } from "react";
import type { QueueEntry } from "@/lib/types";
import { compareQueueOrder } from "@/lib/queue";
import { EmpilhadorQueueCard } from "@/components/fila/EmpilhadorQueueCard";
import { MinutaSearchField } from "@/components/ui/MinutaSearchField";
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
  onSearchChange: (value: string) => void;
  onSelect: (entry: QueueEntry) => void;
  className?: string;
};

/** Lista desktop da fila admin — busca + seções operacional e finalizados */
export function AdminQueueList({
  operationalList,
  closedList,
  showClosed,
  selectedId,
  nextToCallId,
  searchQuery,
  onSearchChange,
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
    <div className={cn("space-y-4", className)}>
      <MinutaSearchField
        value={searchQuery}
        onChange={onSearchChange}
        placeholder="Buscar minuta, placa, motorista ou transportadora…"
      />

      {totalVisible === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-sm text-slate-500">
            {hasSearch
              ? "Nenhuma minuta encontrada para esta busca."
              : "Nenhum veículo aguardando na fila."}
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          {operational.length > 0 && (
            <section>
              {showClosed && (
                <p className="section-eyebrow mb-2.5">Fila do pátio</p>
              )}
              <div className="space-y-2.5">
                {operational.map((entry) => (
                  <EmpilhadorQueueCard
                    key={entry.id}
                    entry={entry}
                    position={operationalPositions.get(entry.id) ?? 0}
                    selected={selectedId === entry.id}
                    isNext={entry.id === nextToCallId}
                    onClick={() => onSelect(entry)}
                    variant="admin"
                  />
                ))}
              </div>
            </section>
          )}

          {showClosed && closed.length > 0 && (
            <section>
              <p className="section-eyebrow mb-2.5">Finalizados</p>
              <div className="space-y-2.5">
                {closed.map((entry) => (
                  <EmpilhadorQueueCard
                    key={entry.id}
                    entry={entry}
                    position={operational.length + (closedPositions.get(entry.id) ?? 0)}
                    selected={selectedId === entry.id}
                    isNext={false}
                    onClick={() => onSelect(entry)}
                    variant="admin"
                  />
                ))}
              </div>
            </section>
          )}

          {showClosed && closed.length === 0 && operational.length > 0 && !hasSearch && (
            <Card className="py-6 text-center">
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
