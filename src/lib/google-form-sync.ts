import {
  DEFAULT_CHECKIN_EMPRESA,
  DEFAULT_CHECKIN_TIPO_CARGA,
  normalizeQueueStatus,
} from "./constants";
import { getStatusTimestampUpdates } from "./queue";
import { parsePrevisaoInput } from "./utils";
import type { QueueStatus } from "./types";

/** Colunas da aba Form_Responses (gid 801601968) — Respostas FORM VIG. */
export const GOOGLE_FORM_COLUMN_MAP = {
  carimbo: 0,
  email: 1,
  minuta: 2,
  nome: 3,
  placa_cavalo: 4,
  placa_carreta: 5,
  transportadora: 6,
  telefone: 7,
  previsao: 9,
  status: 10,
  operador: 11,
  vencimento_nf: 14,
} as const;

export type GoogleFormRowPayload = {
  carimbo?: string;
  email?: string;
  minuta?: string;
  nome?: string;
  placa_cavalo?: string;
  placa_carreta?: string;
  transportadora?: string;
  telefone?: string;
  previsao?: string;
  status?: string;
  operador?: string;
  vencimento_nf?: string;
  /** Linha bruta da planilha (Apps Script envia e.values). */
  values?: unknown[];
};

export type ParsedGoogleFormRow = {
  rowId: string;
  createdAtIso: string;
  minuta: string;
  nome: string;
  telefone: string;
  placa: string;
  placa_cavalo: string;
  placa_carreta: string | null;
  transportadora: string;
  previsao_descarregamento: string | null;
  status: QueueStatus;
  observacoes: string | null;
};

function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return value.toLocaleString("pt-BR", { hour12: false });
  }
  return String(value).trim();
}

function normalizePlaca(value: string): string {
  return value.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

const NAME_PARTICLES = new Set(["da", "das", "de", "do", "dos", "e"]);

/** Nome do motorista: "joão da silva" → "João Da Silva" com partículas em minúsculo. */
export function normalizeDriverName(value: string): string {
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";

  return cleaned
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((part, index) => {
      if (index > 0 && NAME_PARTICLES.has(part)) return part;
      if (part.length === 0) return part;
      return part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1);
    })
    .join(" ");
}

/** Transportadora: maiúsculas e espaços limpos. */
export function normalizeTransportadora(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

/** Minuta: remove espaços extras. */
export function normalizeMinuta(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

/** dd/mm/yyyy ou dd/mm/yyyy hh:mm:ss → ISO (America/Manaus, UTC-4). */
export function parseBrazilDateTime(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!match) {
    const fallback = new Date(trimmed);
    return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = match[4] != null ? Number(match[4]) : 12;
  const minute = match[5] != null ? Number(match[5]) : 0;
  const second = match[6] != null ? Number(match[6]) : 0;

  const utcMs = Date.UTC(year, month - 1, day, hour + 4, minute, second);
  const date = new Date(utcMs);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseBrazilDateOnly(value: string): string | null {
  const iso = parseBrazilDateTime(value);
  if (!iso) return null;
  const parsed = parsePrevisaoInput(iso.slice(0, 10));
  return parsed ? parsed.toISOString() : null;
}

/** FINALIZADO e DESCARREGADO → finalizado; vazio → aguardando descarregamento. */
export function mapGoogleFormStatus(raw: string): QueueStatus {
  const normalized = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toUpperCase();

  if (
    normalized === "FINALIZADO" ||
    normalized === "DESCARREGADO" ||
    normalized === "FINALIZADA" ||
    normalized === "DESCARREGADA"
  ) {
    return "finalizado";
  }

  if (normalized === "AUSENTE") return "ausente";
  if (
    normalized === "AGUARDANDO DESCARREGAMENTO" ||
    normalized.includes("AGUARDANDO")
  ) {
    return "aguardando_descarregamento";
  }
  return "aguardando_descarregamento";
}

export function buildGoogleFormRowId(carimbo: string, placaCavalo: string): string {
  const stamp = cellText(carimbo);
  const placa = normalizePlaca(placaCavalo);
  return `${stamp}|${placa || "SEMPLACA"}`;
}

function readMappedRow(row: GoogleFormRowPayload): Record<string, string> {
  if (Array.isArray(row.values) && row.values.length > 0) {
    const values = row.values;
    return {
      carimbo: cellText(values[GOOGLE_FORM_COLUMN_MAP.carimbo]),
      email: cellText(values[GOOGLE_FORM_COLUMN_MAP.email]),
      minuta: cellText(values[GOOGLE_FORM_COLUMN_MAP.minuta]),
      nome: cellText(values[GOOGLE_FORM_COLUMN_MAP.nome]),
      placa_cavalo: cellText(values[GOOGLE_FORM_COLUMN_MAP.placa_cavalo]),
      placa_carreta: cellText(values[GOOGLE_FORM_COLUMN_MAP.placa_carreta]),
      transportadora: cellText(values[GOOGLE_FORM_COLUMN_MAP.transportadora]),
      telefone: cellText(values[GOOGLE_FORM_COLUMN_MAP.telefone]),
      previsao: cellText(values[GOOGLE_FORM_COLUMN_MAP.previsao]),
      status: cellText(values[GOOGLE_FORM_COLUMN_MAP.status]),
      operador: cellText(values[GOOGLE_FORM_COLUMN_MAP.operador]),
      vencimento_nf: cellText(values[GOOGLE_FORM_COLUMN_MAP.vencimento_nf]),
    };
  }

  return {
    carimbo: cellText(row.carimbo),
    email: cellText(row.email),
    minuta: cellText(row.minuta),
    nome: cellText(row.nome),
    placa_cavalo: cellText(row.placa_cavalo),
    placa_carreta: cellText(row.placa_carreta),
    transportadora: cellText(row.transportadora),
    telefone: cellText(row.telefone),
    previsao: cellText(row.previsao),
    status: cellText(row.status),
    operador: cellText(row.operador),
    vencimento_nf: cellText(row.vencimento_nf),
  };
}

export function parseGoogleFormRow(
  row: GoogleFormRowPayload
): { ok: true; data: ParsedGoogleFormRow } | { ok: false; error: string } {
  const mapped = readMappedRow(row);

  if (!mapped.carimbo) {
    return { ok: false, error: "Carimbo de data/hora ausente." };
  }
  if (!mapped.nome) {
    return { ok: false, error: "Nome do motorista ausente." };
  }
  if (!mapped.placa_cavalo) {
    return { ok: false, error: "Placa do cavalo ausente." };
  }

  const createdAtIso = parseBrazilDateTime(mapped.carimbo);
  if (!createdAtIso) {
    return { ok: false, error: "Carimbo de data/hora inválido." };
  }

  const placaCavalo = normalizePlaca(mapped.placa_cavalo);
  const placaCarreta = mapped.placa_carreta ? normalizePlaca(mapped.placa_carreta) : null;
  const telefone = mapped.telefone.replace(/\D/g, "");
  const status = mapGoogleFormStatus(mapped.status);
  const nome = normalizeDriverName(mapped.nome);
  const transportadora =
    normalizeTransportadora(mapped.transportadora) || DEFAULT_CHECKIN_EMPRESA;
  const minuta = normalizeMinuta(mapped.minuta) || placaCavalo;

  const notes: string[] = [];
  if (mapped.email) notes.push(`E-mail: ${mapped.email}`);
  if (mapped.operador) notes.push(`Operador: ${normalizeDriverName(mapped.operador)}`);
  if (mapped.vencimento_nf) notes.push(`Venc. NF: ${mapped.vencimento_nf}`);

  const previsaoRaw = mapped.previsao;
  const previsao_descarregamento = previsaoRaw
    ? parseBrazilDateOnly(previsaoRaw)
    : null;

  return {
    ok: true,
    data: {
      rowId: buildGoogleFormRowId(mapped.carimbo, placaCavalo),
      createdAtIso,
      minuta,
      nome,
      telefone: telefone || "00000000000",
      placa: placaCavalo,
      placa_cavalo: placaCavalo,
      placa_carreta: placaCarreta,
      transportadora,
      previsao_descarregamento,
      status,
      observacoes: notes.length > 0 ? notes.join(" · ") : null,
    },
  };
}

export function buildGoogleFormInsertPayload(parsed: ParsedGoogleFormRow): Record<string, unknown> {
  return {
    google_form_row_id: parsed.rowId,
    driver_user_id: null,
    minuta: parsed.minuta,
    nome: parsed.nome,
    cpf: "",
    telefone: parsed.telefone,
    placa: parsed.placa,
    placa_cavalo: parsed.placa_cavalo,
    placa_carreta: parsed.placa_carreta,
    tipo_veiculo: "convencional",
    transportadora: parsed.transportadora,
    empresa: DEFAULT_CHECKIN_EMPRESA,
    tipo_carga: DEFAULT_CHECKIN_TIPO_CARGA,
    retorno_racks_vazios: false,
    observacoes: parsed.observacoes,
    previsao_descarregamento: parsed.previsao_descarregamento,
    status: parsed.status,
    created_at: parsed.createdAtIso,
    ...getStatusTimestampUpdates(parsed.status),
  };
}

export function buildGoogleFormUpdatePayload(
  parsed: ParsedGoogleFormRow,
  currentStatus: string
): Record<string, unknown> {
  const nextStatus = parsed.status;
  const patch: Record<string, unknown> = {
    minuta: parsed.minuta,
    nome: parsed.nome,
    telefone: parsed.telefone,
    placa: parsed.placa,
    placa_cavalo: parsed.placa_cavalo,
    placa_carreta: parsed.placa_carreta,
    transportadora: parsed.transportadora,
    previsao_descarregamento: parsed.previsao_descarregamento,
    observacoes: parsed.observacoes,
  };

  if (normalizeQueueStatus(currentStatus) !== nextStatus) {
    patch.status = nextStatus;
    Object.assign(patch, getStatusTimestampUpdates(nextStatus));
  }

  return patch;
}
