import { prisma } from './prisma';
import { OPERATOR_HIDDEN_PLATES } from '../data/operatorVisibility';
import { TripStatus } from '../types/enums';
import { isPernoite, pernoiteNights, type PayrollPeriod } from '../utils/pernoite';

const tripInclude = {
  vehicle: { select: { id: true, plate: true, type: true, defaultDriver: true } },
  dealership: { select: { id: true, name: true, city: true } },
  route: { select: { id: true, name: true } },
} as const;

export type PernoiteTripRow = {
  id: string;
  vehicleId: string;
  plate: string;
  vehicleType: string | null;
  driverName: string | null;
  dealershipName: string;
  dealershipCity: string;
  routeName: string | null;
  departureAt: Date;
  expectedReturn: Date;
  returnedAt: Date | null;
  status: string;
  nights: number;
  confirmed: boolean;
};

export type PernoitePlateRanking = {
  vehicleId: string;
  plate: string;
  type: string | null;
  driverName: string | null;
  pernoites: number;
  trips: number;
};

export async function fetchLslPernoitesForPeriod(period: PayrollPeriod) {
  const trips = await prisma.trip.findMany({
    where: {
      departureAt: { gte: period.start, lte: period.end },
      status: { not: TripStatus.CANCELADO },
      vehicle: { plate: { in: [...OPERATOR_HIDDEN_PLATES] } },
    },
    include: tripInclude,
    orderBy: [{ departureAt: 'desc' }],
  });

  const pernoiteTrips: PernoiteTripRow[] = [];
  const byPlate = new Map<string, PernoitePlateRanking>();

  for (const t of trips) {
    const nights = pernoiteNights(t);
    if (!isPernoite(t)) continue;

    const driverName = t.driverName ?? t.vehicle.defaultDriver ?? null;
    pernoiteTrips.push({
      id: t.id,
      vehicleId: t.vehicleId,
      plate: t.vehicle.plate,
      vehicleType: t.vehicle.type,
      driverName,
      dealershipName: t.dealership.name,
      dealershipCity: t.dealership.city,
      routeName: t.route?.name ?? null,
      departureAt: t.departureAt,
      expectedReturn: t.expectedReturn,
      returnedAt: t.returnedAt,
      status: t.status,
      nights,
      confirmed: t.returnedAt != null,
    });

    const existing = byPlate.get(t.vehicleId);
    if (existing) {
      existing.pernoites += nights;
      existing.trips += 1;
      if (!existing.driverName && driverName) existing.driverName = driverName;
    } else {
      byPlate.set(t.vehicleId, {
        vehicleId: t.vehicleId,
        plate: t.vehicle.plate,
        type: t.vehicle.type,
        driverName,
        pernoites: nights,
        trips: 1,
      });
    }
  }

  const ranking = [...byPlate.values()].sort((a, b) => b.pernoites - a.pernoites || b.trips - a.trips);

  return {
    trips: pernoiteTrips,
    ranking,
    totalPernoites: ranking.reduce((sum, r) => sum + r.pernoites, 0),
    totalTrips: pernoiteTrips.length,
  };
}
