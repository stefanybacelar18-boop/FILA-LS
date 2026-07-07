"use client";

import { useMemo } from "react";
import type { QueueEntry } from "@/lib/types";
import { compareQueueOrder } from "@/lib/queue";
import { filterOperationalPanelEntries } from "@/lib/constants";
import { MotoristaQueueCard } from "@/components/motorista/MotoristaQueueCard";
import { Input } from "@/components/ui/Input";
import { ListOrdered, Search } from "lucide-react";

type MotoristaQueueListProps = {
  entries: QueueEntry[];
  highlightId?: string;
  title?: string;
  showDriverName?: boolean;
  showStatus?: boolean;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
};

function matchesMinutaSearch(entry: QueueEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (entry.minuta ?? "").toLowerCase().includes(q);
}

/** Lista da fila — somente leitura; finalizados não aparecem (saem ao encerrar). */
export function MotoristaQueueList({
  entries,
  highlightId,
  title = "Fila de descarregamento",
  showDriverName = false,
  showStatus = false,
  searchQuery = "",
  onSearchChange,
  searchPlaceholder = "Buscar minuta…",
}: MotoristaQueueListProps) {
  const sorted = useMemo(() => {
    const operational = filterOperationalPanelEntries(entries);
    const filtered = searchQuery.trim()
      ? operational.filter((entry) => matchesMinutaSearch(entry, searchQuery))
      : operational;
    return [...filtered].sort(compareQueueOrder);
  }, [entries, searchQuery]);

  const positionById = useMemo(() => {
    const operational = filterOperationalPanelEntries(entries);
    const ordered = [...operational].sort(compareQueueOrder);
    const map = new Map<string, number>();
    ordered.forEach((entry, index) => {
      map.set(entry.id, index + 1);
    });
    return map;
  }, [entries]);

  const totalOperational = useMemo(
    () => filterOperationalPanelEntries(entries).length,
    [entries]
  );

  return (
    <section className="overflow-hidden rounded-card border border-brand/12 bg-white shadow-[var(--shadow-card)]">
      <div className="border-b border-brand/8 bg-brand-muted/35 px-4 py-3.5">
        <h2 className="flex items-center gap-2 text-base font-bold text-brand">
          <ListOrdered className="h-5 w-5 shrink-0" aria-hidden />
          {title}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {totalOperational}{" "}
          {totalOperational === 1 ? "minuta na fila" : "minutas na fila"} · ordem operacional
          {showStatus && (
            <span className="text-slate-400">
              {" "}
              · <span className="text-amber-800">Em vencimento</span> = subiu por prioridade da NF
            </span>
          )}
        </p>
        {onSearchChange && (
          <div className="relative mt-3">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
              aria-label="Buscar minuta"
            />
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">
          {searchQuery.trim()
            ? "Nenhuma minuta encontrada para essa busca."
            : "Nenhuma minuta ativa na fila agora."}
        </p>
      ) : (
        <div className="space-y-1.5 p-3">
          {sorted.map((entry) => (
            <MotoristaQueueCard
              key={entry.id}
              entry={entry}
              position={positionById.get(entry.id) ?? 0}
              isMine={entry.id === highlightId}
              showDriverName={showDriverName}
              showStatus={showStatus}
            />
          ))}
        </div>
      )}
    </section>
  );
}
