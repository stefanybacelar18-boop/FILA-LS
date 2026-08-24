import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseOperationalDateTime } from '../utils/timezone';
import {
  buildPriorityExpiryDetailRows,
  buildPriorityExpiryWorkbook,
  expirySituation,
  groupPriorityExpiryByDealership,
  groupPriorityExpiryByPlateRoute,
  type PriorityExpiryInputRoute,
} from './priority-expiry-export';

const today = '2026-08-24';

function dealer(id: string, name: string, city: string, extra?: { code?: string; state?: string }) {
  return { id, name, city, state: extra?.state ?? 'BA', code: extra?.code ?? id };
}

function route(partial: Partial<PriorityExpiryInputRoute> & Pick<PriorityExpiryInputRoute, 'name'>): PriorityExpiryInputRoute {
  return {
    date: '2026-08-24',
    status: 'EM_ANDAMENTO',
    hasPriority: true,
    ...partial,
  };
}

describe('priority-expiry-export', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(parseOperationalDateTime(today, '12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('classifica vencido, hoje, amanhã e em alguns dias', () => {
    expect(expirySituation('2026-08-20', today)).toMatchObject({ situacao: 'Vencido', tone: 'expired' });
    expect(expirySituation('2026-08-24', today)).toMatchObject({ situacao: 'Vence hoje', tone: 'today' });
    expect(expirySituation('2026-08-25', today)).toMatchObject({ situacao: 'Vence amanhã', tone: 'tomorrow' });
    expect(expirySituation('2026-08-27', today)).toMatchObject({ situacao: 'Em 3 dias', tone: 'later' });
    expect(expirySituation(null, today)).toMatchObject({ situacao: 'Sem vencimento', tone: 'none' });
  });

  it('lista só prioridades abertas, uma linha por concessionária, sem Pombal/Euclides', () => {
    const rows = buildPriorityExpiryDetailRows(
      [
        route({
          name: '376614 24/08/2026',
          priorityExpiryDate: '2026-08-24',
          dealerships: [
            { motoCount: 4, minExpiryDate: '2026-08-24', dealership: dealer('a', 'MOTO CLUBE', 'ARACAJU', { code: '123' }) },
            { motoCount: 2, minExpiryDate: '2026-08-20', dealership: dealer('b', 'POMBAL MOTOS', 'POMBAL') },
            { motoCount: 3, minExpiryDate: '2026-08-25', dealership: dealer('c', 'EUCLIDES MOTOS', 'EUCLIDES DA CUNHA') },
          ],
          vehicles: [{ vehicle: { plate: 'EOE1F87', defaultDriver: 'RICARDO' } }],
          trips: [{ status: 'EM_ANDAMENTO', driverName: 'RICARDO DE JESUS', vehicle: { plate: 'EOE1F87' } }],
        }),
        route({
          name: 'concluido',
          status: 'CONCLUIDO',
          dealerships: [{ motoCount: 1, minExpiryDate: '2026-08-24', dealership: dealer('z', 'X', 'SALVADOR') }],
        }),
        route({
          name: 'sem prioridade',
          hasPriority: false,
          priorityExpiryDate: '2026-09-10',
          dealerships: [{ motoCount: 1, minExpiryDate: '2026-09-10', dealership: dealer('y', 'Y', 'SALVADOR') }],
        }),
      ],
      today,
    );

    expect(rows.map((r) => r.concessionaria)).toEqual(['MOTO CLUBE']);
    expect(rows[0]).toMatchObject({
      situacao: 'Vence hoje',
      cidade: 'ARACAJU',
      codigo: '123',
      motos: 4,
      placa: 'EOE1F87',
      motorista: 'RICARDO DE JESUS',
      vencimentoLabel: '24/08/2026',
    });
  });

  it('agrupa a mesma concessionária pelo menor vencimento', () => {
    const detail = buildPriorityExpiryDetailRows(
      [
        route({
          name: 'A',
          dealerships: [
            { motoCount: 2, minExpiryDate: '2026-08-25', dealership: dealer('d1', 'SERGIPANA', 'ESTANCIA') },
          ],
          vehicles: [{ vehicle: { plate: 'AAA0001' } }],
        }),
        route({
          name: 'B',
          dealerships: [
            { motoCount: 5, minExpiryDate: '2026-08-24', dealership: dealer('d1', 'SERGIPANA', 'ESTANCIA') },
          ],
          vehicles: [{ vehicle: { plate: 'BBB0002' } }],
        }),
      ],
      today,
    );
    const grouped = groupPriorityExpiryByDealership(detail);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      concessionaria: 'SERGIPANA',
      situacao: 'Vence hoje',
      vencimentoLabel: '24/08/2026',
      placa: 'BBB0002',
      roteiro: 'B',
    });
  });

  it('agrupa por placa/roteiro com destinos e menor vencimento', () => {
    const detail = buildPriorityExpiryDetailRows(
      [
        route({
          name: '376614 24/08/2026',
          dealerships: [
            { motoCount: 4, minExpiryDate: '2026-08-25', dealership: dealer('a', 'MOTO CLUBE', 'ARACAJU') },
            { motoCount: 3, minExpiryDate: '2026-08-24', dealership: dealer('b', 'ARIBE', 'SOCORRO') },
          ],
          vehicles: [{ vehicle: { plate: 'EOE1F87' } }],
          trips: [{ status: 'EM_ANDAMENTO', driverName: 'RICARDO', vehicle: { plate: 'EOE1F87' } }],
        }),
      ],
      today,
    );
    const grouped = groupPriorityExpiryByPlateRoute(detail);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      placa: 'EOE1F87',
      motorista: 'RICARDO',
      roteiro: '376614 24/08/2026',
      situacao: 'Vence hoje',
      vencimentoLabel: '24/08/2026',
      motos: 7,
    });
    expect(grouped[0].destinos).toContain('ARIBE (24/08/2026)');
    expect(grouped[0].destinos).toContain('MOTO CLUBE (25/08/2026)');
  });

  it('ordena o detalhe por placa e roteiro', () => {
    const rows = buildPriorityExpiryDetailRows(
      [
        route({
          name: 'tarde',
          vehicles: [{ vehicle: { plate: 'BBB0002' } }],
          dealerships: [{ minExpiryDate: '2026-08-25', dealership: dealer('2', 'B', 'SSA') }],
        }),
        route({
          name: 'cedo',
          vehicles: [{ vehicle: { plate: 'AAA0001' } }],
          dealerships: [{ minExpiryDate: '2026-08-20', dealership: dealer('1', 'A', 'SSA') }],
        }),
      ],
      today,
    );
    expect(rows.map((r) => r.placa)).toEqual(['AAA0001', 'BBB0002']);
  });

  it('gera Excel com aba por placa e roteiro e resumo de concessionária', async () => {
    const wb = await buildPriorityExpiryWorkbook(
      [
        route({
          name: '376614 24/08/2026',
          vehicles: [{ vehicle: { plate: 'EOE1F87' } }],
          dealerships: [
            { motoCount: 4, minExpiryDate: '2026-08-24', dealership: dealer('a', 'MOTO CLUBE', 'ARACAJU') },
          ],
        }),
      ],
      today,
    );
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Por placa e roteiro', 'Resumo concessionária']);
    expect(wb.getWorksheet('Por placa e roteiro')?.rowCount).toBe(2);
    expect(wb.getWorksheet('Por placa e roteiro')?.getRow(2).getCell(1).value).toBe('EOE1F87');
    expect(wb.getWorksheet('Resumo concessionária')?.getRow(2).getCell(3).value).toBe('MOTO CLUBE');
  });
});
