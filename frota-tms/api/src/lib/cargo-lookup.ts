import type { Prisma, PrismaClient } from '@prisma/client';
import { subMonths } from 'date-fns';
import { TripStatus } from '../types/enums';

export const CARGO_HISTORY_MONTHS = 12;

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

/** Entregue conta da data do retorno. Sem viagem, da data do roteiro. Viagem aberta fica. */
export function cargoHistoryExpired(input: {
  routeDate: Date;
  trips: CargoTripSnapshot[];
  now?: Date;
}): boolean {
  const delivery = cargoDelivery(input.trips);
  if (delivery.situation === 'EM_VIAGEM') return false;
  const anchor =
    delivery.situation === 'ENTREGUE' && delivery.deliveredAt
      ? delivery.deliveredAt
      : input.routeDate;
  const cutoff = subMonths(input.now ?? new Date(), CARGO_HISTORY_MONTHS);
  return anchor.getTime() < cutoff.getTime();
}

export async function purgeExpiredCargoHistory(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = subMonths(now, CARGO_HISTORY_MONTHS);
  let deleted = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.cargoItem.findMany({
      where: {
        route: { date: { lt: cutoff } },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: 500,
      select: {
        id: true,
        route: {
          select: {
            date: true,
            trips: {
              where: { status: { not: TripStatus.CANCELADO } },
              select: { status: true, returnedAt: true, departureAt: true },
            },
          },
        },
      },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;

    const expiredIds = batch
      .filter((item) =>
        cargoHistoryExpired({
          routeDate: item.route.date,
          now,
          trips: item.route.trips.map((trip) => ({
            status: trip.status,
            returnedAt: trip.returnedAt,
            departureAt: trip.departureAt,
            plate: null,
          })),
        }),
      )
      .map((item) => item.id);

    if (expiredIds.length > 0) {
      const result = await prisma.cargoItem.deleteMany({ where: { id: { in: expiredIds } } });
      deleted += result.count;
    }
    if (batch.length < 500) break;
  }

  return deleted;
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
