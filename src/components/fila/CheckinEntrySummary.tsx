"use client";

import type { QueueEntry } from "@/lib/types";
import { VEHICLE_TYPES, DEFAULT_CHECKIN_EMPRESA, DEFAULT_CHECKIN_TIPO_CARGA } from "@/lib/constants";
import { entryRetornoRacksVazios } from "@/lib/queue-badges";
import { formatVencimentoLabel } from "@/lib/minuta-intelligence";
import { formatPhone, formatPrevisaoDate, formatQueueDay, formatQueueTime } from "@/lib/utils";
import {
  formatEntryArrivalDay,
  formatEntryArrivalTime,
} from "@/lib/queue-entry-dates";
import { cn } from "@/lib/utils";

export type CheckinSummaryMode = "complement" | "full";

type SummaryRow = { label: string; value: React.ReactNode };

function vehicleTypeLabel(tipo: QueueEntry["tipo_veiculo"]): string | null {
  if (!tipo) return null;
  return VEHICLE_TYPES.find((v) => v.value === tipo)?.label ?? tipo;
}

function buildCheckinSummaryRows(entry: QueueEntry, mode: CheckinSummaryMode): SummaryRow[] {
  const full = mode === "full";
  const rows: SummaryRow[] = [];

  const nome = entry.nome?.trim();
  if (nome) rows.push({ label: full ? "Nome" : "Nome completo", value: nome });

  const telefone = formatPhone(entry.telefone);
  if (telefone) rows.push({ label: "Telefone", value: telefone });

  const transportadora = entry.transportadora?.trim();
  if (full && transportadora) {
    rows.push({ label: "Transportadora", value: transportadora });
  }

  const tipo = vehicleTypeLabel(entry.tipo_veiculo);
  if (tipo) rows.push({ label: "Tipo de veículo", value: tipo });

  const cavalo = entry.placa_cavalo?.trim() || (full ? entry.placa?.trim() : "");
  if (cavalo) {
    rows.push({ label: "Placa cavalo", value: <span className="font-mono">{cavalo}</span> });
  }

  const carreta = entry.placa_carreta?.trim();
  if (full && carreta) {
    rows.push({ label: "Placa carreta", value: <span className="font-mono">{carreta}</span> });
  }

  const segunda = entry.placa_segunda_carreta?.trim();
  if (segunda) {
    rows.push({ label: "Placa 2ª carreta", value: <span className="font-mono">{segunda}</span> });
  }

  if (full) {
    rows.push({
      label: "Retorno com racks vazios",
      value: entryRetornoRacksVazios(entry) ? "Sim" : "Não",
    });
  }

  const empresa = entry.empresa?.trim();
  if (empresa && (full || empresa !== DEFAULT_CHECKIN_EMPRESA)) {
    rows.push({ label: "Empresa", value: empresa });
  }

  const tipoCarga = entry.tipo_carga?.trim();
  if (tipoCarga && (full || tipoCarga !== DEFAULT_CHECKIN_TIPO_CARGA)) {
    rows.push({ label: "Tipo de carga", value: tipoCarga });
  }

  if (full && entry.volume_motos != null && entry.volume_motos > 0) {
    rows.push({ label: "Volume (minuta)", value: `${entry.volume_motos} motos` });
  }

  if (full) {
    const nf = formatVencimentoLabel(entry.menor_vencimento);
    if (nf) rows.push({ label: "Vencimento NF", value: nf });
  }

  if (full && entry.previsao_descarregamento) {
    rows.push({
      label: "Previsão descarga",
      value: formatPrevisaoDate(entry.previsao_descarregamento),
    });
  }

  const obs = entry.observacoes?.trim();
  if (obs) rows.push({ label: "Observações", value: obs });

  rows.push({
    label: "Check-in realizado",
    value: (
      <span>
        {formatEntryArrivalDay(entry)}
        <span className="text-slate-500"> · {formatEntryArrivalTime(entry)}</span>
      </span>
    ),
  });

  if (full && entry.called_at) {
    rows.push({
      label: "Chamado em",
      value: (
        <span>
          {formatQueueDay(entry.called_at)}
          <span className="text-slate-500"> · {formatQueueTime(entry.called_at)}</span>
        </span>
      ),
    });
  }

  if (!full && entry.doca?.trim()) {
    rows.push({ label: "Doca", value: entry.doca.trim() });
  }

  return rows;
}

function SummarySection({
  title,
  rows,
  stacked,
  dense,
}: {
  title: string;
  rows: SummaryRow[];
  stacked?: boolean;
  dense?: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <section>
      <h3
        className={cn(
          "font-semibold uppercase tracking-wide text-slate-400",
          dense ? "mb-1.5 text-[10px]" : "mb-2 text-[10px]"
        )}
      >
        {title}
      </h3>
      <dl
        className={cn(
          "divide-y divide-slate-100 rounded-xl border border-slate-200/90 bg-slate-50/50",
          dense ? "px-2.5" : "px-3"
        )}
      >
        {rows.map(({ label, value }) => (
          <div
            key={label}
            className={cn(
              stacked ? "space-y-1" : "flex items-start justify-between gap-3",
              dense ? "py-2" : "py-2.5"
            )}
          >
            <dt className="text-xs font-medium text-slate-500">{label}</dt>
            <dd
              className={
                stacked
                  ? "text-sm leading-relaxed text-slate-800"
                  : "min-w-0 text-right text-sm font-semibold text-slate-800"
              }
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Resumo do check-in — complemento (empilhador) ou completo (admin) */
export function CheckinEntrySummary({
  entry,
  mode = "complement",
  className,
  dense = false,
}: {
  entry: QueueEntry;
  mode?: CheckinSummaryMode;
  className?: string;
  dense?: boolean;
}) {
  const full = mode === "full";
  const all = buildCheckinSummaryRows(entry, mode);

  const motoristaLabels = new Set(
    full ? ["Nome", "Telefone", "Transportadora"] : ["Nome completo", "Telefone"]
  );
  const veiculoLabels = new Set(
    full
      ? [
          "Tipo de veículo",
          "Placa cavalo",
          "Placa carreta",
          "Placa 2ª carreta",
          "Retorno com racks vazios",
        ]
      : ["Tipo de veículo", "Placa cavalo", "Placa 2ª carreta"]
  );
  const cargaLabels = new Set(
    full
      ? ["Empresa", "Tipo de carga", "Volume (minuta)", "Vencimento NF"]
      : ["Empresa", "Tipo de carga"]
  );
  const operacaoLabels = new Set(
    full
      ? ["Previsão descarga", "Check-in realizado", "Chamado em"]
      : ["Check-in realizado", "Doca"]
  );

  const pick = (labels: Set<string>) => all.filter((r) => labels.has(r.label));
  const sections = [
    { title: "Motorista", rows: pick(motoristaLabels) },
    { title: "Veículo", rows: pick(veiculoLabels) },
    { title: full ? "Carga e minuta" : "Carga", rows: pick(cargaLabels) },
    { title: "Operação", rows: pick(operacaoLabels) },
  ];

  const observacao = all.find((r) => r.label === "Observações");

  return (
    <div className={cn(dense ? "space-y-3" : "space-y-4", className)}>
      {sections.map(
        (section) =>
          section.rows.length > 0 && (
            <SummarySection
              key={section.title}
              title={section.title}
              rows={section.rows}
              dense={dense}
            />
          )
      )}
      {observacao && (
        <SummarySection title="Observações" rows={[observacao]} stacked dense={dense} />
      )}
    </div>
  );
}
