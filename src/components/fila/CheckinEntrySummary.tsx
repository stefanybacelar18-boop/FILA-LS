"use client";

import type { QueueEntry } from "@/lib/types";
import { VEHICLE_TYPES, DEFAULT_CHECKIN_EMPRESA, DEFAULT_CHECKIN_TIPO_CARGA } from "@/lib/constants";
import { formatPhone } from "@/lib/utils";
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

/** Dados do check-in que não constam no card da fila */
function buildCheckinSummaryRows(entry: QueueEntry): SummaryRow[] {
  const rows: SummaryRow[] = [];

  const nome = entry.nome?.trim();
  if (nome) rows.push({ label: "Nome completo", value: nome });

  const telefone = formatPhone(entry.telefone);
  if (telefone) rows.push({ label: "Telefone", value: telefone });

  const tipo = vehicleTypeLabel(entry.tipo_veiculo);
  if (tipo) rows.push({ label: "Tipo de veículo", value: tipo });

  const cavalo = entry.placa_cavalo?.trim();
  if (cavalo) rows.push({ label: "Placa cavalo", value: <span className="font-mono">{cavalo}</span> });

  const segunda = entry.placa_segunda_carreta?.trim();
  if (segunda) {
    rows.push({ label: "Placa 2ª carreta", value: <span className="font-mono">{segunda}</span> });
  }

  const empresa = entry.empresa?.trim();
  if (empresa && empresa !== DEFAULT_CHECKIN_EMPRESA) {
    rows.push({ label: "Empresa", value: empresa });
  }

  const tipoCarga = entry.tipo_carga?.trim();
  if (tipoCarga && tipoCarga !== DEFAULT_CHECKIN_TIPO_CARGA) {
    rows.push({ label: "Tipo de carga", value: tipoCarga });
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

/** Complemento ao card — só o que não aparece na lista */
export function CheckinEntrySummary({
  entry,
  className,
}: {
  entry: QueueEntry;
  className?: string;
}) {
  const all = buildCheckinSummaryRows(entry);

  const motoristaLabels = new Set(["Nome completo", "Telefone"]);
  const veiculoLabels = new Set(["Tipo de veículo", "Placa cavalo", "Placa 2ª carreta"]);
  const cargaLabels = new Set(["Empresa", "Tipo de carga"]);
  const operacaoLabels = new Set(["Check-in realizado", "Doca"]);

  const pick = (labels: Set<string>) => all.filter((r) => labels.has(r.label));
  const sections = [
    { title: "Motorista", rows: pick(motoristaLabels) },
    { title: "Veículo", rows: pick(veiculoLabels) },
    { title: "Carga", rows: pick(cargaLabels) },
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
