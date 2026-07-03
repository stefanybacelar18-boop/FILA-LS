/** Rejeita se a promise não resolver dentro do prazo (evita travar o servidor). */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "Operação"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} demorou demais (${Math.round(ms / 1000)}s)`)), ms)
    ),
  ]);
}

/** fetch com AbortSignal.timeout quando disponível. */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 12_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(input, { ...rest, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}
