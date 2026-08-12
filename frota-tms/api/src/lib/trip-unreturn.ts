import { TripStatus, VehicleStatus } from '../types/enums';
import { isOverdue } from '../utils/status';

export type UnreturnBlockReason =
  | 'NOT_RETURNED'
  | 'LOGBOOK_SIGNED'
  | 'OPEN_TRIP_ON_VEHICLE'
  | 'NEWER_TRIP_ON_VEHICLE'
  | 'VEHICLE_NOT_AVAILABLE';

export function tripStatusAfterUnreturn(expectedReturn: Date): TripStatus {
  return isOverdue(expectedReturn, null) ? TripStatus.ATRASADO : TripStatus.EM_ANDAMENTO;
}

export function vehicleStatusAfterUnreturn(
  previousVehicleStatus: string | null | undefined,
  hasDelayReport: boolean,
): VehicleStatus {
  if (previousVehicleStatus === VehicleStatus.BLOQUEADO && hasDelayReport) {
    return VehicleStatus.BLOQUEADO;
  }
  return VehicleStatus.EM_VIAGEM;
}

export function canUnreturnVehicleStatus(vehicleStatus: string): boolean {
  return (
    vehicleStatus === VehicleStatus.DISPONIVEL ||
    vehicleStatus === VehicleStatus.EM_MANUTENCAO
  );
}

export function evaluateUnreturnGuards(input: {
  tripStatus: string;
  logbookReturnSigned: boolean;
  vehicleStatus: string;
  hasOtherOpenTrip: boolean;
  hasNewerTripOnVehicle: boolean;
}): UnreturnBlockReason | null {
  if (input.tripStatus !== TripStatus.RETORNOU) return 'NOT_RETURNED';
  if (input.logbookReturnSigned) return 'LOGBOOK_SIGNED';
  if (input.hasOtherOpenTrip) return 'OPEN_TRIP_ON_VEHICLE';
  if (input.hasNewerTripOnVehicle) return 'NEWER_TRIP_ON_VEHICLE';
  if (!canUnreturnVehicleStatus(input.vehicleStatus)) return 'VEHICLE_NOT_AVAILABLE';
  return null;
}

export const UNRETURN_ERROR_MESSAGES: Record<UnreturnBlockReason, string> = {
  NOT_RETURNED: 'Só é possível desfazer viagens já marcadas como retornadas.',
  LOGBOOK_SIGNED:
    'Não é possível desfazer: o motorista já assinou o retorno no diário de bordo.',
  OPEN_TRIP_ON_VEHICLE: 'A placa já está em outra viagem aberta. Conclua ou cancele antes.',
  NEWER_TRIP_ON_VEHICLE:
    'A placa já foi usada em viagem posterior a este retorno. Não é possível desfazer.',
  VEHICLE_NOT_AVAILABLE:
    'A placa não está disponível para reabrir esta viagem (situação atual incompatível).',
};
