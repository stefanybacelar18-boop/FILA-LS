import type { EstoqueCapacitySummary } from "@/lib/estoque-capacity-summary";
import { EstoqueCapacityGauge } from "@/components/fila/EstoqueCapacityGauge";
import type { EmpilhadorTabId } from "@/components/fila/EmpilhadorQueueTabs";
import { cn } from "@/lib/utils";

type EmpilhadorQueueSummaryProps = {
  filter: EmpilhadorTabId;
  aguardandoCount: number;
  operationalCount: number;
  finalizedCount: number;
  absentCount: number;
  trailing?: React.ReactNode;
  estoqueSummary: EstoqueCapacitySummary | null;
  tabsSlot?: React.ReactNode;
  className?: string;
};

/** Cabeçalho enxuto com contadores de aguardando e finalizadas hoje */
export function EmpilhadorQueueSummary({
  filter,
  aguardandoCount,
  operationalCount,
  finalizedCount,
  absentCount,
  trailing,
  estoqueSummary,
  tabsSlot,
  className,
}: EmpilhadorQueueSummaryProps) {
  const showAbsent = absentCount > 0;

  return (
    <div className={cn("mb-4 space-y-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Fila do pátio</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {filter === "aguardando"
              ? `${operationalCount} veículo${operationalCount !== 1 ? "s" : ""} no pátio`
              : "Encerradas no dia operacional"}
          </p>
        </div>
        {trailing}
      </div>

      <div
        className="stat-strip"
        role="status"
        aria-label={`${aguardandoCount} aguardando descarga, ${finalizedCount} finalizadas hoje${
          showAbsent ? `, ${absentCount} ausentes` : ""
        }`}
      >
        <div className="stat-strip__cell">
          <span className="stat-strip__value text-brand">{aguardandoCount}</span>
          <span className="stat-strip__label">Aguardando</span>
        </div>
        {showAbsent && (
          <div className="stat-strip__cell">
            <span className="stat-strip__value text-slate-600">{absentCount}</span>
            <span className="stat-strip__label">Ausente</span>
          </div>
        )}
        <div className="stat-strip__cell">
          <span className="stat-strip__value text-emerald-700">{finalizedCount}</span>
          <span className="stat-strip__label">Finalizadas hoje</span>
        </div>
      </div>

      {tabsSlot}

      {filter === "aguardando" && estoqueSummary && (
        <EstoqueCapacityGauge summary={estoqueSummary} compact />
      )}
    </div>
  );
}
