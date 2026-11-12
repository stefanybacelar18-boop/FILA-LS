/**
 * Cliente PG para o gateway (service role).
 * Só com URL explícita: CORTELY_GATEWAY_DATABASE_URL ou DATABASE_URL.
 * Sem defaults de usuário/senha — sem URL → null (rota 503).
 */
import type { PgQueryable } from "./pg";

let cached: PgQueryable | null | undefined;

export function clearGatewayDbCache() {
  cached = undefined;
}

export async function getGatewayDb(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PgQueryable | null> {
  if (cached !== undefined) return cached;

  const url =
    env.CORTELY_GATEWAY_DATABASE_URL?.trim() ||
    env.DATABASE_URL?.trim() ||
    "";

  if (!url) {
    cached = null;
    return null;
  }

  try {
    const pg = await import("pg");
    const pool = new pg.default.Pool({ connectionString: url });
    cached = {
      query: async (text, params) => {
        const res = await pool.query(text, params);
        return { rows: res.rows, rowCount: res.rowCount };
      },
    };
    return cached;
  } catch {
    cached = null;
    return null;
  }
}
