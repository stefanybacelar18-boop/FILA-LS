import { describe, expect, it } from 'vitest';
import {
  isInactiveVehicle,
  nextVehicleStatusAfterHold,
  vehicleActivatePatch,
  vehicleDeactivatePatch,
  VEHICLE_DEACTIVATE_REASON,
} from './vehicle-lifecycle';
import { VehicleStatus } from '../types/enums';

describe('nextVehicleStatusAfterHold', () => {
  it('inativo permanece bloqueado mesmo sem manutenção', () => {
    expect(nextVehicleStatusAfterHold({ active: false, maintenanceHold: false })).toBe(
      VehicleStatus.BLOQUEADO,
    );
  });

  it('manutenção segura a placa em EM_MANUTENCAO', () => {
    expect(nextVehicleStatusAfterHold({ active: true, maintenanceHold: true })).toBe(
      VehicleStatus.EM_MANUTENCAO,
    );
  });

  it('placa ativa e livre volta a DISPONIVEL', () => {
    expect(nextVehicleStatusAfterHold({ active: true, maintenanceHold: false })).toBe(
      VehicleStatus.DISPONIVEL,
    );
  });
});

describe('vehicleDeactivatePatch', () => {
  it('marca inativo, bloqueado e fora da operação', () => {
    const patch = vehicleDeactivatePatch('user-1', new Date('2026-08-28T12:00:00.000Z'));
    expect(patch.active).toBe(false);
    expect(patch.status).toBe(VehicleStatus.BLOQUEADO);
    expect(patch.maintenanceHold).toBe(true);
    expect(patch.blockReason).toBe(VEHICLE_DEACTIVATE_REASON);
    expect(patch.blockedById).toBe('user-1');
    expect(isInactiveVehicle(patch)).toBe(true);
  });
});

describe('vehicleActivatePatch', () => {
  it('devolve a placa à frota disponível', () => {
    const patch = vehicleActivatePatch();
    expect(patch.active).toBe(true);
    expect(patch.status).toBe(VehicleStatus.DISPONIVEL);
    expect(patch.maintenanceHold).toBe(false);
    expect(patch.blockReason).toBeNull();
  });
});
