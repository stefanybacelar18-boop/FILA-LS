/**
 * Integração Google Form / planilha do sistema antigo.
 * Desligada em produção por padrão — ative só com GOOGLE_FORM_SYNC_ENABLED=true.
 */
export function isGoogleFormSyncEnabled(): boolean {
  return process.env.GOOGLE_FORM_SYNC_ENABLED?.trim() === "true";
}

export const GOOGLE_FORM_SYNC_DISABLED_MESSAGE =
  "Integração com planilha do Google Form desativada em produção.";
