import { PrismaClient } from '@prisma/client';
import { normalizePrismaDatabaseUrl } from './database-url';

const datasourceUrl = normalizePrismaDatabaseUrl(process.env.DATABASE_URL);

export const prisma = new PrismaClient(
  datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : undefined,
);
