import type { QueueEntry } from "./types";
import { isActiveQueueStatus } from "./constants";
import { compareQueueOrder } from "./queue";
import {
  getManausDateYmd,
  manausDayStartISO,
  getOperationalPlanningBaseYmd,
  businessDayOffsetToYmd,
} from "./queue-day";

export interface MinutaMetadata {
  minuta: string;
  volume_motos: number;
  menor_vencimento: string | null;
  imported_at?: string;
  updated_at?: string;
}

/** Configuração diária: teto físico do estoque + expedição que libera espaço. */
export interface EstoqueExpedicaoConfig {
  capacidade_estoque: number;
  expedicao: number;
  /** Motos já no pátio antes dos descarregamentos do dia (opcional). */
  motos_no_estoque?: number;
  updated_at: string;
}

/** @deprecated Use EstoqueExpedicaoConfig — mantido para leitura legada `{ motos }`. */
export interface ExpedicaoDiaria extends EstoqueExpedicaoConfig {
  motos?: number;
}

export const EXPEDICAO_SETTINGS_KEY = "expedicao_diaria";

export interface StockPlanningInput {
  capacidadeEstoque: number;
  expedicao: number;
  motosNoEstoque?: number;
}

export function normalizeEstoqueExpedicaoConfig(
  raw: Record<string, unknown> | null | undefined
): EstoqueExpedicaoConfig | null {
  if (!raw || typeof raw !== "object") return null;

  const updated_at =
    typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString();

  if (typeof raw.capacidade_estoque === "number" && typeof raw.expedicao === "number") {
    const capacidade_estoque = Math.max(0, Math.round(raw.capacidade_estoque));
    const expedicao = Math.max(0, Math.round(raw.expedicao));
    const motos_no_estoque =
      typeof raw.motos_no_estoque === "number"
        ? Math.max(0, Math.round(raw.motos_no_estoque))
        : 0;
    if (capacidade_estoque <= 0) return null;
    return { capacidade_estoque, expedicao, motos_no_estoque, updated_at };
  }

  if (typeof raw.motos === "number") {
    const motos = Math.max(0, Math.round(raw.motos));
    if (motos <= 0) return null;
    return {
      capacidade_estoque: motos,
      expedicao: motos,
      motos_no_estoque: 0,
      updated_at,
    };
  }

  return null;
}

/** Motos que permanecem no galpão após a expedição. */
export function computeMotosNoEstoque(
  capacidadeTotal: number,
  motosExpedidas: number
): number {
  return Math.max(0, capacidadeTotal - Math.max(0, motosExpedidas));
}

/**
 * Motos que o estoque comporta no dia seguinte = motos expedidas.
 * Ex.: estoque cheio 950, expediu 50 → comportam 50; expediu 950 → comportam 950.
 */
export function computeMotosComportamDiaSeguinte(
  capacidadeTotal: number,
  motosExpedidas: number
): number {
  return Math.max(0, Math.min(Math.max(0, motosExpedidas), capacidadeTotal));
}

/** @deprecated Use computeMotosComportamDiaSeguinte */
export function computeEspacoDisponivel(
  capacidadeTotal: number,
  motosExpedidas: number
): number {
  return computeMotosComportamDiaSeguinte(capacidadeTotal, motosExpedidas);
}

export function toStockPlanningInput(
  config: EstoqueExpedicaoConfig
): StockPlanningInput {
  const capacidadeEstoque = config.capacidade_estoque;
  const expedicao = Math.min(config.expedicao, capacidadeEstoque);
  const motosNoEstoque = computeMotosNoEstoque(capacidadeEstoque, expedicao);
  return {
    capacidadeEstoque,
    expedicao,
    motosNoEstoque,
  };
}

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
  manualPriorityIds: ReadonlySet<string> = new Set(),
  dismissedAutoPriorityIds: ReadonlySet<string> = new Set()
): (T & {
  volume_motos: number | null;
  menor_vencimento: string | null;
  prioridade_automatica: boolean;
  prioridade_automatica_dispensada?: boolean;
})[] {
  return entries.map((entry) => {
    const meta = metadataMap.get(normalizeMinutaKey(entry.minuta));
    const menor_vencimento = meta?.menor_vencimento ?? null;
    const prioridade_automatica = shouldAutoPrioritize(menor_vencimento);
    const prioridadeAutomaticaDispensada =
      prioridade_automatica && dismissedAutoPriorityIds.has(entry.id);
    const prioridadeManual = manualPriorityIds.has(entry.id);
    const prioridade =
      (prioridade_automatica && !prioridadeAutomaticaDispensada) ||
      prioridadeManual ||
      Boolean(entry.prioridade);

    return {
      ...entry,
      volume_motos: meta?.volume_motos ?? null,
      menor_vencimento,
      prioridade,
      prioridade_automatica,
      prioridade_automatica_dispensada: prioridadeAutomaticaDispensada,
    };
  });
}

/** Prioridade automática: NF vence amanhã (1 dia). Vencidas não entram — prioridade manual pelo admin. */
export function shouldAutoPrioritize(vencimento: string | null | undefined): boolean {
  const days = daysUntilVencimento(vencimento);
  if (days == null) return false;
  return days === 1;
}

/** NF já passou do vencimento (check-in com data no passado). */
export function isNfVencida(vencimento: string | null | undefined): boolean {
  const days = daysUntilVencimento(vencimento);
  return days != null && days < 0;
}

/** Dias civis até o vencimento no fuso operacional (0 = hoje, 1 = amanhã). */
export function daysUntilVencimento(vencimento: string | null | undefined): number | null {
  if (!vencimento) return null;
  const match = vencimento.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const vencYmd = `${match[1]}-${match[2]}-${match[3]}`;
  const todayYmd = getManausDateYmd();
  const [y1, m1, d1] = todayYmd.split("-").map(Number);
  const [y2, m2, d2] = vencYmd.split("-").map(Number);
  const todayUtc = Date.UTC(y1, m1 - 1, d1);
  const vencUtc = Date.UTC(y2, m2 - 1, d2);
  return Math.round((vencUtc - todayUtc) / (1000 * 60 * 60 * 24));
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
  /** Espaço livre no dia em que a minuta foi encaixada (antes de descarregar). */
  espaco_disponivel_no_dia: number;
  /** Volume da minuta excede o espaço disponível no dia da previsão. */
  ultrapassa_capacidade: boolean;
  /** Minuta não coube no dia operacional atual e foi empurrada para dia útil seguinte. */
  empurrada_por_capacidade: boolean;
  /** Vagas no dia em que foi recusada (para aviso operacional). */
  vagas_no_dia_recusado?: number;
  /** Quantas motos da minuta cabem no espaço disponível (quando ultrapassa). */
  motos_com_espaco: number;
}

export function formatMinutaCapacidadeAviso(
  volumeMotos: number,
  motosComEspaco: number,
  ultrapassa: boolean,
  empurradaPorCapacidade?: boolean,
  vagasNoDiaRecusado?: number
): string | null {
  if (empurradaPorCapacidade && vagasNoDiaRecusado != null) {
    return `Não cabe hoje — minuta com ${volumeMotos} motos, só ${vagasNoDiaRecusado} vagas`;
  }
  if (!ultrapassa) return null;
  if (motosComEspaco <= 0) {
    return `Sem espaço no estoque neste dia (minuta com ${volumeMotos} motos)`;
  }
  return `Só tem espaço para ${motosComEspaco} motos (minuta com ${volumeMotos})`;
}

export interface CapacityPlan {
  capacidadeEstoque: number;
  expedicao: number;
  motosNoEstoque: number;
  espacoLivreHoje: number;
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
    espaco_disponivel_no_dia: number;
    ultrapassa_capacidade: boolean;
    empurrada_por_capacidade: boolean;
    motos_com_espaco: number;
    capacidade_aviso: string | null;
  }>;
}

type QueueEntryWithVolume = QueueEntry & {
  volume_motos?: number | null;
  menor_vencimento?: string | null;
  prioridade?: boolean;
};

/**
 * Distribui minutas nos dias úteis (seg–sex) conforme:
 * - capacidade total do estoque cheio (ex.: 950);
 * - motos expedidas (informadas após expedição no LSL) = volume que comporta no dia seguinte;
 * - ocupação inicial = capacidade − expedidas;
 * - volume de cada minuta na ordem da fila.
 * Minutas que não cabem no dia atual são empurradas para o próximo dia útil com aviso.
 */
export function allocateQueueByStock(
  entries: QueueEntryWithVolume[],
  input: StockPlanningInput,
  baseYmd?: string
): CapacityAllocation[] {
  const C = input.capacidadeEstoque;
  const E = input.expedicao;
  if (C <= 0) return [];

  const active = entries.filter((e) => isActiveQueueStatus(e.status));
  const sorted = [...active].sort(compareQueueOrder);
  const planningBaseYmd = baseYmd ?? getOperationalPlanningBaseYmd();

  let occupied = Math.max(
    0,
    Math.min(input.motosNoEstoque ?? computeMotosNoEstoque(C, E), C)
  );
  let currentSlot = 0;
  const result: CapacityAllocation[] = [];

  function advanceBusinessSlot(slot: number, simOccupied: number) {
    const nextOccupied = E > 0 ? Math.max(0, simOccupied - E) : simOccupied;
    return { slot: slot + 1, simOccupied: nextOccupied };
  }

  function fitsInSlot(simOccupied: number, vol: number): boolean {
    return simOccupied + vol <= C;
  }

  function pushAllocation(
    entry: QueueEntryWithVolume,
    vol: number,
    slot: number,
    simOccupied: number,
    empurradaPorCapacidade: boolean,
    vagasNoDiaRecusado?: number
  ) {
    const espacoDisponivelNoDia = Math.max(0, C - simOccupied);
    const ultrapassaCapacidade =
      empurradaPorCapacidade || vol > espacoDisponivelNoDia;
    const motosComEspaco = ultrapassaCapacidade ? espacoDisponivelNoDia : vol;
    const previsaoYmd = businessDayOffsetToYmd(planningBaseYmd, slot);

    result.push({
      id: entry.id,
      minuta: entry.minuta,
      volume_motos: vol,
      menor_vencimento: entry.menor_vencimento ?? null,
      prioridade: Boolean(entry.prioridade),
      previsao_descarregamento: manausDayStartISO(previsaoYmd),
      diaOffset: slot,
      espaco_disponivel_no_dia: espacoDisponivelNoDia,
      ultrapassa_capacidade: ultrapassaCapacidade,
      empurrada_por_capacidade: empurradaPorCapacidade,
      vagas_no_dia_recusado: vagasNoDiaRecusado,
      motos_com_espaco: motosComEspaco,
    });
  }

  function resolveSlot(
    startSlot: number,
    startOccupied: number,
    vol: number
  ): {
    slot: number;
    simOccupied: number;
    empurradaPorCapacidade: boolean;
    vagasNoDiaRecusado?: number;
  } {
    let slot = startSlot;
    let simOccupied = startOccupied;
    const vagasIniciais = Math.max(0, C - simOccupied);
    let empurradaPorCapacidade = false;
    let vagasNoDiaRecusado: number | undefined;

    if (!fitsInSlot(simOccupied, vol)) {
      empurradaPorCapacidade = slot === currentSlot;
      vagasNoDiaRecusado = vagasIniciais;

      let guard = 0;
      while (!fitsInSlot(simOccupied, vol) && guard < 400) {
        const next = advanceBusinessSlot(slot, simOccupied);
        slot = next.slot;
        simOccupied = next.simOccupied;
        guard += 1;
      }
    }

    return { slot, simOccupied, empurradaPorCapacidade, vagasNoDiaRecusado };
  }

  for (const entry of sorted) {
    const vol = entry.volume_motos ?? 0;
    if (vol <= 0) continue;

    if (vol > C) {
      const vagas = Math.max(0, C - occupied);
      pushAllocation(entry, vol, currentSlot, occupied, true, vagas);
      continue;
    }

    const resolved = resolveSlot(currentSlot, occupied, vol);
    pushAllocation(
      entry,
      vol,
      resolved.slot,
      resolved.simOccupied,
      resolved.empurradaPorCapacidade,
      resolved.vagasNoDiaRecusado
    );
    occupied = resolved.simOccupied + vol;
    currentSlot = resolved.slot;
  }

  return result;
}

/** @deprecated Use allocateQueueByStock — mantido para compatibilidade interna. */
export function allocateQueueByCapacity(
  entries: QueueEntryWithVolume[],
  motosExpedicao: number,
  baseYmd?: string
): CapacityAllocation[] {
  return allocateQueueByStock(
    entries,
    {
      capacidadeEstoque: motosExpedicao,
      expedicao: motosExpedicao,
      motosNoEstoque: 0,
    },
    baseYmd
  );
}

export function computeCapacityAllocationMap(
  entries: QueueEntryWithVolume[],
  config: EstoqueExpedicaoConfig | StockPlanningInput
): Map<string, CapacityAllocation> {
  const input =
    "capacidadeEstoque" in config
      ? config
      : toStockPlanningInput(config);
  const map = new Map<string, CapacityAllocation>();
  for (const item of allocateQueueByStock(entries, input)) {
    map.set(item.id, item);
  }
  return map;
}

export function computePrevisoesDescarregamento(
  entries: QueueEntryWithVolume[],
  config: EstoqueExpedicaoConfig | StockPlanningInput
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [id, item] of computeCapacityAllocationMap(entries, config)) {
    map.set(id, item.previsao_descarregamento);
  }
  return map;
}

export function computeCapacityPlan(
  entries: QueueEntryWithVolume[],
  config: EstoqueExpedicaoConfig | StockPlanningInput
): CapacityPlan {
  const input =
    "capacidadeEstoque" in config
      ? config
      : toStockPlanningInput(config);
  const allocations = allocateQueueByStock(entries, input);
  const active = entries.filter((e) => isActiveQueueStatus(e.status));
  const sorted = [...active].sort(compareQueueOrder);
  const motosNaFila = sorted.reduce((sum, e) => sum + (e.volume_motos ?? 0), 0);
  const planningBaseYmd = getOperationalPlanningBaseYmd();
  const hoje = allocations.filter(
    (a) =>
      !a.empurrada_por_capacidade &&
      businessDayOffsetToYmd(planningBaseYmd, a.diaOffset) === planningBaseYmd
  );
  const motosNoEstoque = computeMotosNoEstoque(
    input.capacidadeEstoque,
    input.expedicao
  );
  const espacoLivreHoje = computeMotosComportamDiaSeguinte(
    input.capacidadeEstoque,
    input.expedicao
  );

  return {
    capacidadeEstoque: input.capacidadeEstoque,
    expedicao: input.expedicao,
    motosNoEstoque,
    espacoLivreHoje,
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
      espaco_disponivel_no_dia: a.espaco_disponivel_no_dia,
      ultrapassa_capacidade: a.ultrapassa_capacidade,
      empurrada_por_capacidade: a.empurrada_por_capacidade,
      motos_com_espaco: a.motos_com_espaco,
      capacidade_aviso: formatMinutaCapacidadeAviso(
        a.volume_motos,
        a.motos_com_espaco,
        a.ultrapassa_capacidade,
        a.empurrada_por_capacidade,
        a.vagas_no_dia_recusado
      ),
    })),
  };
}
