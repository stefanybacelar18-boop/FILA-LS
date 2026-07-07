import type { QueueEntry } from "./types";
import { isActiveQueueStatus } from "./constants";
import { compareQueueOrder } from "./queue";
import { addManausDays, getManausDateYmd, manausDayStartISO } from "./queue-day";

export interface MinutaMetadata {
  minuta: string;
  volume_motos: number;
  menor_vencimento: string | null;
  imported_at?: string;
  updated_at?: string;
}

export interface ExpedicaoDiaria {
  motos: number;
  updated_at: string;
}

export const EXPEDICAO_SETTINGS_KEY = "expedicao_diaria";

/** Cidades cujo vencimento de NF não entra no menor vencimento da minuta. */
export const CIDADES_EXCLUIDAS_VENCIMENTO_NF = [
  "EUCLIDES DA CUNHA",
  "RIBEIRA DO POMBAL",
] as const;

export function normalizeCityName(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isCidadeExcluidaVencimento(cidade: string | null | undefined): boolean {
  const norm = normalizeCityName(cidade);
  return CIDADES_EXCLUIDAS_VENCIMENTO_NF.some((c) => norm === c);
}

/** Normaliza número da minuta para cruzamento import ↔ fila. */
export function normalizeMinutaKey(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function parseVolumeMotos(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  const cleaned = String(raw).replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

export function parseVencimentoDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, "0");
    const d = String(raw.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  if (typeof raw === "number" && raw > 20000 && raw < 100000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + Math.floor(raw));
    return excelEpoch.toISOString().slice(0, 10);
  }

  const str = String(raw).trim();
  const br = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (br) {
    const day = br[1].padStart(2, "0");
    const month = br[2].padStart(2, "0");
    let year = br[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

const MINUTA_HEADERS = ["minuta", "numero", "nº", "no", "documento", "nf"];
const VOLUME_HEADERS = ["volume", "motos", "qtd", "quantidade", "qtde", "pecas", "peças"];
const VENCIMENTO_HEADERS = ["vencimento nf", "venc. real", "venc real", "menor vencimento", "vencimento", "venc", "validade", "prazo de entrega"];

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function headerScore(header: string, keywords: string[]): number {
  const h = normalizeHeader(header);
  let score = 0;
  for (const kw of keywords) {
    if (h === kw) score += 3;
    else if (h.includes(kw)) score += 1;
  }
  return score;
}

export function isConsultaGeralMotosFormat(headers: string[]): boolean {
  const norm = headers.map(normalizeHeader);
  return norm.includes("minuta") && (norm.includes("chassi") || norm.includes("modelo"));
}

function findColumnIndex(headers: string[], keywords: string[]): number {
  let best = -1;
  let bestScore = 0;
  headers.forEach((h, i) => {
    const s = headerScore(h, keywords);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  });
  return best;
}

/** Formato ConsultaGeralMotos: 1 linha por moto/chassi — agrupa por MINUTA. */
export function parseConsultaGeralMotosSheet(matrix: unknown[][]): ParsedImportRow[] {
  if (matrix.length < 2) return [];

  const headers = matrix[0].map((c) => String(c ?? "").trim());
  const minutaIdx = findColumnIndex(headers, ["minuta"]);
  if (minutaIdx < 0) return [];

  const cidadeIdx = findColumnIndex(headers, ["cidade"]);
  const vencimentoNfIdx = findColumnIndex(headers, ["vencimento nf"]);

  const groups = new Map<string, { volume_motos: number; vencimentos: string[] }>();

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) continue;

    const minuta = normalizeMinutaKey(String(row[minutaIdx] ?? ""));
    if (!minuta) continue;

    if (!groups.has(minuta)) {
      groups.set(minuta, { volume_motos: 0, vencimentos: [] });
    }
    const group = groups.get(minuta)!;
    group.volume_motos += 1;

    if (vencimentoNfIdx >= 0 && cidadeIdx >= 0) {
      const cidade = String(row[cidadeIdx] ?? "");
      if (!isCidadeExcluidaVencimento(cidade)) {
        const parsed = parseVencimentoDate(row[vencimentoNfIdx]);
        if (parsed) group.vencimentos.push(parsed);
      }
    } else if (vencimentoNfIdx >= 0) {
      const parsed = parseVencimentoDate(row[vencimentoNfIdx]);
      if (parsed) group.vencimentos.push(parsed);
    }
  }

  return [...groups.entries()].map(([minuta, g]) => ({
    minuta,
    volume_motos: g.volume_motos,
    menor_vencimento:
      g.vencimentos.length > 0 ? [...g.vencimentos].sort()[0] : null,
  }));
}

function mergeImportRecord(
  map: Map<string, ParsedImportRow>,
  record: ParsedImportRow
): void {
  const existing = map.get(record.minuta);
  if (!existing) {
    map.set(record.minuta, record);
    return;
  }

  existing.volume_motos += record.volume_motos;

  if (record.menor_vencimento) {
    if (
      !existing.menor_vencimento ||
      record.menor_vencimento < existing.menor_vencimento
    ) {
      existing.menor_vencimento = record.menor_vencimento;
    }
  }
}

export function parseImportMatrix(matrix: unknown[][]): {
  records: ParsedImportRow[];
  format: "consulta_geral_motos" | "flat";
  headers: string[];
  skippedRows: number;
} {
  const headers = matrix[0].map((c) => String(c ?? "").trim());
  const map = new Map<string, ParsedImportRow>();
  let skippedRows = 0;

  if (isConsultaGeralMotosFormat(headers)) {
    const records = parseConsultaGeralMotosSheet(matrix);
    return {
      records,
      format: "consulta_geral_motos",
      headers,
      skippedRows: Math.max(0, matrix.length - 1 - records.reduce((s, r) => s + r.volume_motos, 0)),
    };
  }

  const columns = detectImportColumns(headers);

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) continue;
    const record = rowToImportRecord(row, columns);
    if (!record) {
      skippedRows += 1;
      continue;
    }
    mergeImportRecord(map, record);
  }

  return {
    records: [...map.values()],
    format: "flat",
    headers,
    skippedRows,
  };
}

export function detectImportColumns(headers: string[]): {
  minuta: number;
  volume: number;
  vencimento: number;
} {
  let minuta = -1;
  let volume = -1;
  let vencimento = -1;
  let minutaScore = 0;
  let volumeScore = 0;
  let vencScore = 0;

  headers.forEach((h, i) => {
    const ms = headerScore(h, MINUTA_HEADERS);
    const vs = headerScore(h, VOLUME_HEADERS);
    const vcs = headerScore(h, VENCIMENTO_HEADERS);

    if (ms > minutaScore) {
      minutaScore = ms;
      minuta = i;
    }
    if (vs > volumeScore) {
      volumeScore = vs;
      volume = i;
    }
    if (vcs > vencScore) {
      vencScore = vcs;
      vencimento = i;
    }
  });

  if (minuta < 0) minuta = 0;
  if (volume < 0) volume = Math.min(1, headers.length - 1);
  if (vencimento < 0) vencimento = Math.min(2, headers.length - 1);

  return { minuta, volume, vencimento };
}

export type ParsedImportRow = {
  minuta: string;
  volume_motos: number;
  menor_vencimento: string | null;
};

export function rowToImportRecord(
  cells: unknown[],
  columns: { minuta: number; volume: number; vencimento: number }
): ParsedImportRow | null {
  const minutaRaw = cells[columns.minuta];
  const minuta = normalizeMinutaKey(minutaRaw != null ? String(minutaRaw) : "");
  if (!minuta || minuta.length < 2) return null;

  const volume = parseVolumeMotos(cells[columns.volume]) ?? 0;
  const menor_vencimento = parseVencimentoDate(cells[columns.vencimento]);

  return { minuta, volume_motos: volume, menor_vencimento };
}

export function buildMetadataMap(rows: MinutaMetadata[]): Map<string, MinutaMetadata> {
  const map = new Map<string, MinutaMetadata>();
  for (const row of rows) {
    const key = normalizeMinutaKey(row.minuta);
    if (key) map.set(key, { ...row, minuta: key });
  }
  return map;
}

export function mergeMetadataIntoEntries<T extends QueueEntry>(
  entries: T[],
  metadataMap: Map<string, MinutaMetadata>,
  manualPriorityIds: ReadonlySet<string> = new Set()
): (T & {
  volume_motos: number | null;
  menor_vencimento: string | null;
  prioridade_automatica: boolean;
})[] {
  return entries.map((entry) => {
    const meta = metadataMap.get(normalizeMinutaKey(entry.minuta));
    const menor_vencimento = meta?.menor_vencimento ?? null;
    const prioridade_automatica = shouldAutoPrioritize(menor_vencimento);
    const prioridadeManual = manualPriorityIds.has(entry.id);
    const prioridade =
      prioridade_automatica ||
      prioridadeManual ||
      Boolean(entry.prioridade);

    return {
      ...entry,
      volume_motos: meta?.volume_motos ?? null,
      menor_vencimento,
      prioridade,
      prioridade_automatica,
    };
  });
}

/** Prioridade automática: NF vence amanhã (1 dia). Demais seguem ordem de check-in. */
export function shouldAutoPrioritize(vencimento: string | null | undefined): boolean {
  const days = daysUntilVencimento(vencimento);
  if (days == null) return false;
  return days === 1;
}

export function daysUntilVencimento(vencimento: string | null | undefined): number | null {
  if (!vencimento) return null;
  const end = new Date(`${vencimento}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function formatVencimentoDateBR(vencimento: string | null | undefined): string | null {
  if (!vencimento) return null;
  const m = vencimento.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatVencimentoLabel(vencimento: string | null | undefined): string | null {
  const dateBR = formatVencimentoDateBR(vencimento);
  if (!dateBR) return null;

  const days = daysUntilVencimento(vencimento);
  if (days == null) return `NF ${dateBR}`;

  if (days === 0) return `NF ${dateBR} · hoje`;
  if (days === 1) return `NF ${dateBR} · amanhã`;
  if (days < 0) return `NF ${dateBR}`;
  return `NF ${dateBR}`;
}

export interface CapacityAllocation {
  id: string;
  minuta: string | null;
  volume_motos: number;
  menor_vencimento: string | null;
  prioridade: boolean;
  previsao_descarregamento: string;
  diaOffset: number;
}

export interface CapacityPlan {
  motosExpedicao: number;
  motosNaFila: number;
  motosCabeHoje: number;
  minutasNaFila: number;
  minutasCabeHoje: number;
  minutasSugeridas: Array<{
    id: string;
    minuta: string | null;
    volume_motos: number;
    menor_vencimento: string | null;
    prioridade: boolean;
    previsao_descarregamento: string;
    diaOffset: number;
  }>;
}

/** Distribui minutas nos dias conforme volume e capacidade diária (expedição). */
export function allocateQueueByCapacity(
  entries: Array<
    QueueEntry & {
      volume_motos?: number | null;
      menor_vencimento?: string | null;
      prioridade?: boolean;
    }
  >,
  motosExpedicao: number,
  baseYmd?: string
): CapacityAllocation[] {
  if (motosExpedicao <= 0) return [];

  const active = entries.filter((e) => isActiveQueueStatus(e.status));
  const sorted = [...active].sort(compareQueueOrder);
  const todayYmd = baseYmd ?? getManausDateYmd();

  const result: CapacityAllocation[] = [];
  let capacidadeRestante = motosExpedicao;
  let diaOffset = 0;

  for (const entry of sorted) {
    const vol = entry.volume_motos ?? 0;
    if (vol <= 0) continue;

    while (vol > capacidadeRestante) {
      diaOffset += 1;
      capacidadeRestante = motosExpedicao;
      // Minuta maior que a expedição diária: inicia no próximo dia útil sem loop infinito.
      if (vol > motosExpedicao) break;
    }

    const previsaoYmd = addManausDays(todayYmd, diaOffset);
    result.push({
      id: entry.id,
      minuta: entry.minuta,
      volume_motos: vol,
      menor_vencimento: entry.menor_vencimento ?? null,
      prioridade: Boolean(entry.prioridade),
      previsao_descarregamento: manausDayStartISO(previsaoYmd),
      diaOffset,
    });

    capacidadeRestante -= vol;
    while (capacidadeRestante < 0) {
      diaOffset += 1;
      capacidadeRestante += motosExpedicao;
    }
  }

  return result;
}

export function computePrevisoesDescarregamento(
  entries: Array<
    QueueEntry & {
      volume_motos?: number | null;
      menor_vencimento?: string | null;
      prioridade?: boolean;
    }
  >,
  motosExpedicao: number
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of allocateQueueByCapacity(entries, motosExpedicao)) {
    map.set(item.id, item.previsao_descarregamento);
  }
  return map;
}

export function computeCapacityPlan(
  entries: Array<
    QueueEntry & {
      volume_motos?: number | null;
      menor_vencimento?: string | null;
      prioridade?: boolean;
    }
  >,
  motosExpedicao: number
): CapacityPlan {
  const allocations = allocateQueueByCapacity(entries, motosExpedicao);
  const active = entries.filter((e) => isActiveQueueStatus(e.status));
  const sorted = [...active].sort(compareQueueOrder);
  const motosNaFila = sorted.reduce((sum, e) => sum + (e.volume_motos ?? 0), 0);
  const hoje = allocations.filter((a) => a.diaOffset === 0);

  return {
    motosExpedicao,
    motosNaFila,
    motosCabeHoje: hoje.reduce((sum, a) => sum + a.volume_motos, 0),
    minutasNaFila: sorted.filter((e) => (e.volume_motos ?? 0) > 0).length,
    minutasCabeHoje: hoje.length,
    minutasSugeridas: allocations.map((a) => ({
      id: a.id,
      minuta: a.minuta,
      volume_motos: a.volume_motos,
      menor_vencimento: a.menor_vencimento,
      prioridade: a.prioridade,
      previsao_descarregamento: a.previsao_descarregamento,
      diaOffset: a.diaOffset,
    })),
  };
}
