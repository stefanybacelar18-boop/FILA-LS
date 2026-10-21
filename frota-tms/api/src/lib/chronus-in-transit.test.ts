import { describe, expect, it } from 'vitest';
import { RouteStatus } from '../types/enums';
import { operationalDateKey } from '../utils/timezone';
import { buildChronusPreview, parseChronusFile, type ChronusRow } from './chronus-import';
import {
  chronusRowInTransitKind,
  enrichChronusInTransitPreview,
  isChronusInTransitStartable,
  matchDriverName,
  pickManifestRealPlate,
  resolveManifestInTransit,
} from './chronus-in-transit';

function entregasCsv(rows: string[][]): string {
  const header = Array.from({ length: 43 }, () => '');
  header[0] = 'Minuta';
  header[14] = 'Cód. Concessionária';
  header[15] = 'Concessionária';
  header[17] = 'Cidade';
  header[20] = 'Vencimento N.F.';
  header[22] = 'Data Envio';
  header[23] = 'Data Chegada';
  header[25] = 'Placa do Caminhão';
  header[26] = 'Manifesto';
  header[28] = 'Status';
  header[34] = 'Motorista';
  const body = rows.map((partial) => {
    const line = Array.from({ length: 43 }, () => '');
    partial.forEach((value, idx) => {
      line[idx] = value;
    });
    return line.join(';');
  });
  return [header.join(';'), ...body].join('\n');
}

function row(over: Partial<ChronusRow>): ChronusRow {
  return {
    manifesto: '400111',
    dealerCode: '123',
    dealerName: 'MOTOS SALVADOR',
    city: 'SALVADOR',
    expiryRaw: '20/10/2026',
    plate: 'IAK2E92',
    status: 'EM TRANSITO',
    sentAt: '13/10/2026',
    arrivedAt: '',
    deliveredAt: '',
    driverName: 'JOSE DA SILVA',
    ...over,
  };
}

const fleet = [
  {
    id: 'v1',
    plate: 'IAK2E92',
    status: 'DISPONIVEL',
    type: 'CARRETA',
    capacityMotos: 50,
    defaultDriver: 'JOSE DA SILVA',
    owner: 'AG',
    maintenanceHold: false,
  },
];
const drivers = [{ id: 'd1', name: 'Jose da Silva' }];

describe('chronusRowInTransitKind', () => {
  it('marca saída real sem chegada como em trânsito', () => {
    expect(chronusRowInTransitKind(row({}))).toBe('in_transit');
  });

  it('ignora placa fictícia do planejamento', () => {
    expect(chronusRowInTransitKind(row({ plate: 'LSL50' }))).toBe('fictional');
    expect(chronusRowInTransitKind(row({ plate: 'AG70' }))).toBe('fictional');
  });

  it('ignora estoque sem data de envio', () => {
    expect(chronusRowInTransitKind(row({ status: 'ESTOQUE', sentAt: '', arrivedAt: '' }))).toBe(
      'not_departed',
    );
  });

  it('ignora já entregue / com Data Entrega (chegada real)', () => {
    expect(chronusRowInTransitKind(row({ status: 'ENTREGUE' }))).toBe('arrived');
    expect(chronusRowInTransitKind(row({ deliveredAt: '13/10/2026' }))).toBe('arrived');
  });

  it('mantém SAIU PARA ENTREGA em trânsito mesmo com Data Chegada prevista', () => {
    expect(
      chronusRowInTransitKind(
        row({ status: 'SAIU PARA ENTREGA', arrivedAt: '08/10/2026', deliveredAt: '' }),
      ),
    ).toBe('in_transit');
  });
});

describe('pickManifestRealPlate / driver', () => {
  it('escolhe a placa real mais frequente', () => {
    expect(pickManifestRealPlate(['LSL50', 'IAK2E92', 'IAK2E92', 'NYY2218']).plate).toBe('IAK2E92');
  });

  it('casa motorista ignorando acento, caixa e sufixo (ag)', () => {
    expect(matchDriverName('JOSÉ DA SILVA', [{ id: '1', name: 'Jose da Silva' }])?.id).toBe('1');
    expect(
      matchDriverName('SAMUEL MELO NASCIMENTO (ag)', [
        { id: '2', name: 'SAMUEL MELO NASCIMENTO' },
      ])?.id,
    ).toBe('2');
  });
});

describe('resolveManifestInTransit', () => {
  const claimed = () => new Set<string>();

  it('resolve placa da frota e motorista do Chronus', () => {
    const result = resolveManifestInTransit([row({})], {
      fleet,
      drivers,
      busyVehicleIds: new Set(),
      claimedVehicleIds: claimed(),
    });
    expect(result.skipReason).toBeNull();
    expect(result.vehicle?.id).toBe('v1');
    expect(result.driverName).toBe('Jose da Silva');
  });

  it('usa motorista padrão da placa se o Chronus vier vazio', () => {
    const result = resolveManifestInTransit([row({ driverName: '' })], {
      fleet,
      drivers,
      busyVehicleIds: new Set(),
      claimedVehicleIds: claimed(),
    });
    expect(result.skipReason).toBeNull();
    expect(result.driverName).toBe('Jose da Silva');
  });

  it('recusa placa fora da frota', () => {
    const result = resolveManifestInTransit([row({ plate: 'ABC1D23' })], {
      fleet,
      drivers,
      busyVehicleIds: new Set(),
      claimedVehicleIds: claimed(),
    });
    expect(result.skipReason).toBe('PLATE_NOT_IN_FLEET');
  });

  it('recusa placa já em viagem', () => {
    const result = resolveManifestInTransit([row({})], {
      fleet: [{ ...fleet[0]!, status: 'EM_VIAGEM' }],
      drivers,
      busyVehicleIds: new Set(),
      claimedVehicleIds: claimed(),
    });
    expect(result.skipReason).toBe('PLATE_UNAVAILABLE');
  });
});

describe('parseChronusFile entregas em trânsito', () => {
  it('lê status, envio, chegada, motorista e placa', async () => {
    const csv = entregasCsv([
      (() => {
        const line = Array.from({ length: 43 }, () => '');
        line[0] = '1';
        line[14] = '9631726';
        line[15] = 'MARAVILHA MOTOS';
        line[17] = 'ARACAJU';
        line[20] = '20/10/2026';
        line[22] = '13/10/2026';
        line[23] = '14/10/2026';
        line[25] = 'IAK2E92';
        line[26] = '400111';
        line[27] = '';
        line[28] = 'SAIU PARA ENTREGA';
        line[34] = 'JOSE DA SILVA';
        return line;
      })(),
    ]);
    const parsed = await parseChronusFile(Buffer.from(csv, 'latin1'), 'saidas.csv');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      manifesto: '400111',
      plate: 'IAK2E92',
      status: 'SAIU PARA ENTREGA',
      sentAt: '13/10/2026',
      arrivedAt: '14/10/2026',
      deliveredAt: '',
      driverName: 'JOSE DA SILVA',
    });
  });
});

describe('buildChronusPreview + enrich inTransit', () => {
  const dealers = [
    {
      id: 'dl1',
      code: '123',
      name: 'MOTOS SALVADOR',
      city: 'SALVADOR',
      region: 'BA',
      active: true,
    },
  ];

  it('usa a data de hoje, não a Data Envio da NF', async () => {
    const preview = await buildChronusPreview([row({ sentAt: '28/09/2026' })], dealers, {
      importDate: new Date('2026-10-13T15:00:00.000Z'),
      inTransit: true,
    });
    expect(preview.inTransit).toBe(true);
    expect(preview.isFridayImport).toBe(false);
    expect(preview.routes[0]?.date).toBe('2026-10-13');
    expect(preview.routes[0]?.name).toContain('400111');
    expect(preview.routes[0]?.sentAt).toBe('2026-09-28');
  });

  it('marca manifesto elegível para abrir viagem em andamento', async () => {
    const preview = await buildChronusPreview([row({})], dealers, {
      importDate: new Date('2026-10-13T15:00:00.000Z'),
      inTransit: true,
    });
    const enriched = enrichChronusInTransitPreview(preview, [row({})], {
      fleet,
      drivers,
      busyVehicleIds: new Set(),
    });
    const route = enriched.routes[0]!;
    expect(route.skipReason).toBeNull();
    expect(route.vehicleId).toBe('v1');
    expect(route.assignedDriverName).toBe('Jose da Silva');
    expect(isChronusInTransitStartable(route)).toBe(true);
  });

  it('não usa o próximo dia útil no modo carga vs trânsito', async () => {
    const load = await buildChronusPreview([row({ plate: 'LSL50', status: 'ESTOQUE', sentAt: '' })], dealers, {
      importDate: new Date('2026-10-13T15:00:00.000Z'),
      inTransit: false,
    });
    const transit = await buildChronusPreview([row({})], dealers, {
      importDate: new Date('2026-10-13T15:00:00.000Z'),
      inTransit: true,
    });
    expect(load.routeDate).not.toBe(transit.routes[0]?.date);
    expect(transit.routes[0]?.date).toBe(operationalDateKey(new Date('2026-10-13T15:00:00.000Z')));
  });

  it('reimportar o mesmo manifesto em outro dia atualiza a viagem existente', async () => {
    const preview = await buildChronusPreview(
      [row({ manifesto: '384094' }), row({ manifesto: '384095', dealerCode: '123' })],
      dealers,
      {
        importDate: new Date('2026-10-14T15:00:00.000Z'),
        existingRouteNames: [
          {
            id: 'route-384094',
            name: '384094 13/10/2026',
            date: new Date('2026-10-13T12:00:00.000Z'),
            status: RouteStatus.AGUARDANDO_PLACAS,
          },
          {
            id: 'route-384095',
            name: '384095 13/10/2026',
            date: new Date('2026-10-13T12:00:00.000Z'),
            status: RouteStatus.EM_ANDAMENTO,
          },
        ],
      },
    );

    const first = preview.routes.find((r) => r.manifesto === '384094');
    const second = preview.routes.find((r) => r.manifesto === '384095');
    expect(first?.date).not.toBe('2026-10-13');
    expect(first?.duplicateRouteId).toBe('route-384094');
    expect(first?.duplicateRouteName).toBe('384094 13/10/2026');
    expect(first?.duplicateRouteDate).toBe('2026-10-13');
    expect(first?.canRefreshLoad).toBe(true);
    expect(second?.duplicateRouteId).toBe('route-384095');
    expect(second?.canRefreshLoad).toBe(true);
  });

  it('não abre outra viagem quando o manifesto já está em andamento', async () => {
    const preview = await buildChronusPreview([row({ manifesto: '384094' })], dealers, {
      importDate: new Date('2026-10-14T15:00:00.000Z'),
      inTransit: true,
      existingRouteNames: [
        {
          id: 'route-384094',
          name: '384094 13/10/2026',
          date: new Date('2026-10-13T12:00:00.000Z'),
          status: RouteStatus.EM_ANDAMENTO,
        },
      ],
    });
    const enriched = enrichChronusInTransitPreview(preview, [row({ manifesto: '384094' })], {
      fleet,
      drivers,
      busyVehicleIds: new Set(),
    });
    const route = enriched.routes[0]!;
    expect(route.duplicateRouteId).toBe('route-384094');
    expect(route.skipReason).toBe('ALREADY_IN_TRANSIT');
    expect(isChronusInTransitStartable(route)).toBe(false);
  });

  it('manifesto concluído não vira outra viagem', async () => {
    const preview = await buildChronusPreview([row({ manifesto: '384094' })], dealers, {
      importDate: new Date('2026-10-14T15:00:00.000Z'),
      existingRouteNames: [
        {
          id: 'route-done',
          name: '384094 01/10/2026',
          date: new Date('2026-10-01T12:00:00.000Z'),
          status: RouteStatus.CONCLUIDO,
        },
      ],
    });
    expect(preview.routes[0]?.duplicateRouteId).toBe('route-done');
    expect(preview.routes[0]?.canRefreshLoad).toBe(false);
  });
});
