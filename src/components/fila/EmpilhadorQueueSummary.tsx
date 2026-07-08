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
  nextMinuta?: string | null;
  trailing?: React.ReactNode;
  estoqueSummary: EstoqueCapacitySummary | null;
  tabsSlot?: React.ReactNode;
  className?: string;
};

/** Resumo compacto da fila — sem hero azul; métricas organizadas no topo */
export function EmpilhadorQueueSummary({
  filter,
  aguardandoCount,
  operationalCount,
  finalizedCount,
  absentCount,
  nextMinuta,
  trailing,
  estoqueSummary,
  tabsSlot,
  className,
}: EmpilhadorQueueSummaryProps) {
  const showAbsent = absentCount > 0 && filter === "aguardando";

  return (
    <div className={cn("mb-4 space-y-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Fila do pátio</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {filter === "aguardando"
              ? `${operationalCount} veículo${operationalCount !== 1 ? "s" : ""} no pátio${
                  nextMinuta ? ` · próxima minuta ${nextMinuta}` : ""
                }`
              : `${finalizedCount} minuta${finalizedCount !== 1 ? "s" : ""} finalizada${
                  finalizedCount !== 1 ? "s" : ""
                } hoje`}
          </p>
        </div>
        {trailing}
      </div>

      {tabsSlot}

      <div
        className="stat-strip"
        role="status"
        aria-label={
          filter === "aguardando"
            ? `${aguardandoCount} aguardando descarga${showAbsent ? `, ${absentCount} ausentes` : ""}, ${finalizedCount} finalizadas hoje`
            : `${finalizedCount} finalizadas hoje`
        }
      >
        {filter === "aguardando" ? (
          <>
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
              <span className="stat-strip__label">Finalizadas</span>
            </div>
          </>
        ) : (
          <>
            <div className="stat-strip__cell">
              <span className="stat-strip__value text-emerald-700">{finalizedCount}</span>
              <span className="stat-strip__label">Finalizadas</span>
            </div>
            <div className="stat-strip__cell">
              <span className="stat-strip__value text-brand">{aguardandoCount}</span>
              <span className="stat-strip__label">Aguardando</span>
            </div>
            <div className="stat-strip__cell">
              <span className="stat-strip__value text-slate-600">{operationalCount}</span>
              <span className="stat-strip__label">No pátio</span>
            </div>
          </>
        )}
      </div>

      {filter === "aguardando" && estoqueSummary && (
        <EstoqueCapacityGauge summary={estoqueSummary} />
      )}
    </div>
  );
}
