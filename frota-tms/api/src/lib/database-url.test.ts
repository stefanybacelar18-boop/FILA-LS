import { describe, expect, it } from 'vitest';
import { normalizePrismaDatabaseUrl, relationLoadStrategyForUrl } from './database-url';

const TRANSACTION =
  'postgresql://postgres.ref:eneed9DL%3DAymb%2A4@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1';

describe('normalizePrismaDatabaseUrl', () => {
  it('não altera sqlite local', () => {
    expect(normalizePrismaDatabaseUrl('file:./dev.db', { serverless: false })).toBe('file:./dev.db');
  });

  it('no Render troca pooler 6543 por sessão 5432 e abre pool', () => {
    expect(normalizePrismaDatabaseUrl(TRANSACTION, { serverless: false })).toBe(
      'postgresql://postgres.ref:eneed9DL%3DAymb%2A4@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?connection_limit=10&connect_timeout=5&pool_timeout=10',
    );
  });

  it('na Vercel mantém transaction pooler (serverless)', () => {
    expect(normalizePrismaDatabaseUrl(TRANSACTION, { serverless: true })).toBe(
      `${TRANSACTION}&connect_timeout=5&pool_timeout=10`,
    );
  });

  it('remove connection_limit=1 mesmo na porta 5432 (processo longo)', () => {
    const session =
      'postgresql://postgres.ref:x@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?connection_limit=1';
    expect(normalizePrismaDatabaseUrl(session, { serverless: false })).toBe(
      'postgresql://postgres.ref:x@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?connection_limit=10&connect_timeout=5&pool_timeout=10',
    );
  });
});

describe('relationLoadStrategyForUrl', () => {
  it('usa join no Postgres (uma ida ao banco por include)', () => {
    expect(relationLoadStrategyForUrl(TRANSACTION)).toBe('join');
  });

  it('usa query no sqlite', () => {
    expect(relationLoadStrategyForUrl('file:./dev.db')).toBe('query');
  });
});
