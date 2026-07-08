import type { EstoqueCapacitySummary } from "@/lib/estoque-capacity-summary";
import { QueuePositionHero } from "@/components/ui/PageHeader";
import { EstoqueCapacityGauge } from "@/components/fila/EstoqueCapacityGauge";
import type { EmpilhadorTabId } from "@/components/fila/EmpilhadorQueueTabs";

type EmpilhadorQueueHeroProps = {
  filter: EmpilhadorTabId;
  aguardandoCount: number;
  operationalCount: number;
  finalizedCount: number;
  absentCount: number;
  nextMinuta?: string | null;
  trailing?: React.ReactNode;
  estoqueSummary: EstoqueCapacitySummary | null;
};

function buildAguardandoDetail(
  operationalCount: number,
  finalizedCount: number,
  absentCount: number,
  nextMinuta?: string | null
): string {
  const parts: string[] = [
    `${operationalCount} veículo${operationalCount !== 1 ? "s" : ""} no pátio`,
  ];
  if (absentCount > 0) {
    parts.push(`${absentCount} ausente${absentCount !== 1 ? "s" : ""}`);
  }
  parts.push(`${finalizedCount} finalizada${finalizedCount !== 1 ? "s" : ""} hoje`);
  if (nextMinuta) {
    parts.push(`Próxima minuta ${nextMinuta}`);
  }
  return parts.join(" · ");
}

/** Hero operacional — espelha o padrão visual do motorista */
export function EmpilhadorQueueHero({
  filter,
  aguardandoCount,
  operationalCount,
  finalizedCount,
  absentCount,
  nextMinuta,
  trailing,
  estoqueSummary,
}: EmpilhadorQueueHeroProps) {
  if (filter === "finalizadas") {
    return (
      <QueuePositionHero
        label="Finalizadas hoje"
        value={finalizedCount}
        detail="Minutas encerradas no dia operacional"
        trailing={trailing}
        className="hero-pattern mb-4"
      />
    );
  }

  return (
    <QueuePositionHero
      label="Aguardando descarga"
      value={aguardandoCount}
      detail={buildAguardandoDetail(
        operationalCount,
        finalizedCount,
        absentCount,
        nextMinuta
      )}
      trailing={trailing}
      footer={
        estoqueSummary ? (
          <EstoqueCapacityGauge summary={estoqueSummary} className="estoque-gauge--hero w-full" />
        ) : undefined
      }
      className="hero-pattern mb-4"
    />
  );
}
