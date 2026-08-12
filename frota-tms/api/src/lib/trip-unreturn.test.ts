import { describe, expect, it } from 'vitest';
import {
  evaluateUnreturnGuards,
  tripStatusAfterUnreturn,
  vehicleStatusAfterUnreturn,
} from './trip-unreturn';
import { TripStatus, VehicleStatus } from '../types/enums';

describe('trip-unreturn', () => {
  it('reabre viagem como EM_ANDAMENTO quando previsão não venceu', () => {
    const future = new Date();
    future.setDate(future.getDate() + 2);
    expect(tripStatusAfterUnreturn(future)).toBe(TripStatus.EM_ANDAMENTO);
  });

  it('reabre viagem como ATRASADO quando previsão passou', () => {
    const past = new Date();
    past.setDate(past.getDate() - 2);
    expect(tripStatusAfterUnreturn(past)).toBe(TripStatus.ATRASADO);
  });

  it('restaura BLOQUEADO se havia atraso com indisponibilidade', () => {
    expect(vehicleStatusAfterUnreturn(VehicleStatus.BLOQUEADO, true)).toBe(
      VehicleStatus.BLOQUEADO,
    );
    expect(vehicleStatusAfterUnreturn(VehicleStatus.BLOQUEADO, false)).toBe(
      VehicleStatus.EM_VIAGEM,
    );
  });

  it('bloqueia desfazer quando placa já tem outra viagem', () => {
    expect(
      evaluateUnreturnGuards({
        tripStatus: TripStatus.RETORNOU,
        logbookReturnSigned: false,
        vehicleStatus: VehicleStatus.DISPONIVEL,
        hasOtherOpenTrip: true,
        hasNewerTripOnVehicle: false,
      }),
    ).toBe('OPEN_TRIP_ON_VEHICLE');
  });
});
