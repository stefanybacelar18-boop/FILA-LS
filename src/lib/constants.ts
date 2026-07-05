import type { QueueStatus, UserRole } from "./types";

export type AnyQueueStatus = QueueStatus | LegacyQueueStatus;

/** Status legados — dados antigos no banco; tratados como aguardando descarregamento na UI */
export type LegacyQueueStatus =
  | "aguardando"
  | "chamado"
  | "em_deslocamento"
  | "em_descarga"
  | "aguardando_carregamento_racks"
  | "cancelado";

export const APP_NAME = "FilaDock";
export const COMPANY_NAME = "PAD SIF";
export const SITE_FOOTER_BRAND = "LSL T. AM - PAD SIF";
export const BRANCH_TAGLINE = "Gestão inteligente de docas";

export const BRAND = {
  primary: "#1565C0",
  secondary: "#42A5F5",
  dark: "#0D1B2A",
  white: "#FFFFFF",
  gray: "#F5F7FA",
  success: "#2E7D32",
  danger: "#D32F2F",
} as const;

export const MOTORISTA_HOME = "/motorista";
export const MOTORISTA_CHECKIN = "/checkin";
export const CHECKIN_SUCCESS = "/checkin/sucesso";
export const FILA_DESCARGA_PUBLIC = "/fila-descarga";

/** Contas fixas @lsl.com — roles usados pelo ensure-profile (criar no Supabase Auth) */
export const FIXED_ACCOUNT_ROLES: Record<string, UserRole> = {
  "motorista@lsl.com": "motorista",
  "empilhador@lsl.com": "empilhador",
  "admin@lsl.com": "administrador",
};

/** Únicos status operacionais do sistema */
export const QUEUE_STATUSES: QueueStatus[] = [
  "aguardando_descarregamento",
  "ausente",
  "finalizado",
];

export const STATUS_LABELS: Record<QueueStatus, string> = {
  aguardando_descarregamento: "Aguardando descarregamento",
  ausente: "Ausente",
  finalizado: "Finalizado",
};

const LEGACY_STATUS_LABELS: Record<LegacyQueueStatus, string> = {
  aguardando: "Aguardando descarregamento",
  chamado: "Aguardando descarregamento",
  em_deslocamento: "Aguardando descarregamento",
  em_descarga: "Aguardando descarregamento",
  aguardando_carregamento_racks: "Aguardando descarregamento",
  cancelado: "Cancelado",
};

export function getStatusLabel(status: string): string {
  if (status in STATUS_LABELS) return STATUS_LABELS[status as QueueStatus];
  if (status in LEGACY_STATUS_LABELS) return LEGACY_STATUS_LABELS[status as LegacyQueueStatus];
  return status;
}

export function normalizeQueueStatus(status: string): QueueStatus {
  if (status === "ausente" || status === "finalizado") return status;
  if (status === "aguardando_descarregamento") return status;
  return "aguardando_descarregamento";
}

export const LEGACY_ACTIVE_STATUSES = [
  "aguardando",
  "chamado",
  "em_deslocamento",
  "em_descarga",
  "aguardando_carregamento_racks",
] as const;

/** Status persistidos na fila até finalizar (ausente permanece visível até voltar). */
export const ACTIVE_QUEUE_DB_STATUSES = [
  "aguardando_descarregamento",
  ...LEGACY_ACTIVE_STATUSES,
] as const;

/** Fila operacional visível nos painéis (ativos + ausentes aguardando retorno). */
export const OPERATIONAL_PANEL_DB_STATUSES = [
  ...ACTIVE_QUEUE_DB_STATUSES,
  "ausente",
] as const;

export function isAusenteQueueStatus(status: string): boolean {
  return normalizeQueueStatus(status) === "ausente";
}

export function isActiveQueueStatus(status: string): boolean {
  if (status === "ausente" || status === "finalizado" || status === "cancelado") return false;
  if (status === "aguardando_descarregamento") return true;
  return (LEGACY_ACTIVE_STATUSES as readonly string[]).includes(status);
}

export function shouldShowInQueuePanel(entry: { status: string }, showFinalizados: boolean): boolean {
  if (showFinalizados) {
    const normalized = normalizeQueueStatus(entry.status);
    return isActiveQueueStatus(entry.status) || normalized === "ausente" || normalized === "finalizado";
  }
  return isActiveQueueStatus(entry.status);
}

/** Painéis operacionais (motorista, empilhador, TV): fila ativa + ausentes aguardando retorno. */
export function isOperationalPanelEntry(entry: { status: string }): boolean {
  return isActiveQueueStatus(entry.status) || isAusenteQueueStatus(entry.status);
}

export function filterOperationalPanelEntries<T extends { status: string }>(entries: T[]): T[] {
  return entries.filter(isOperationalPanelEntry);
}

/** Status preferido para gravação (requer migracao-status-simplificado.sql) */
export function statusForDatabase(status: string): string {
  if (status === "aguardando_descarregamento") return "aguardando_descarregamento";
  return status;
}

/** Fallback se enum novo ainda não existir no Supabase */
export function statusForDatabaseLegacy(status: string): string {
  if (status === "aguardando_descarregamento") return "aguardando";
  return status;
}

export function isEnumStatusError(message: string): boolean {
  return /invalid input value for enum|queue_status/i.test(message);
}

export const STATUS_COLORS: Record<QueueStatus, string> = {
  aguardando_descarregamento: "bg-brand-muted/90 text-brand border-brand/25",
  ausente: "bg-orange-50 text-orange-900 border-orange-100",
  finalizado: "bg-emerald-50 text-emerald-800 border-emerald-100",
};

export function getStatusColor(status: string): string {
  return STATUS_COLORS[normalizeQueueStatus(status)] ?? "bg-slate-50 text-slate-700 border-slate-200";
}

export const ACTIVE_STATUSES: QueueStatus[] = ["aguardando_descarregamento"];

export const STAFF_GUARD_ROLES = [
  "empilhador",
  "administrador",
  "operador",
  "supervisor",
] as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  motorista: "Motorista",
  empilhador: "Empilhador",
  administrador: "Administrador",
};

export const ROLE_ROUTES: Record<UserRole, string> = {
  motorista: MOTORISTA_HOME,
  empilhador: "/empilhador",
  administrador: "/admin",
};

export const CARGO_TYPES = [
  "Granel",
  "Paletes",
  "Container",
  "Frigorificada",
  "Perigosa",
  "Outros",
];

/** Valores padrão quando o motorista não informa no check-in */
export const DEFAULT_CHECKIN_EMPRESA = "Não informado";
export const DEFAULT_CHECKIN_TIPO_CARGA = "Não informado";

export const VEHICLE_TYPES = [
  { value: "convencional", label: "Convencional" },
  { value: "bitrem", label: "Bitrem" },
] as const;

export const DEFAULT_GEOFENCE = {
  lat: -23.5505,
  lng: -46.6333,
  radius_meters: 100,
  name: "PAD SIF - Pátio",
};

export const CHECKIN_COOLDOWN_DAYS = 6;

/** Dev/testes — ignora cooldown de 6 dias e bloqueio de check-in ativo (NÃO use em produção) */
export function skipCheckinLimits(): boolean {
  return process.env.NEXT_PUBLIC_SKIP_CHECKIN_LIMITS === "true";
}

export const OUTSIDE_GEOFENCE_MESSAGE =
  "Você ainda não está no pátio da empresa. Aproxime-se da empresa para realizar o check-in.";

export const COOLDOWN_MESSAGE =
  "Novo check-in indisponível: aguarde 6 dias após o último check-in ou solicite liberação à administração do pátio.";

export const WHATSAPP_CALL_TEMPLATE =
  "PAD SIF\n\nMotorista da minuta {MINUTA},\n\nFavor dirigir-se imediatamente para a doca {DOCA} para início da operação de descarga.\n\nObrigado.";

/** Mensagem de chamada para empilhador — sem referência a doca */
export const WHATSAPP_EMPILHADOR_CALL_TEMPLATE =
  "PAD SIF · FilaDock\n\nOlá, motorista da minuta {MINUTA}!\n\nVocê foi chamado para descarregamento no pátio.\nPor favor, dirija-se à área de descarga o mais breve possível.\n\nObrigado!";

export const ALL_QUEUE_STATUSES = QUEUE_STATUSES;
