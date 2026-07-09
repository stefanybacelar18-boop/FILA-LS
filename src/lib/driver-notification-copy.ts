export const DRIVER_CALL_PUSH_TITLE = "FilaDock — Chamada para descarga";

export const DRIVER_CALL_PUSH_BODY_FALLBACK =
  "Você foi chamado para descarga. Apresente-se no ponto de operação imediatamente.";

export const DRIVER_CALL_PUSH_BODY =
  "Você foi chamado para descarga. Apresente-se no ponto de operação imediatamente.";

export function buildDriverCallPushTitle(options: {
  minuta?: string | null;
  placa?: string | null;
}): string {
  const label = options.minuta?.trim() || options.placa?.trim();
  if (!label) return DRIVER_CALL_PUSH_TITLE;
  return `FilaDock — Minuta ${label}`;
}

export function buildDriverCallPushBody(): string {
  return DRIVER_CALL_PUSH_BODY;
}

export const DRIVER_CALL_BANNER_TITLE = "Você foi chamado para descarga";

export const DRIVER_CALL_BANNER_BODY =
  "Dirija-se ao ponto de operação imediatamente e aguarde orientação da equipe.";
