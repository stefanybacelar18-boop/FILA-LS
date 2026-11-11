/**
 * Rate limit em memória por chave (IP, telefone, e-mail).
 * Suficiente para o host single-process do app publicado.
 */

type Bucket = {
  count: number;
  resetAt: number;
  lockUntil?: number;
};

const g = globalThis as typeof globalThis & {
  __cortelyRateLimit?: Map<string, Bucket>;
};

function store() {
  if (!g.__cortelyRateLimit) g.__cortelyRateLimit = new Map();
  return g.__cortelyRateLimit;
}

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number; error: string };

export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number; lockMs?: number },
): RateLimitResult {
  const now = Date.now();
  const map = store();
  let bucket = map.get(key);

  if (bucket?.lockUntil && bucket.lockUntil > now) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((bucket.lockUntil - now) / 1000),
      error: "Muitas tentativas. Aguarde e tente de novo.",
    };
  }

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
  }

  bucket.count += 1;
  map.set(key, bucket);

  if (bucket.count > opts.limit) {
    if (opts.lockMs) {
      bucket.lockUntil = now + opts.lockMs;
      map.set(key, bucket);
    }
    return {
      ok: false,
      retryAfterSec: Math.ceil(
        ((bucket.lockUntil ?? bucket.resetAt) - now) / 1000,
      ),
      error: "Muitas tentativas. Aguarde e tente de novo.",
    };
  }

  return { ok: true, remaining: opts.limit - bucket.count };
}

export function clientIp(req: { headers: Headers }) {
  // Preferir cabeçalhos definidos pelo host (não controlados pelo visitante).
  const platform =
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-vercel-forwarded-for");
  if (platform) {
    return platform.split(",")[0]?.trim() || "unknown";
  }
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    // Plataforma que acrescenta o IP real à direita; a esquerda o cliente controla.
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    return parts[parts.length - 1] || "unknown";
  }
  return "unknown";
}

/** Em rotas sensíveis, IP desconhecido usa limites mais rígidos. */
export function sensitiveIpKey(prefix: string, ip: string) {
  if (!ip || ip === "unknown") return `${prefix}:untrusted`;
  return `${prefix}:${ip}`;
}
