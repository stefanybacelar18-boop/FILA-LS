/**
 * Ajusta DATABASE_URL para Prisma.
 *
 * No Render o processo Node fica ligado: Prisma precisa de pool > 1 e
 * sessão Postgres (porta 5432). A URL de serverless (6543 + pgbouncer +
 * connection_limit=1) serializa todas as queries e deixa o site lento.
 */
export function normalizePrismaDatabaseUrl(
  url: string | undefined,
  opts: { serverless?: boolean } = {},
): string | undefined {
  if (!url) return url;

  const serverless = opts.serverless ?? Boolean(process.env.VERCEL);
  let next = url.trim();

  if (!serverless) {
    next = next.replace(/pooler\.supabase\.com:6543/gi, 'pooler.supabase.com:5432');
    next = stripQueryParam(next, 'pgbouncer');
    next = stripQueryParam(next, 'connection_limit');
    if (isPostgresUrl(next) && /pooler\.supabase\.com/i.test(next)) {
      next = appendQuery(next, 'connection_limit', '10');
    }
  }

  if (isPostgresUrl(next)) {
    if (!hasQueryParam(next, 'connect_timeout')) {
      next = appendQuery(next, 'connect_timeout', '5');
    }
    if (!hasQueryParam(next, 'pool_timeout')) {
      next = appendQuery(next, 'pool_timeout', '10');
    }
  }

  return next;
}

export function isPostgresUrl(url: string | undefined): boolean {
  return Boolean(url && /^postgres(ql)?:\/\//i.test(url));
}

/** SQLite (dev/testes) não suporta JOIN de relações; Postgres sim. */
export function relationLoadStrategyForUrl(url: string | undefined): 'join' | 'query' {
  return isPostgresUrl(url) ? 'join' : 'query';
}

function hasQueryParam(url: string, key: string): boolean {
  const qs = url.split('?')[1];
  if (!qs) return false;
  const prefix = `${key.toLowerCase()}=`;
  return qs.split('&').some((part) => part.toLowerCase().startsWith(prefix));
}

function stripQueryParam(url: string, key: string): string {
  const qIndex = url.indexOf('?');
  if (qIndex < 0) return url;
  const base = url.slice(0, qIndex);
  const kept = url
    .slice(qIndex + 1)
    .split('&')
    .filter((part) => part && !part.toLowerCase().startsWith(`${key.toLowerCase()}=`));
  return kept.length ? `${base}?${kept.join('&')}` : base;
}

function appendQuery(url: string, key: string, value: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${key}=${value}`;
}
