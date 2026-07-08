"use client";

import { cn } from "@/lib/utils";
import type { EstoqueCapacitySummary } from "@/lib/estoque-capacity-summary";

type EstoqueCapacityGaugeProps = {
  summary: EstoqueCapacitySummary | null;
  className?: string;
};

function toneClass(pct: number): string {
  if (pct >= 95) return "estoque-gauge__fill--critical";
  if (pct >= 82) return "estoque-gauge__fill--warn";
  return "estoque-gauge__fill--ok";
}

export function EstoqueCapacityGauge({
  summary,
  className,
}: EstoqueCapacityGaugeProps) {
  if (!summary || summary.capacidade <= 0) return null;

  const ocupadoTone = toneClass(summary.pctOcupado);
  const vagasTone = toneClass(summary.pctVagasHoje);

  return (
    <div
      className={cn("estoque-gauge", className)}
      role="meter"
      aria-valuenow={summary.pctOcupado}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Ocupação do estoque ${summary.pctOcupado} por cento`}
    >
      <div className="estoque-gauge__track estoque-gauge__track--primary">
        <div
          className={cn("estoque-gauge__fill", ocupadoTone)}
          style={{ width: `${summary.pctOcupado}%` }}
        />
      </div>
      {summary.vagasHoje > 0 && (
        <div
          className="estoque-gauge__track estoque-gauge__track--secondary"
          role="meter"
          aria-valuenow={summary.pctVagasHoje}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Vagas de descarga hoje ${summary.pctVagasHoje} por cento`}
        >
          <div
            className={cn(
              "estoque-gauge__fill estoque-gauge__fill--secondary",
              vagasTone
            )}
            style={{ width: `${summary.pctVagasHoje}%` }}
          />
        </div>
      )}
    </div>
  );
}
