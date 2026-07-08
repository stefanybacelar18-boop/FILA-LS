"use client";

import { MinutaSearchField } from "@/components/ui/MinutaSearchField";
import { Button } from "@/components/ui/Button";
import { RefreshIconButton } from "@/components/ui/RefreshIconButton";
import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";

type AdminQueueActionBarProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  showFinalizados: boolean;
  onShowFinalizadosChange: (value: boolean) => void;
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
  showFinalizados,
  onShowFinalizadosChange,
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
              !showFinalizados && "admin-filter-chip--active"
            )}
            aria-pressed={!showFinalizados}
            onClick={() => onShowFinalizadosChange(false)}
          >
            Ativos
          </button>
          <button
            type="button"
            className={cn(
              "admin-filter-chip",
              showFinalizados && "admin-filter-chip--active"
            )}
            aria-pressed={showFinalizados}
            onClick={() => onShowFinalizadosChange(true)}
          >
            + Finalizados
          </button>
        </div>
      </div>
    </div>
  );
}
