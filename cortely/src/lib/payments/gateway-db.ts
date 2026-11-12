/**
 * Cliente PG para o gateway (service role).
 * Em CI/testes: CORTELY_GATEWAY_DATABASE_URL / DATABASE_URL / PG*.
 * Sem URL → null (rota responde 503).
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

  try {
    const pg = await import("pg");
    if (url) {
      const pool = new pg.default.Pool({ connectionString: url });
      cached = {
        query: async (text, params) => {
          const res = await pool.query(text, params);
          return { rows: res.rows, rowCount: res.rowCount };
        },
      };
      return cached;
    }
    if (env.PGHOST || env.PGPASSWORD) {
      const pool = new pg.default.Pool({
        host: env.PGHOST || "127.0.0.1",
        port: Number(env.PGPORT || "5432"),
        user: env.PGUSER || "postgres",
        password: env.PGPASSWORD || "postgres",
        database: env.PGDATABASE || "postgres",
      });
      cached = {
        query: async (text, params) => {
          const res = await pool.query(text, params);
          return { rows: res.rows, rowCount: res.rowCount };
        },
      };
      return cached;
    }
  } catch {
    cached = null;
    return null;
  }

  cached = null;
  return null;
}
