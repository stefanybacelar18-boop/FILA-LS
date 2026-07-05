import type { QueueEntry } from "./types";
import { getStatusLabel } from "./constants";
import { formatPrevisaoDate, formatPhone } from "./utils";
import { resolveEntryFinishedAt } from "./queue";

function escapeCsvCell(value: string): string {
  const safe = value.replace(/"/g, '""');
  return `"${safe}"`;
}

const dayFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

/** Gera CSV compatível com Excel (pt-BR, separador ;). */
export function buildCheckinsExcelCsv(entries: QueueEntry[]): string {
  const headers = [
    "Dia chegada",
    "Hora chegada",
    "Dia finalização",
    "Hora finalização",
    "Minuta",
    "Placa cavalo",
    "Placa carreta",
    "Motorista",
    "Telefone",
    "Transportadora",
    "Empresa",
    "Tipo carga",
    "Status",
    "Doca",
    "Volume (motos)",
    "Menor vencimento NF",
    "Previsão descarregamento",
    "Tipo veículo",
    "Retorno racks vazios",
    "Observações",
  ];

  const rows = entries.map((entry) => {
    const finishedAt = resolveEntryFinishedAt(entry);
    const chegada = entry.created_at ? new Date(entry.created_at) : null;
    const finalizacao = finishedAt ? new Date(finishedAt) : null;

    return [
      chegada ? dayFmt.format(chegada) : "—",
      chegada ? timeFmt.format(chegada) : "—",
      finalizacao ? dayFmt.format(finalizacao) : "—",
      finalizacao ? timeFmt.format(finalizacao) : "—",
      entry.minuta ?? "—",
      entry.placa_cavalo ?? entry.placa ?? "—",
      entry.placa_carreta ?? "—",
      entry.nome,
      formatPhone(entry.telefone),
      entry.transportadora,
      entry.empresa,
      entry.tipo_carga,
      getStatusLabel(entry.status),
      entry.doca ?? "—",
      entry.volume_motos != null && entry.volume_motos > 0 ? String(entry.volume_motos) : "—",
      entry.menor_vencimento ? formatPrevisaoDate(entry.menor_vencimento) : "—",
      entry.previsao_descarregamento
        ? formatPrevisaoDate(entry.previsao_descarregamento)
        : "—",
      entry.tipo_veiculo ?? "—",
      entry.retorno_racks_vazios === true
        ? "Sim"
        : entry.retorno_racks_vazios === false
          ? "Não"
          : "—",
      entry.observacoes ?? "",
    ].map((cell) => escapeCsvCell(String(cell)));
  });

  const BOM = "\uFEFF";
  return BOM + [headers.map(escapeCsvCell).join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");
}

export function downloadCheckinsExcel(entries: QueueEntry[], filenamePrefix = "checkins-filadock") {
  const csv = buildCheckinsExcelCsv(entries);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const stamp = new Intl.DateTimeFormat("pt-BR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replace(/\//g, "-");
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filenamePrefix}-${stamp}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
