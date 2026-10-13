import type { PrismaClient } from '@prisma/client';
import { Role, RouteStatus, TripStatus, VehicleStatus } from '../types/enums';
import { operationalDateKey } from '../utils/timezone';
import { nextVehicleStatusAfterHold } from './vehicle-lifecycle';

export const CLOSE_OPEN_TRIPS_MARKER = 'CLOSE_OPEN_TRIPS_AT_FORECAST_20261013';

export const AUTO_RETURN_NOTE =
  'Baixa automática na previsão de retorno (Chronus sem extração após 07/10/2026)';

export function returnedAtFromForecast(trip: {
  departureAt: Date;
  expectedReturn: Date;
}): Date {
  if (operationalDateKey(trip.expectedReturn) < operationalDateKey(trip.departureAt)) {
    return trip.departureAt;
  }
  return trip.expectedReturn;
}

export function mergeTripNotes(existing: string | null | undefined, extra: string): string {
  const current = existing?.trim() ?? '';
  if (!current) return extra;
  if (current.includes(extra)) return current;
  return `${current} · ${extra}`;
}

export type CloseOpenTripsResult = {
  count: number;
  skipped: boolean;
  plates: string[];
};

/**
 * Confirma o retorno de todas as viagens abertas usando a previsão
 * (não a data de hoje), para não inflar pernoite. Libera as placas.
 */
export async function closeOpenTripsAtForecast(
  prisma: PrismaClient,
  opts: { userId?: string; once?: boolean } = {},
): Promise<CloseOpenTripsResult> {
  const once = opts.once !== false;

  if (once) {
    const already = await prisma.auditLog.findFirst({
      where: { action: CLOSE_OPEN_TRIPS_MARKER },
      select: { id: true },
    });
    if (already) return { count: 0, skipped: true, plates: [] };
  }

  const admin =
    (opts.userId
      ? await prisma.user.findUnique({ where: { id: opts.userId } })
      : null) ??
    (await prisma.user.findFirst({
      where: { role: Role.ADMIN, active: true },
      orderBy: { createdAt: 'asc' },
    }));

  if (!admin) {
    console.warn('Baixa automática: nenhum Admin ativo — tentará de novo no próximo boot');
    return { count: 0, skipped: false, plates: [] };
  }

  const open = await prisma.trip.findMany({
    where: {
      returnedAt: null,
      status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] },
    },
    include: {
      vehicle: true,
      dealership: { select: { name: true } },
    },
    orderBy: { expectedReturn: 'asc' },
  });

  const plates: string[] = [];

  for (const trip of open) {
    const returnedAt = returnedAtFromForecast(trip);
    const nextVehicleStatus = nextVehicleStatusAfterHold(trip.vehicle);

    await prisma.$transaction(async (tx) => {
      await tx.trip.update({
        where: { id: trip.id },
        data: {
          status: TripStatus.RETORNOU,
          returnedAt,
          returnedById: admin.id,
          notes: mergeTripNotes(trip.notes, AUTO_RETURN_NOTE),
          unavailableReason: null,
          unavailableAt: null,
          pernoiteNightsOverride: null,
        },
      });
      await tx.vehicle.update({
        where: { id: trip.vehicleId },
        data: { status: nextVehicleStatus },
      });
      await tx.vehicleHistory.create({
        data: {
          vehicleId: trip.vehicleId,
          userId: admin.id,
          tripId: trip.id,
          action: 'RETORNO',
          fromStatus: trip.vehicle.status,
          toStatus: nextVehicleStatus,
          details: `Baixa automática na previsão · ${trip.dealership.name} · ${trip.vehicle.plate}`,
        },
      });
      if (trip.routeId) {
        const remaining = await tx.trip.count({
          where: {
            routeId: trip.routeId,
            status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] },
          },
        });
        if (remaining === 0) {
          await tx.route.updateMany({
            where: {
              id: trip.routeId,
              status: { in: [RouteStatus.EM_ANDAMENTO, RouteStatus.AGUARDANDO_PLACAS] },
            },
            data: { status: RouteStatus.CONCLUIDO },
          });
        }
      }
    });

    plates.push(trip.vehicle.plate);
  }

  await releaseOrphanTravelingVehicles(prisma);
  await concludeRoutesWithoutOpenTrips(prisma);

  if (once) {
    await prisma.auditLog.create({
      data: {
        action: CLOSE_OPEN_TRIPS_MARKER,
        entity: 'Trip',
        userId: admin.id,
        details: `Baixa automática de ${plates.length} viagem(ns) na previsão de retorno: ${plates.join(', ') || 'nenhuma'}`,
      },
    });
  } else if (plates.length > 0) {
    await prisma.auditLog.create({
      data: {
        action: 'CLOSE_OPEN_TRIPS_AT_FORECAST',
        entity: 'Trip',
        userId: admin.id,
        details: `Baixa de ${plates.length} viagem(ns) na previsão: ${plates.join(', ')}`,
      },
    });
  }

  if (plates.length > 0) {
    console.log(`Baixa automática na previsão: ${plates.length} viagem(ns) (${plates.join(', ')})`);
  }

  return { count: plates.length, skipped: false, plates };
}

async function releaseOrphanTravelingVehicles(prisma: PrismaClient): Promise<void> {
  const stuck = await prisma.vehicle.findMany({
    where: {
      status: VehicleStatus.EM_VIAGEM,
      active: true,
      maintenanceHold: false,
      trips: { none: { status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] } } },
    },
    select: { id: true },
  });
  if (stuck.length === 0) return;
  await prisma.vehicle.updateMany({
    where: { id: { in: stuck.map((v) => v.id) } },
    data: { status: VehicleStatus.DISPONIVEL },
  });
}

async function concludeRoutesWithoutOpenTrips(prisma: PrismaClient): Promise<void> {
  const routes = await prisma.route.findMany({
    where: { status: RouteStatus.EM_ANDAMENTO },
    select: {
      id: true,
      trips: { select: { status: true } },
    },
  });
  const done = routes.filter(
    (r) =>
      r.trips.length > 0 &&
      r.trips.every((t) => t.status !== TripStatus.EM_ANDAMENTO && t.status !== TripStatus.ATRASADO),
  );
  if (done.length === 0) return;
  await prisma.route.updateMany({
    where: { id: { in: done.map((r) => r.id) } },
    data: { status: RouteStatus.CONCLUIDO },
  });
}
