import type { EstoqueCapacitySummary } from "@/lib/estoque-capacity-summary";
import { cn } from "@/lib/utils";

type QueueAdminSummaryStripProps = {
  waiting: number;
  finalized: number;
  absent: number;
  estoqueSummary?: EstoqueCapacitySummary | null;
  className?: string;
};

function KpiCard({
  value,
  label,
  className,
}: {
  value: string | number;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("admin-kpi-card", className)}>
      <p className="admin-kpi-card__value tabular-nums">{value}</p>
      <p className="admin-kpi-card__label">{label}</p>
    </div>
  );
}

/** Dashboard superior — indicadores uniformes e discretos */
export function QueueAdminSummaryStrip({
  waiting,
  finalized,
  absent,
  estoqueSummary,
  className,
}: QueueAdminSummaryStripProps) {
  const estoqueLabel =
    estoqueSummary && estoqueSummary.capacidade > 0
      ? `${estoqueSummary.pctOcupado}%`
      : "—";

  return (
    <div
      className={cn("admin-kpi-grid", className)}
      role="status"
      aria-label={`${waiting} aguardando, ${finalized} finalizados hoje, ${absent} ausentes`}
    >
      <KpiCard value={waiting} label="Aguardando" />
      <KpiCard value={finalized} label="Finalizados hoje" />
      <KpiCard value={absent} label="Ausentes" />
      <KpiCard
        value={estoqueLabel}
        label="Estoque ocupado"
        className={estoqueSummary ? undefined : "opacity-60"}
      />
    </div>
  );
}
