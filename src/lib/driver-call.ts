/** Timestamp estável de called_at para comparar chamadas (evita falsos positivos). */
export function parseCalledAtMs(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

export function isNewDriverCall(
  previousCalledAt: string | null | undefined,
  nextCalledAt: string | null | undefined
): boolean {
  const nextMs = parseCalledAtMs(nextCalledAt);
  if (nextMs <= 0) return false;
  return nextMs > parseCalledAtMs(previousCalledAt);
}
