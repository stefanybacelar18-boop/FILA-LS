import { describe, expect, it } from 'vitest';
import { plateLastTripsByVehicle } from './plate-last-trips';

describe('plateLastTripsByVehicle', () => {
  it('guarda só a viagem mais recente de cada placa, com as cidades do roteiro', () => {
    const grouped = plateLastTripsByVehicle([
      {
        id: 'old',
        vehicleId: 'v1',
        driverName: 'Luiz',
        departureAt: '2026-10-01T09:00:00.000Z',
        returnedAt: '2026-10-02T15:00:00.000Z',
        status: 'RETORNOU',
        route: {
          name: '100 01/10/2026',
          date: '2026-10-01T12:00:00.000Z',
          dealerships: [{ order: 0, dealership: { city: 'Ilhéus', name: 'Loja I' } }],
        },
        dealership: null,
      },
      {
        id: 'mid',
        vehicleId: 'v1',
        driverName: 'Luiz',
        departureAt: '2026-10-20T09:00:00.000Z',
        returnedAt: null,
        status: 'EM_ANDAMENTO',
        route: null,
        dealership: { city: 'Salvador', name: 'Loja S' },
      },
      {
        id: 'new',
        vehicleId: 'v1',
        driverName: 'Ana',
        departureAt: '2026-11-04T09:00:00.000Z',
        returnedAt: '2026-11-05T18:00:00.000Z',
        status: 'RETORNOU',
        route: {
          name: '384094 04/11/2026',
          date: '2026-11-04T12:00:00.000Z',
          dealerships: [
            { order: 1, dealership: { city: 'Feira de Santana', name: 'Loja F' } },
            { order: 0, dealership: { city: 'Salvador', name: 'Loja S' } },
            { order: 2, dealership: { city: 'Salvador', name: 'Outra' } },
          ],
        },
        dealership: null,
      },
      {
        id: 'skip',
        vehicleId: 'v1',
        driverName: 'Ana',
        departureAt: '2026-11-03T09:00:00.000Z',
        returnedAt: null,
        status: 'CANCELADO',
        route: null,
        dealership: { city: 'Aracaju', name: 'Loja A' },
      },
      {
        id: 'other',
        vehicleId: 'v2',
        driverName: 'João',
        departureAt: '2026-11-02T09:00:00.000Z',
        returnedAt: '2026-11-03T15:00:00.000Z',
        status: 'RETORNOU',
        route: {
          name: '200 02/11/2026',
          date: '2026-11-02T12:00:00.000Z',
          dealerships: [],
        },
        dealership: { city: 'Itabuna', name: 'Loja T' },
      },
    ]);

    expect(grouped.get('v1')?.map((trip) => trip.id)).toEqual(['new']);
    expect(grouped.get('v1')?.[0]).toMatchObject({
      routeName: '384094 04/11/2026',
      routeDate: '2026-11-04',
      driverName: 'Ana',
      status: 'RETORNOU',
      returnedAt: '2026-11-05',
      cities: ['Salvador', 'Feira de Santana'],
    });
    expect(grouped.get('v1')?.some((trip) => trip.id === 'skip')).toBe(false);
    expect(grouped.get('v2')?.[0]?.cities).toEqual(['Itabuna']);
  });
});
