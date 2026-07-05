import { CHECKIN_COOLDOWN_DAYS, isActiveQueueStatus, skipCheckinLimits } from "./constants";
import type { Profile, QueueEntry } from "./types";

export type CheckinCooldownBlock = {
  lastCheckInAt: Date;
  availableAt: Date;
  cooldownDays: number;
};

function formatCheckinDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Manaus",
  }).format(date);
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  const key = "fila-lsl-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = createDeviceId();
    localStorage.setItem(key, id);
  }
  return id;
}

/** HTTP no celular (IP local) não é contexto seguro — crypto.randomUUID pode falhar */
function createDeviceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // continua para fallback
    }
  }
  return `mob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function getUserAgent(): string {
  if (typeof window === "undefined") return "unknown";
  return navigator.userAgent;
}

export function maskPlaca(placa?: string | null): string {
  if (!placa?.trim()) return "****";
  const clean = placa.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (clean.length <= 4) return "****";
  return `****${clean.slice(-4)}`;
}

export function shouldRevealPlacaForViewer(
  entry: Pick<QueueEntry, "driver_user_id">,
  viewerUserId?: string | null
): boolean {
  return Boolean(viewerUserId && entry.driver_user_id === viewerUserId);
}

type PlacaFields = Pick<
  QueueEntry,
  "placa" | "placa_cavalo" | "placa_carreta" | "placa_segunda_carreta"
>;

/** Oculta placas (LGPD) — use reveal=true só para o próprio motorista logado. */
export function maskQueueEntryPlacas<T extends PlacaFields>(entry: T, reveal: boolean): T {
  if (reveal) return entry;
  return {
    ...entry,
    placa: maskPlaca(entry.placa),
    placa_cavalo: entry.placa_cavalo ? maskPlaca(entry.placa_cavalo) : entry.placa_cavalo,
    placa_carreta: entry.placa_carreta ? maskPlaca(entry.placa_carreta) : entry.placa_carreta,
    placa_segunda_carreta: entry.placa_segunda_carreta
      ? maskPlaca(entry.placa_segunda_carreta)
      : entry.placa_segunda_carreta,
  };
}

export function getViewerPlaca(
  entry: Pick<QueueEntry, "placa_cavalo" | "placa" | "placa_carreta">,
  reveal: boolean,
  options?: { preferCarreta?: boolean }
): string {
  const preferCarreta = options?.preferCarreta ?? true;
  const raw = preferCarreta
    ? entry.placa_carreta?.trim() || entry.placa?.trim() || entry.placa_cavalo?.trim() || ""
    : entry.placa_cavalo?.trim() || entry.placa?.trim() || "";
  if (!raw) return "—";
  return reveal ? raw : maskPlaca(raw);
}

export function getDisplayPlaca(entry: Pick<QueueEntry, "placa_cavalo" | "placa">): string {
  return entry.placa_cavalo?.trim() || entry.placa?.trim() || "—";
}

export function canCheckInAgain(
  lastEntry: QueueEntry | null,
  profile: Pick<Profile, "checkin_liberado">,
  cooldownDays = CHECKIN_COOLDOWN_DAYS
): { allowed: boolean; reason?: string } {
  if (skipCheckinLimits() || profile.checkin_liberado) return { allowed: true };

  if (!lastEntry) return { allowed: true };

  const lastDate = new Date(lastEntry.created_at);
  const cooldownEnd = new Date(lastDate);
  cooldownEnd.setDate(cooldownEnd.getDate() + cooldownDays);

  if (new Date() < cooldownEnd) {
    return { allowed: false, reason: "cooldown" };
  }

  return { allowed: true };
}

/** Bloqueio por cooldown — null se check-in permitido. */
export function getCheckinCooldownBlock(
  lastEntry: QueueEntry | null,
  profile: Pick<Profile, "checkin_liberado">,
  cooldownDays = CHECKIN_COOLDOWN_DAYS
): CheckinCooldownBlock | null {
  if (skipCheckinLimits() || profile.checkin_liberado || !lastEntry) return null;

  const lastCheckInAt = new Date(lastEntry.created_at);
  const availableAt = new Date(lastCheckInAt);
  availableAt.setDate(availableAt.getDate() + cooldownDays);

  if (new Date() >= availableAt) return null;

  return { lastCheckInAt, availableAt, cooldownDays };
}

export function formatCheckinCooldownMessage(block: CheckinCooldownBlock): string {
  const last = formatCheckinDate(block.lastCheckInAt);
  const next = formatCheckinDate(block.availableAt);
  return `Seu último check-in foi em ${last}. Por regra do pátio, um novo check-in só é permitido após ${block.cooldownDays} dias — a partir de ${next}.`;
}

export function hasActiveCheckIn(entries: QueueEntry[]): QueueEntry | null {
  return (
    entries.find((e) => !e.deleted_at && isActiveQueueStatus(e.status)) ?? null
  );
}
