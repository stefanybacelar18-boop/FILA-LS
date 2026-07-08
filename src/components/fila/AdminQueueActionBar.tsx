"use client";

import { MinutaSearchField } from "@/components/ui/MinutaSearchField";
import { Button } from "@/components/ui/Button";
import { RefreshIconButton } from "@/components/ui/RefreshIconButton";
import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";

export type AdminQueueFilter = "ativos" | "finalizados";

type AdminQueueActionBarProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  filter: AdminQueueFilter;
  onFilterChange: (filter: AdminQueueFilter) => void;
  aguardandoCount: number;
  finalizedCount: number;
  showChamarProximo: boolean;
  onChamarProximo?: () => void;
  saving?: boolean;
  className?: string;
};

/** Barra unificada — busca, atualizar, chamar próximo e filtros */
export function AdminQueueActionBar({
  searchQuery,
  onSearchChange,
  onRefresh,
  filter,
  onFilterChange,
  aguardandoCount,
  finalizedCount,
  showChamarProximo,
  onChamarProximo,
  saving = false,
  className,
}: AdminQueueActionBarProps) {
  return (
    <div className={cn("admin-action-bar", className)}>
      <MinutaSearchField
        value={searchQuery}
        onChange={onSearchChange}
        placeholder="Buscar minuta, placa, motorista ou transportadora…"
        className="admin-action-bar__search"
        id="admin-minuta-search"
      />

      <div className="admin-action-bar__actions">
        <RefreshIconButton onRefresh={onRefresh} label="Atualizar fila" />

        {showChamarProximo && onChamarProximo && (
          <Button
            variant="success"
            size="md"
            className="admin-action-bar__cta shrink-0"
            disabled={saving}
            onClick={onChamarProximo}
          >
            <Zap className="h-4 w-4" />
            Chamar próximo
          </Button>
        )}

        <div className="admin-action-bar__filters" role="group" aria-label="Filtros da fila">
          <button
            type="button"
            className={cn(
              "admin-filter-chip",
              filter === "ativos" && "admin-filter-chip--active"
            )}
            aria-pressed={filter === "ativos"}
            onClick={() => onFilterChange("ativos")}
          >
            Aguardando
            <span className="admin-filter-chip__count">{aguardandoCount}</span>
          </button>
          <button
            type="button"
            className={cn(
              "admin-filter-chip",
              filter === "finalizados" && "admin-filter-chip--active"
            )}
            aria-pressed={filter === "finalizados"}
            onClick={() => onFilterChange("finalizados")}
          >
            Finalizados
            <span className="admin-filter-chip__count">{finalizedCount}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
