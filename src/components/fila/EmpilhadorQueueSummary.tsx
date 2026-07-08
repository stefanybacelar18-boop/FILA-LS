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

function buildStatusLine(
  filter: EmpilhadorTabId,
  aguardandoCount: number,
  operationalCount: number,
  finalizedCount: number,
  absentCount: number
): string {
  if (filter === "finalizadas") {
    return `${finalizedCount} finalizada${finalizedCount !== 1 ? "s" : ""} hoje`;
  }
  const parts = [`${aguardandoCount} aguardando`];
  if (absentCount > 0) {
    parts.push(`${absentCount} ausente${absentCount !== 1 ? "s" : ""}`);
  }
  parts.push(`${operationalCount} no pátio`);
  return parts.join(" · ");
}

/** Cabeçalho enxuto — sem hero azul e sem métricas duplicadas */
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
  return (
    <div className={cn("mb-4 space-y-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Fila do pátio</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {buildStatusLine(
              filter,
              aguardandoCount,
              operationalCount,
              finalizedCount,
              absentCount
            )}
          </p>
        </div>
        {trailing}
      </div>

      {tabsSlot}

      {filter === "aguardando" && estoqueSummary && (
        <EstoqueCapacityGauge summary={estoqueSummary} />
      )}
    </div>
  );
}
