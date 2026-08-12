import { describe, expect, it } from 'vitest';
import {
  buildMaintenanceCycles,
  filterCyclesByPeriod,
  parseBlockDetails,
  parseReleaseDetails,
} from './maintenance-report';

describe('maintenance-report', () => {
  it('pareia bloqueio e liberação na mesma linha', () => {
    const cycles = buildMaintenanceCycles([
      {
        action: 'BLOQUEIO_MANUTENCAO',
        createdAt: new Date('2026-08-01T10:00:00Z'),
        details: 'Manutenção: troca de embreagem',
        plate: 'ABC1D23',
        userName: 'Admin',
      },
      {
        action: 'LIBERACAO_MANUTENCAO',
        createdAt: new Date('2026-08-05T15:30:00Z'),
        details: 'Veículo OK — oficina liberou',
        plate: 'ABC1D23',
        userName: 'Operação',
      },
    ]);

    expect(cycles).toHaveLength(1);
    expect(cycles[0]?.status).toBe('Encerrado');
    expect(cycles[0]?.reason).toBe('troca de embreagem');
    expect(cycles[0]?.releaseNotes).toBe('oficina liberou');
    expect(cycles[0]?.daysStopped).toBeGreaterThanOrEqual(4);
  });

  it('mantém ciclo em aberto sem liberação', () => {
    const cycles = buildMaintenanceCycles([
      {
        action: 'BLOQUEIO_MANUTENCAO',
        createdAt: new Date('2026-08-10T08:00:00Z'),
        details: 'Outro motivo: aguardando peça',
        plate: 'XYZ9Z99',
        userName: 'Admin',
      },
    ]);

    expect(cycles).toHaveLength(1);
    expect(cycles[0]?.status).toBe('Em aberto');
    expect(cycles[0]?.exitAt).toBeNull();
  });

  it('parseia motivo e observação de liberação', () => {
    expect(parseBlockDetails('Manutenção: motor')).toEqual({
      category: 'Manutenção',
      reason: 'motor',
    });
    expect(parseReleaseDetails('Veículo OK — pronto')).toBe('pronto');
  });

  it('filtra ciclos que intersectam o período', () => {
    const cycles = buildMaintenanceCycles([
      {
        action: 'BLOQUEIO_MANUTENCAO',
        createdAt: new Date('2026-08-01T10:00:00Z'),
        details: 'Manutenção: a',
        plate: 'AAA1111',
        userName: 'A',
      },
      {
        action: 'LIBERACAO_MANUTENCAO',
        createdAt: new Date('2026-08-20T10:00:00Z'),
        details: 'Veículo liberado (OK) para novo carregamento',
        plate: 'AAA1111',
        userName: 'B',
      },
    ]);

    const filtered = filterCyclesByPeriod(
      cycles,
      new Date('2026-08-15T00:00:00Z'),
      new Date('2026-08-31T23:59:59Z'),
    );
    expect(filtered).toHaveLength(1);
  });
});
