"use client";

import { useMemo } from "react";
import type { QueueEntry } from "@/lib/types";
import { compareQueueOrder } from "@/lib/queue";
import { filterOperationalPanelEntries } from "@/lib/constants";
import { computeEmVencimentoEntryIds } from "@/lib/queue-vencimento-badge";
import { MotoristaQueueCard } from "@/components/motorista/MotoristaQueueCard";
import { PanelSection } from "@/components/ui/PanelSection";
import { MinutaSearchField } from "@/components/ui/MinutaSearchField";
import { ListOrdered } from "lucide-react";

type MotoristaQueueListProps = {
  entries: QueueEntry[];
  highlightId?: string;
  title?: string;
  showDriverName?: boolean;
  showStatus?: boolean;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  headerAction?: React.ReactNode;
  compact?: boolean;
  /** Motorista autenticado — só busca + lista, sem cabeçalho pesado */
  minimal?: boolean;
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
  headerAction,
  compact = false,
  minimal = false,
}: MotoristaQueueListProps) {
  const { emVencimentoIds, sorted, positionById, totalOperational } = useMemo(() => {
    const operational = filterOperationalPanelEntries(entries);
    const ordered = [...operational].sort(compareQueueOrder);
    const emVencimento = computeEmVencimentoEntryIds(entries);
    const positionMap = new Map<string, number>();
    ordered.forEach((entry, index) => {
      positionMap.set(entry.id, index + 1);
    });
    const filtered = searchQuery.trim()
      ? operational.filter((entry) => matchesMinutaSearch(entry, searchQuery))
      : operational;
    const sortedEntries = [...filtered].sort(compareQueueOrder);
    return {
      emVencimentoIds: emVencimento,
      sorted: sortedEntries,
      positionById: positionMap,
      totalOperational: operational.length,
    };
  }, [entries, searchQuery]);

  const description = compact
    ? `${totalOperational} ${totalOperational === 1 ? "minuta" : "minutas"} no pátio`
    : `${totalOperational} ${
        totalOperational === 1 ? "minuta na fila" : "minutas na fila"
      } · ordem operacional${
        showStatus || emVencimentoIds.size > 0
          ? " · Prioridade vencimento = NF com urgência na fila"
          : ""
      }`;

  const listBody =
    sorted.length === 0 ? (
      <p className="py-8 text-center text-sm text-slate-500">
        {searchQuery.trim() ? "Nenhuma minuta encontrada." : "Fila vazia no momento."}
      </p>
    ) : (
      <div className="space-y-1.5">
        {sorted.map((entry) => (
          <MotoristaQueueCard
            key={entry.id}
            entry={entry}
            position={positionById.get(entry.id) ?? 0}
            isMine={entry.id === highlightId}
            showDriverName={showDriverName}
            showStatus={showStatus}
            emVencimento={emVencimentoIds.has(entry.id)}
          />
        ))}
      </div>
    );

  if (minimal) {
    return (
      <div className="space-y-3">
        {onSearchChange && (
          <MinutaSearchField
            value={searchQuery}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
          />
        )}
        {listBody}
      </div>
    );
  }

  return (
    <PanelSection
      title={title}
      icon={ListOrdered}
      description={description}
      action={headerAction}
    >
      {onSearchChange && (
        <MinutaSearchField
          value={searchQuery}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          className="mb-3"
        />
      )}
      {listBody}
    </PanelSection>
  );
}
