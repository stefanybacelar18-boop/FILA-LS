import { addDays, startOfDay } from 'date-fns';
import { prisma } from './prisma';
import { pernoiteNights } from '../utils/pernoite';

/** Viagem Samuel / TME3H94 — saída 01/08/2026, retorno real deve ser 02/08 (1 pernoite). */
const SAMUEL_TRIP_ID = 'cms9e2tpz00bac5tfvql03elu';

export async function applyOneOffTripFixes(): Promise<void> {
  const trip = await prisma.trip.findUnique({ where: { id: SAMUEL_TRIP_ID } });
  if (!trip?.returnedAt) return;

  if (pernoiteNights(trip) !== 3) return;

  const returnedAt = addDays(startOfDay(trip.departureAt), 1);
  returnedAt.setHours(
    trip.returnedAt.getHours(),
    trip.returnedAt.getMinutes(),
    trip.returnedAt.getSeconds(),
    trip.returnedAt.getMilliseconds(),
  );

  await prisma.trip.update({
    where: { id: SAMUEL_TRIP_ID },
    data: { returnedAt },
  });

  console.log(
    `Corrigido retorno da viagem ${SAMUEL_TRIP_ID} (TME3H94): 3 → 1 pernoite (${returnedAt.toISOString()})`,
  );
}
