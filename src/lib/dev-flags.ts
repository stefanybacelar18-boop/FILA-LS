/**
 * Bypasses só para desenvolvimento local — ignorados em produção,
 * mesmo que NEXT_PUBLIC_* esteja definido na Vercel por engano.
 */
function isDevBypassEnabled(serverKey: string, legacyPublicKey: string): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env[serverKey] === "true") return true;
  if (process.env[legacyPublicKey] === "true") return true;
  return false;
}

export function skipCheckinLimits(): boolean {
  return isDevBypassEnabled("SKIP_CHECKIN_LIMITS", "NEXT_PUBLIC_SKIP_CHECKIN_LIMITS");
}

export function skipGeofence(): boolean {
  return isDevBypassEnabled("SKIP_GEOFENCE", "NEXT_PUBLIC_SKIP_GEOFENCE");
}
