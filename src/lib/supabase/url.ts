/** URL base do projeto — sem /rest/v1, /auth/v1 nem barra final. */
export function normalizeSupabaseUrl(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/auth\/v1\/?$/i, "");
}
