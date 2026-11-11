import { timingSafeEqual } from "crypto";
import type { StaffRole } from "@/lib/types";

/**
 * Senhas de staff vêm só de variáveis de ambiente (nunca hardcoded).
 * Sem o secret correspondente, o login daquele papel falha.
 */
export function expectedPasswordForRole(role: StaffRole): string | null {
  const map: Record<StaffRole, string | undefined> = {
    owner: process.env.CORTELY_OWNER_PASSWORD,
    reception: process.env.CORTELY_RECEPTION_PASSWORD,
    barber: process.env.CORTELY_BARBER_PASSWORD,
  };
  const value = map[role]?.trim();
  return value && value.length >= 8 ? value : null;
}

export function passwordsMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
