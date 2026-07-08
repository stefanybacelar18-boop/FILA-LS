"use client";

import { useMemo } from "react";
import type { QueueEntry } from "@/lib/types";
import { compareQueueOrder } from "@/lib/queue";
import { EmpilhadorQueueCard } from "@/components/fila/EmpilhadorQueueCard";
import { MinutaSearchField } from "@/components/ui/MinutaSearchField";

type EmpilhadorQueueListProps = {
  entries: QueueEntry[];
  selectedId?: string | null;
  nextToCallId?: string | null;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  onSelect: (entry: QueueEntry) => void;
  showSearch?: boolean;
};

function matchesMinutaSearch(entry: QueueEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const minuta = (entry.minuta ?? "").toLowerCase();
  const placa = (entry.placa_carreta ?? entry.placa ?? "").toLowerCase();
  return minuta.includes(q) || placa.includes(q);
}

/** Lista da fila do empilhador — padrão motorista com busca */
export function EmpilhadorQueueList({
  entries,
  selectedId,
  nextToCallId,
  searchQuery = "",
  onSearchChange,
  onSelect,
  showSearch = true,
}: EmpilhadorQueueListProps) {
  const { sorted, positionById } = useMemo(() => {
    const filtered = searchQuery.trim()
      ? entries.filter((entry) => matchesMinutaSearch(entry, searchQuery))
      : entries;
    const sortedEntries = [...filtered].sort(compareQueueOrder);
    const positionMap = new Map<string, number>();
    sortedEntries.forEach((entry, index) => {
      positionMap.set(entry.id, index + 1);
    });
    return { sorted: sortedEntries, positionById: positionMap };
  }, [entries, searchQuery]);

  return (
    <div className="space-y-3">
      {showSearch && onSearchChange && (
        <MinutaSearchField
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Buscar minuta ou placa…"
        />
      )}

      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          {searchQuery.trim() ? "Nenhuma minuta encontrada." : "Fila vazia no momento."}
        </p>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((entry) => (
            <EmpilhadorQueueCard
              key={entry.id}
              entry={entry}
              position={positionById.get(entry.id) ?? 0}
              selected={selectedId === entry.id}
              isNext={entry.id === nextToCallId}
              onClick={() => onSelect(entry)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
