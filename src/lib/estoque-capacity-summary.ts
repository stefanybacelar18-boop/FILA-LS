import type { EstoqueExpedicaoConfig } from "./minuta-intelligence";
import {
  computeCapacityPlan,
  computeMotosNoEstoque,
} from "./minuta-intelligence";
import { isFinalizadaNoDiaOperacional } from "./queue-counters";
import type { QueueEntry } from "./types";

export type EstoqueCapacitySummary = {
  capacidade: number;
  ocupado: number;
  vagasHoje: number;
  alocadoHoje: number;
  /** Motos que entraram no estoque com descargas finalizadas hoje. */
  descarregadasHoje: number;
  /** 0–100 — ocupação atual do galpão */
  pctOcupado: number;
  /** 0–100 — uso das vagas de descarga previstas para hoje */
  pctVagasHoje: number;
};

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildEstoqueCapacitySummary(
  entries: QueueEntry[],
  config: EstoqueExpedicaoConfig | null
): EstoqueCapacitySummary | null {
  if (!config || config.capacidade_estoque <= 0) return null;

  const capacidade = config.capacidade_estoque;
  const baseOcupado =
    typeof config.motos_no_estoque === "number"
      ? Math.min(Math.max(0, config.motos_no_estoque), capacidade)
      : computeMotosNoEstoque(capacidade, config.expedicao);

  const descarregadasHoje = entries
    .filter(isFinalizadaNoDiaOperacional)
    .reduce((sum, e) => sum + Math.max(0, e.volume_motos ?? 0), 0);

  const ocupado = Math.min(capacidade, baseOcupado + descarregadasHoje);

  const plan = computeCapacityPlan(entries, config);
  const pctOcupado = clampPct((ocupado / capacidade) * 100);
  const pctVagasHoje =
    plan.espacoLivreHoje > 0
      ? clampPct((plan.motosCabeHoje / plan.espacoLivreHoje) * 100)
      : plan.motosCabeHoje > 0
        ? 100
        : 0;

  return {
    capacidade,
    ocupado,
    vagasHoje: plan.espacoLivreHoje,
    alocadoHoje: plan.motosCabeHoje,
    descarregadasHoje,
    pctOcupado,
    pctVagasHoje,
  };
}
