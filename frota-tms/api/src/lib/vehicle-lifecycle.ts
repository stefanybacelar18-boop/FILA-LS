import { VehicleStatus } from '../types/enums';

export const VEHICLE_DEACTIVATE_REASON = 'Desativado da frota';

export function isInactiveVehicle(v: { active?: boolean | null }): boolean {
  return v.active === false;
}

/** Status da placa ao encerrar viagem / soltar roteiro. Inativo não volta a Disponivel. */
export function nextVehicleStatusAfterHold(input: {
  maintenanceHold?: boolean | null;
  active?: boolean | null;
}): VehicleStatus {
  if (input.active === false) return VehicleStatus.BLOQUEADO;
  if (input.maintenanceHold) return VehicleStatus.EM_MANUTENCAO;
  return VehicleStatus.DISPONIVEL;
}

export function vehicleDeactivatePatch(userId: string, now = new Date()) {
  return {
    active: false,
    status: VehicleStatus.BLOQUEADO,
    maintenanceHold: true,
    blockCategory: 'OUTRO',
    blockReason: VEHICLE_DEACTIVATE_REASON,
    blockedAt: now,
    blockedById: userId,
  };
}

export function vehicleActivatePatch() {
  return {
    active: true,
    status: VehicleStatus.DISPONIVEL,
    maintenanceHold: false,
    blockCategory: null,
    blockReason: null,
    blockedAt: null,
    blockedById: null,
  };
}
