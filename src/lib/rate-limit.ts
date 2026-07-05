type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

/** Limite simples por chave (IP, userId…). Retorna true se permitido. */
export function rateLimitAllow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || now >= bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) return false;

  bucket.count += 1;
  return true;
}

export function rateLimitRetryAfterSec(key: string, windowMs: number): number {
  const bucket = store.get(key);
  if (!bucket) return 0;
  return Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000));
}
