import { CHECKIN_COOLDOWN_DAYS, isActiveQueueStatus, skipCheckinLimits } from "./constants";
import type { Profile, QueueEntry } from "./types";

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

export function maskPlaca(placa: string): string {
  const clean = placa.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (clean.length <= 4) return "****";
  return `****${clean.slice(-4)}`;
}

export function getDisplayPlaca(entry: QueueEntry): string {
  return entry.placa_cavalo || entry.placa;
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

export function hasActiveCheckIn(entries: QueueEntry[]): QueueEntry | null {
  return (
    entries.find((e) => !e.deleted_at && isActiveQueueStatus(e.status)) ?? null
  );
}
