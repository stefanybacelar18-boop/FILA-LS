import { describe, expect, it } from 'vitest';
import { healthPayload, probeDatabase, withConnectTimeout } from './health';

describe('withConnectTimeout', () => {
  it('acrescenta timeouts quando a URL não tem', () => {
    expect(withConnectTimeout('postgresql://u:p@h:5432/db')).toBe(
      'postgresql://u:p@h:5432/db?connect_timeout=5&pool_timeout=5',
    );
  });

  it('usa & quando a URL já tem query', () => {
    expect(withConnectTimeout('postgresql://u:p@h:5432/db?sslmode=require')).toBe(
      'postgresql://u:p@h:5432/db?sslmode=require&connect_timeout=5&pool_timeout=5',
    );
  });

  it('não duplica connect_timeout', () => {
    const url = 'postgresql://u:p@h:5432/db?connect_timeout=8';
    expect(withConnectTimeout(url)).toBe(url);
  });

  it('preserva URL vazia', () => {
    expect(withConnectTimeout(undefined)).toBeUndefined();
    expect(withConnectTimeout('')).toBe('');
  });
});

describe('probeDatabase', () => {
  it('retorna up quando a query resolve', async () => {
    await expect(probeDatabase(async () => 1)).resolves.toBe('up');
  });

  it('retorna down quando a query falha', async () => {
    await expect(probeDatabase(async () => Promise.reject(new Error('nope')))).resolves.toBe(
      'down',
    );
  });

  it('retorna down quando estoura o timeout', async () => {
    await expect(
      probeDatabase(() => new Promise(() => {}), 20),
    ).resolves.toBe('down');
  });
});

describe('healthPayload', () => {
  it('sempre marca o processo como ok (liveness do Render)', () => {
    expect(
      healthPayload({ db: 'down', uptimeSec: 3, commit: 'abc1234' }),
    ).toEqual({
      ok: true,
      service: 'frota-tms-api',
      db: 'down',
      uptimeSec: 3,
      commit: 'abc1234',
    });
  });
});
