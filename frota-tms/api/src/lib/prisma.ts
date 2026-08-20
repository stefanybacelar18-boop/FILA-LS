import { PrismaClient } from '@prisma/client';
import { withConnectTimeout } from './health';

const datasourceUrl = withConnectTimeout(process.env.DATABASE_URL);

export const prisma = new PrismaClient(
  datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : undefined,
);
