export type DbHealth = 'up' | 'down';

const DEFAULT_PROBE_TIMEOUT_MS = 2000;

/** Health do Render precisa responder 200 mesmo se o banco estiver lento. */
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
