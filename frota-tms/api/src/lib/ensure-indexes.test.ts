import { afterEach, describe, expect, it } from 'vitest';
import { CARGO_ITEM_SQL, ensureCargoItemTable } from './ensure-indexes';

describe('tabela de chassi e nota no Postgres', () => {
  const previous = process.env.DATABASE_URL;

  afterEach(() => {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  });

  it('usa SQL de Postgres, idempotente, sem DATETIME do SQLite', () => {
    const sql = CARGO_ITEM_SQL.join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "CargoItem"');
    expect(sql).toContain('TIMESTAMP(3)');
    expect(sql).not.toMatch(/DATETIME/i);
    expect(sql).toContain('"CargoItem_routeId_chassis_key"');
    expect(sql).toContain('"CargoItem_chassis_idx"');
    expect(sql).toContain('"CargoItem_invoiceKey_idx"');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).toContain('ON DELETE SET NULL');
  });

  it('cria a tabela quando o banco é Postgres', async () => {
    process.env.DATABASE_URL = 'postgresql://frota:frota@localhost:5432/frota_tms';
    const ran: string[] = [];
    await ensureCargoItemTable({
      $executeRawUnsafe: async (statement) => {
        ran.push(statement);
      },
    });
    expect(ran).toEqual([...CARGO_ITEM_SQL]);
  });

  it('não mexe no SQLite de desenvolvimento', async () => {
    process.env.DATABASE_URL = 'file:./dev.db';
    let calls = 0;
    await ensureCargoItemTable({
      $executeRawUnsafe: async () => {
        calls += 1;
      },
    });
    expect(calls).toBe(0);
  });
});
