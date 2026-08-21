import { PrismaClient } from '@prisma/client';
import { normalizePrismaDatabaseUrl, relationLoadStrategyForUrl } from './database-url';

const datasourceUrl = normalizePrismaDatabaseUrl(process.env.DATABASE_URL);
const relationLoadStrategy = relationLoadStrategyForUrl(datasourceUrl);

if (datasourceUrl && process.env.NODE_ENV === 'production') {
  const safe = datasourceUrl.replace(/:[^:@/]+@/, ':****@');
  console.log(`Prisma DATABASE_URL: ${safe} · relations=${relationLoadStrategy}`);
}

const FIND_OPS = new Set([
  'findMany',
  'findFirst',
  'findUnique',
  'findFirstOrThrow',
  'findUniqueOrThrow',
]);

const base = new PrismaClient(
  datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : undefined,
);

/**
 * No Postgres (Render↔Supabase SP) cada `include` virava várias idas ao banco (~300 ms cada).
 * `join` busca relações num SQL só. No sqlite de teste permanece `query`.
 * Cast para PrismaClient: o client estendido quebra o tipo de `$transaction`.
 */
export const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ operation, args, query }) {
        if (FIND_OPS.has(operation) && args && typeof args === 'object') {
          const next = args as { relationLoadStrategy?: 'join' | 'query' };
          if (!next.relationLoadStrategy) next.relationLoadStrategy = relationLoadStrategy;
        }
        return query(args);
      },
    },
  },
}) as unknown as PrismaClient;
