"use client";

import type { QueueEntry } from "@/lib/types";
import { VEHICLE_TYPES, DEFAULT_CHECKIN_EMPRESA, DEFAULT_CHECKIN_TIPO_CARGA } from "@/lib/constants";
import { entryRetornoRacksVazios } from "@/lib/queue-badges";
import { formatVencimentoLabel } from "@/lib/minuta-intelligence";
import { formatPhone, formatPrevisaoDate } from "@/lib/utils";
import {
  formatEntryArrivalDay,
  formatEntryArrivalTime,
} from "@/lib/queue-entry-dates";
import { cn } from "@/lib/utils";

type SummaryRow = { label: string; value: React.ReactNode };

function vehicleTypeLabel(tipo: QueueEntry["tipo_veiculo"]): string | null {
  if (!tipo) return null;
  return VEHICLE_TYPES.find((v) => v.value === tipo)?.label ?? tipo;
}

function buildCheckinSummaryRows(entry: QueueEntry): SummaryRow[] {
  const rows: SummaryRow[] = [];

  const nome = entry.nome?.trim();
  if (nome) rows.push({ label: "Nome", value: nome });

  const telefone = formatPhone(entry.telefone);
  if (telefone) rows.push({ label: "Telefone", value: telefone });

  const transportadora = entry.transportadora?.trim();
  if (transportadora) rows.push({ label: "Transportadora", value: transportadora });

  const tipo = vehicleTypeLabel(entry.tipo_veiculo);
  if (tipo) rows.push({ label: "Tipo de veículo", value: tipo });

  const cavalo = entry.placa_cavalo?.trim() || entry.placa?.trim();
  if (cavalo) rows.push({ label: "Placa cavalo", value: <span className="font-mono">{cavalo}</span> });

  const carreta = entry.placa_carreta?.trim();
  if (carreta) rows.push({ label: "Placa carreta", value: <span className="font-mono">{carreta}</span> });

  const segunda = entry.placa_segunda_carreta?.trim();
  if (segunda) {
    rows.push({ label: "Placa 2ª carreta", value: <span className="font-mono">{segunda}</span> });
  }

  rows.push({
    label: "Retorno com racks vazios",
    value: entryRetornoRacksVazios(entry) ? "Sim" : "Não",
  });

  const empresa = entry.empresa?.trim();
  if (empresa && empresa !== DEFAULT_CHECKIN_EMPRESA) {
    rows.push({ label: "Empresa", value: empresa });
  }

  const tipoCarga = entry.tipo_carga?.trim();
  if (tipoCarga && tipoCarga !== DEFAULT_CHECKIN_TIPO_CARGA) {
    rows.push({ label: "Tipo de carga", value: tipoCarga });
  }

  if (entry.volume_motos != null && entry.volume_motos > 0) {
    rows.push({ label: "Volume (minuta)", value: `${entry.volume_motos} motos` });
  }

  const nf = formatVencimentoLabel(entry.menor_vencimento);
  if (nf) rows.push({ label: "Vencimento NF", value: nf });

  if (entry.previsao_descarregamento) {
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

  if (entry.doca?.trim()) {
    rows.push({ label: "Doca", value: entry.doca.trim() });
  }

  return rows;
}

function SummarySection({
  title,
  rows,
  stacked,
}: {
  title: string;
  rows: SummaryRow[];
  stacked?: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <section>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200/90 bg-slate-50/50 px-3">
        {rows.map(({ label, value }) => (
          <div
            key={label}
            className={
              stacked
                ? "space-y-1 py-2.5"
                : "flex items-start justify-between gap-3 py-2.5"
            }
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

/** Resumo organizado dos dados enviados no check-in */
export function CheckinEntrySummary({
  entry,
  className,
}: {
  entry: QueueEntry;
  className?: string;
}) {
  const all = buildCheckinSummaryRows(entry);

  const motoristaLabels = new Set(["Nome", "Telefone", "Transportadora"]);
  const veiculoLabels = new Set([
    "Tipo de veículo",
    "Placa cavalo",
    "Placa carreta",
    "Placa 2ª carreta",
    "Retorno com racks vazios",
  ]);
  const cargaLabels = new Set(["Empresa", "Tipo de carga", "Volume (minuta)", "Vencimento NF"]);
  const operacaoLabels = new Set(["Previsão descarga", "Doca", "Check-in realizado"]);

  const pick = (labels: Set<string>) => all.filter((r) => labels.has(r.label));
  const sections = [
    { title: "Motorista", rows: pick(motoristaLabels) },
    { title: "Veículo", rows: pick(veiculoLabels) },
    { title: "Carga e minuta", rows: pick(cargaLabels) },
    { title: "Operação", rows: pick(operacaoLabels) },
  ];

  const observacao = all.find((r) => r.label === "Observações");

  return (
    <div className={cn("space-y-4", className)}>
      {sections.map(
        (section) =>
          section.rows.length > 0 && (
            <SummarySection key={section.title} title={section.title} rows={section.rows} />
          )
      )}
      {observacao && (
        <SummarySection title="Observações" rows={[observacao]} stacked />
      )}
    </div>
  );
}
