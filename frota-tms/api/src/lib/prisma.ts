import { PrismaClient } from '@prisma/client';
import { normalizePrismaDatabaseUrl } from './database-url';

const datasourceUrl = normalizePrismaDatabaseUrl(process.env.DATABASE_URL);

if (datasourceUrl && process.env.NODE_ENV === 'production') {
  const safe = datasourceUrl.replace(/:[^:@/]+@/, ':****@');
  console.log(`Prisma DATABASE_URL: ${safe}`);
}

export const prisma = new PrismaClient(
  datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : undefined,
);
