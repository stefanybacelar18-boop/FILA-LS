import type { Prisma } from '@prisma/client';
import { TripStatus } from '../types/enums';

export type ChronusCargoUnit = {
  chassis: string;
  invoiceNumber: string;
  invoiceKey: string;
  model: string | null;
  dealerCode: string;
};

export type CargoTripSnapshot = {
  status: string;
  returnedAt: Date | null;
  departureAt: Date;
  plate: string | null;
};

export type CargoDelivery = {
  situation: 'ENTREGUE' | 'EM_VIAGEM' | 'SEM_VIAGEM';
  deliveredAt: Date | null;
  plate: string | null;
};

export function cargoSearchKey(value: string): string {
  return value.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Nota fiscal sem pontuação e sem zeros à esquerda, para achar 656 e 000000656. */
export function invoiceKey(value: string): string {
  return value.replace(/\D/g, '').replace(/^0+/, '');
}

export function cargoLookupFilter(raw: string): { chassis: string; invoiceKey: string | null } | null {
  const chassis = cargoSearchKey(raw);
  if (/^[0-9]+$/.test(chassis)) {
    const key = invoiceKey(chassis);
    if (key.length < 3) return null;
    return { chassis, invoiceKey: key };
  }
  if (chassis.length < 4) return null;
  return { chassis, invoiceKey: null };
}

export function cargoDelivery(trips: CargoTripSnapshot[]): CargoDelivery {
  const active = trips.filter((trip) => trip.status !== TripStatus.CANCELADO);
  const open = active.filter(
    (trip) => trip.status === TripStatus.EM_ANDAMENTO || trip.status === TripStatus.ATRASADO,
  );
  if (open.length > 0) {
    const latest = [...open].sort((a, b) => b.departureAt.getTime() - a.departureAt.getTime())[0]!;
    return { situation: 'EM_VIAGEM', deliveredAt: null, plate: latest.plate };
  }
  const returned = active.filter((trip) => trip.status === TripStatus.RETORNOU);
  if (returned.length > 0) {
    const latest = [...returned].sort(
      (a, b) => (b.returnedAt?.getTime() ?? 0) - (a.returnedAt?.getTime() ?? 0),
    )[0]!;
    return { situation: 'ENTREGUE', deliveredAt: latest.returnedAt, plate: latest.plate };
  }
  return { situation: 'SEM_VIAGEM', deliveredAt: null, plate: null };
}

export function dealershipIdByDealerCode(
  destinations: { dealerCode: string; dealershipId: string | null }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const dest of destinations) {
    if (dest.dealershipId) map.set(dest.dealerCode, dest.dealershipId);
  }
  return map;
}

export async function replaceRouteCargo(
  tx: Pick<Prisma.TransactionClient, 'cargoItem'>,
  routeId: string,
  units: ChronusCargoUnit[] | undefined,
  dealershipIdByCode: Map<string, string>,
) {
  if (!units?.length) return;
  await tx.cargoItem.deleteMany({ where: { routeId } });
  await tx.cargoItem.createMany({
    data: units.map((unit) => ({
      routeId,
      chassis: unit.chassis,
      invoiceNumber: unit.invoiceNumber,
      invoiceKey: unit.invoiceKey,
      model: unit.model,
      dealershipId: dealershipIdByCode.get(unit.dealerCode) ?? null,
    })),
  });
}
