export type DbHealth = 'up' | 'down';

const DEFAULT_CONNECT_TIMEOUT_SEC = 5;
const DEFAULT_PROBE_TIMEOUT_MS = 2000;

/** Evita Prisma/Postgres pendurar o health check no cold start do Render Free. */
export function withConnectTimeout(
  url: string | undefined,
  seconds = DEFAULT_CONNECT_TIMEOUT_SEC,
): string | undefined {
  if (!url) return url;
  if (/[?&](connect_timeout|connectTimeout)=/i.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connect_timeout=${seconds}&pool_timeout=${seconds}`;
}

export async function probeDatabase(
  query: () => Promise<unknown>,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<DbHealth> {
  try {
    await Promise.race([
      query(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('db-probe-timeout')), timeoutMs);
      }),
    ]);
    return 'up';
  } catch {
    return 'down';
  }
}

export function healthPayload(opts: {
  db: DbHealth;
  uptimeSec: number;
  commit?: string | null;
}) {
  return {
    ok: true as const,
    service: 'frota-tms-api',
    db: opts.db,
    uptimeSec: opts.uptimeSec,
    commit: opts.commit ?? null,
  };
}
