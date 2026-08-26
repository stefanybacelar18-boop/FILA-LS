import { describe, expect, it } from 'vitest';
import {
  routeFleetRequirement,
  stripChronusPlateNotes,
  syncChronusPlateNotes,
  vehicleMatchesRouteLoad,
} from './chronus-plate-hint';

describe('syncChronusPlateNotes', () => {
  it('grava AG50 e preserva o restante das observações', () => {
    expect(syncChronusPlateNotes('Urgente no pátio', 'AG', 50)).toBe(
      'Placa Chronus: AG50\nUrgente no pátio',
    );
  });

  it('troca AG50 por LSL50', () => {
    expect(syncChronusPlateNotes('Placa Chronus: AG50\nObs', 'LSL', 50)).toBe(
      'Placa Chronus: LSL50\nObs',
    );
  });

  it('remove a dica Chronus quando a frota fica livre', () => {
    expect(syncChronusPlateNotes('Placa Chronus: AG50\nObs', null, null)).toBe('Obs');
    expect(stripChronusPlateNotes('Placa Chronus: AG50')).toBeNull();
  });
});

describe('vehicleMatchesRouteLoad', () => {
  const lsl = { plate: 'EZU2D86', capacityMotos: 50 };
  const ag = { plate: 'ABC1D23', capacityMotos: 50 };
  const small = { plate: 'EZU2D86', capacityMotos: 40 };

  it('respeita frota e capacidade gravadas', () => {
    const route = { requiredFleetOwner: 'LSL' as const, requiredCapacityMotos: 50 };
    expect(vehicleMatchesRouteLoad(lsl, route)).toBe(true);
    expect(vehicleMatchesRouteLoad(ag, route)).toBe(false);
    expect(vehicleMatchesRouteLoad(small, route)).toBe(false);
  });

  it('permite veículo LSL depois de mudar a carga de AG para LSL', () => {
    const before = { requiredFleetOwner: 'AG' as const, requiredCapacityMotos: 50 };
    const after = { requiredFleetOwner: 'LSL' as const, requiredCapacityMotos: 50 };
    expect(vehicleMatchesRouteLoad(lsl, before)).toBe(false);
    expect(vehicleMatchesRouteLoad(lsl, after)).toBe(true);
    expect(vehicleMatchesRouteLoad(ag, after)).toBe(false);
  });

  it('usa a dica nas notas quando os campos estão vazios', () => {
    const route = { notes: 'Placa Chronus: AG50' };
    expect(vehicleMatchesRouteLoad(ag, route)).toBe(true);
    expect(vehicleMatchesRouteLoad(lsl, route)).toBe(false);
  });
});

describe('routeFleetRequirement', () => {
  it('campos gravados vencem a nota Chronus antiga', () => {
    expect(
      routeFleetRequirement({
        requiredFleetOwner: 'LSL',
        requiredCapacityMotos: 50,
        notes: 'Placa Chronus: AG50',
      }),
    ).toMatchObject({ fleetOwner: 'LSL', capacityMotos: 50 });
  });
});
