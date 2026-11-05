import { describe, expect, it } from 'vitest';
import { TripStatus } from '../types/enums';
import { buildChronusPreview, parseChronusFile } from './chronus-import';
import { cargoDelivery, cargoLookupFilter, cargoSearchKey, invoiceKey } from './cargo-lookup';

describe('consulta de chassi e nota', () => {
  it('normaliza chassi e nota', () => {
    expect(cargoSearchKey(' 8chte-5720 vp100170 ')).toBe('8CHTE5720VP100170');
    expect(invoiceKey('000.000.656')).toBe('656');
    expect(cargoLookupFilter('000000656')).toEqual({ chassis: '000000656', invoiceKey: '656' });
    expect(cargoLookupFilter('656')).toEqual({ chassis: '656', invoiceKey: '656' });
    expect(cargoLookupFilter('8CHTE5720VP100170')?.invoiceKey).toBeNull();
    expect(cargoLookupFilter('12')).toBeNull();
  });

  it('marca entregue só quando a viagem da carga já retornou', () => {
    const departure = new Date('2026-11-01T09:00:00.000Z');
    const returnedAt = new Date('2026-11-02T18:00:00.000Z');
    expect(
      cargoDelivery([
        {
          status: TripStatus.RETORNOU,
          returnedAt,
          departureAt: departure,
          plate: 'BPQ1E82',
        },
      ]),
    ).toEqual({ situation: 'ENTREGUE', deliveredAt: returnedAt, plate: 'BPQ1E82' });

    expect(
      cargoDelivery([
        {
          status: TripStatus.EM_ANDAMENTO,
          returnedAt: null,
          departureAt: departure,
          plate: 'BPQ1E82',
        },
      ]).situation,
    ).toBe('EM_VIAGEM');

    expect(cargoDelivery([]).situation).toBe('SEM_VIAGEM');
  });

  it('uma viagem ainda aberta na mesma carga não conta como entregue', () => {
    const result = cargoDelivery([
      {
        status: TripStatus.RETORNOU,
        returnedAt: new Date('2026-10-02T18:00:00.000Z'),
        departureAt: new Date('2026-10-01T09:00:00.000Z'),
        plate: 'AAA1A11',
      },
      {
        status: TripStatus.ATRASADO,
        returnedAt: null,
        departureAt: new Date('2026-11-01T09:00:00.000Z'),
        plate: 'BPQ1E82',
      },
    ]);
    expect(result.situation).toBe('EM_VIAGEM');
    expect(result.plate).toBe('BPQ1E82');
  });
});

describe('import Chronus grava chassi e nota', () => {
  it('lê chassi e nota fiscal de cada linha do manifesto', async () => {
    const header = Array.from({ length: 43 }, () => '');
    header[0] = 'Minuta';
    header[4] = 'Chassi';
    header[5] = 'Modelo';
    header[12] = 'Nota Fiscal';
    header[14] = 'Cód. Concessionária';
    header[15] = 'Concessionária';
    header[17] = 'Cidade';
    header[26] = 'Manifesto';
    const line = Array.from({ length: 43 }, () => '');
    line[4] = '8chte5720vp100170';
    line[5] = 'TRX 420 FM';
    line[12] = '000000656';
    line[14] = '9631726';
    line[17] = 'ARACAJU';
    line[26] = '384200';
    const csv = [header.join(';'), line.join(';')].join('\n');

    const parsed = await parseChronusFile(Buffer.from(csv, 'latin1'), 'entregas.csv');
    const preview = await buildChronusPreview(parsed.rows, []);

    expect(preview.routes).toHaveLength(1);
    expect(preview.routes[0]?.units).toEqual([
      {
        chassis: '8CHTE5720VP100170',
        invoiceNumber: '000000656',
        invoiceKey: '656',
        model: 'TRX 420 FM',
        dealerCode: '9631726',
      },
    ]);
  });
});
