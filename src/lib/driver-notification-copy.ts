export const DRIVER_CALL_PUSH_TITLE = "FilaDock — Chamada para descarga";

export const DRIVER_CALL_PUSH_BODY_FALLBACK =
  "Dirija-se ao ponto de operação imediatamente. Sua presença foi solicitada pela equipe.";

export function buildDriverCallPushBody(options: {
  minuta?: string | null;
  placa?: string | null;
  doca?: string | null;
}): string {
  const label = options.minuta?.trim() || options.placa?.trim() || "sua minuta";
  const doca = options.doca?.trim();

  if (doca) {
    return `Minuta ${label} — Doca ${doca}. Apresente-se no local imediatamente.`;
  }

  return `Minuta ${label}. Dirija-se ao ponto de operação imediatamente.`;
}

export const DRIVER_CALL_BANNER_TITLE = "Você foi chamado para descarga";

export const DRIVER_CALL_BANNER_BODY =
  "Dirija-se ao ponto de operação imediatamente e aguarde orientação da equipe.";
