import type { EstoqueCapacitySummary } from "@/lib/estoque-capacity-summary";
import { EstoqueCapacityGauge } from "@/components/fila/EstoqueCapacityGauge";
import { cn } from "@/lib/utils";

export type EmpilhadorFilaFilter = "aguardando" | "finalizadas";

type EmpilhadorQueueSummaryProps = {
  filter: EmpilhadorFilaFilter;
  aguardandoCount: number;
  operationalCount: number;
  finalizedCount: number;
  absentCount: number;
  onFilterChange: (filter: EmpilhadorFilaFilter) => void;
  trailing?: React.ReactNode;
  estoqueSummary: EstoqueCapacitySummary | null;
  className?: string;
};

function StatCell({
  active,
  interactive,
  onClick,
  children,
  label,
}: {
  active: boolean;
  interactive: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  label: string;
}) {
  const className = cn(
    "stat-strip__cell",
    active && "stat-strip__cell--active",
    interactive && !active && "stat-strip__cell--action"
  );

  if (interactive && !active && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
        aria-label={label}
        aria-pressed={active}
      >
        {children}
      </button>
    );
  }

  return (
    <div className={className} aria-current={active ? "true" : undefined}>
      {children}
    </div>
  );
}

/** Cabeçalho — stat-strip clicável para alternar fila ativa e finalizadas */
export function EmpilhadorQueueSummary({
  filter,
  aguardandoCount,
  operationalCount,
  finalizedCount,
  absentCount,
  onFilterChange,
  trailing,
  estoqueSummary,
  className,
}: EmpilhadorQueueSummaryProps) {
  const showAbsent = absentCount > 0;
  const onFinalizadas = filter === "finalizadas";

  return (
    <div className={cn("mb-4 space-y-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Fila do pátio</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {onFinalizadas
              ? "Finalizadas no dia operacional"
              : `${operationalCount} veículo${operationalCount !== 1 ? "s" : ""} no pátio`}
          </p>
        </div>
        {trailing}
      </div>

      <div
        className="stat-strip"
        role="group"
        aria-label="Resumo e filtros da fila"
      >
        <StatCell
          active={!onFinalizadas}
          interactive={onFinalizadas}
          onClick={() => onFilterChange("aguardando")}
          label="Ver fila aguardando descarga"
        >
          <span className="stat-strip__value text-brand">{aguardandoCount}</span>
          <span className="stat-strip__label">Aguardando</span>
        </StatCell>

        {showAbsent && !onFinalizadas && (
          <div className="stat-strip__cell">
            <span className="stat-strip__value text-slate-600">{absentCount}</span>
            <span className="stat-strip__label">Ausente</span>
          </div>
        )}

        <StatCell
          active={onFinalizadas}
          interactive={!onFinalizadas}
          onClick={() => onFilterChange("finalizadas")}
          label="Ver minutas finalizadas hoje"
        >
          <span className="stat-strip__value text-emerald-700">{finalizedCount}</span>
          <span className="stat-strip__label">Finalizadas hoje</span>
        </StatCell>
      </div>

      {!onFinalizadas && estoqueSummary && (
        <EstoqueCapacityGauge summary={estoqueSummary} compact />
      )}
    </div>
  );
}
