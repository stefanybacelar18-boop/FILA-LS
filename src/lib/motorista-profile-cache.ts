import type { MotoristaProfileRow } from "@/lib/auth-profile";

const CACHE_KEY = "filadock-motorista-profile";

type CachedMotoristaProfile = {
  userId: string;
  profile: MotoristaProfileRow;
};

export function readCachedMotoristaProfile(userId: string): MotoristaProfileRow | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedMotoristaProfile;
    if (parsed.userId !== userId) return null;
    return parsed.profile;
  } catch {
    return null;
  }
}

export function writeCachedMotoristaProfile(
  userId: string,
  profile: MotoristaProfileRow
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedMotoristaProfile = { userId, profile };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // quota / modo privado
  }
}

export function clearCachedMotoristaProfile(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
