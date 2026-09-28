import { prisma } from './prisma';
import { OPERATOR_HIDDEN_PLATES, normalizeDriverName } from '../data/operatorVisibility';
import { TripStatus } from '../types/enums';
import {
  isPernoite,
  pernoiteNights,
  resolvedPernoiteNights,
  type PayrollPeriod,
} from '../utils/pernoite';

const tripInclude = {
  vehicle: { select: { id: true, plate: true, type: true, defaultDriver: true } },
  dealership: { select: { id: true, name: true, city: true } },
  route: {
    select: {
      id: true,
      name: true,
      notes: true,
      hasPriority: true,
      priorityExpiryDate: true,
      priorityNotes: true,
      totalMotoCount: true,
      dealership: { select: { name: true, city: true } },
      dealerships: {
        orderBy: { order: 'asc' as const },
        select: {
          order: true,
          motoCount: true,
          minExpiryDate: true,
          dealership: { select: { name: true, city: true } },
        },
      },
    },
  },
} as const;

const UNKNOWN_DRIVER_KEY = '__SEM_MOTORISTA__';
const UNKNOWN_DRIVER_LABEL = 'Motorista não informado';

export type PernoiteStop = {
  city: string;
  dealershipName: string;
  motoCount: number | null;
  minExpiryDate: Date | null;
  order: number;
};

export type PernoiteTripRow = {
  id: string;
  vehicleId: string;
  plate: string;
  vehicleType: string | null;
  driverName: string | null;
  dealershipName: string;
  dealershipCity: string;
  routeId: string | null;
  routeName: string | null;
  routeNotes: string | null;
  hasPriority: boolean;
  priorityExpiryDate: Date | null;
  priorityNotes: string | null;
  totalMotoCount: number | null;
  destinations: PernoiteStop[];
  departureAt: Date;
  expectedReturn: Date;
  returnedAt: Date | null;
  status: string;
  nights: number;
  calendarNights: number;
  nightsOverridden: boolean;
  confirmed: boolean;
};

export type PernoiteDriverRanking = {
  driverKey: string;
  driverName: string;
  plates: string[];
  pernoites: number;
  trips: number;
};

function resolveTripDriver(trip: {
  driverName: string | null;
  vehicle: { defaultDriver: string | null };
}): { key: string; name: string } {
  const raw = trip.driverName?.trim() || trip.vehicle.defaultDriver?.trim() || '';
  if (!raw) {
    return { key: UNKNOWN_DRIVER_KEY, name: UNKNOWN_DRIVER_LABEL };
  }
  return { key: normalizeDriverName(raw), name: raw };
}

function destinationsFromTrip(trip: PernoiteQueryTrip): PernoiteStop[] {
  const stops = trip.route?.dealerships ?? [];
  if (stops.length > 0) {
    return stops.map((rd) => ({
      city: rd.dealership.city,
      dealershipName: rd.dealership.name,
      motoCount: rd.motoCount,
      minExpiryDate: rd.minExpiryDate,
      order: rd.order,
    }));
  }
  if (trip.route?.dealership) {
    return [
      {
        city: trip.route.dealership.city,
        dealershipName: trip.route.dealership.name,
        motoCount: null,
        minExpiryDate: null,
        order: 0,
      },
    ];
  }
  return [
    {
      city: trip.dealership?.city ?? '',
      dealershipName: trip.dealership?.name ?? '—',
      motoCount: null,
      minExpiryDate: null,
      order: 0,
    },
  ];
}

type PernoiteQueryTrip = {
  id: string;
  vehicleId: string;
  driverName: string | null;
  departureAt: Date;
  expectedReturn: Date;
  returnedAt: Date | null;
  status: string;
  pernoiteNightsOverride?: number | null;
  vehicle: { id?: string; plate: string; type?: string | null; defaultDriver: string | null };
  dealership?: { name: string; city: string };
  route?: {
    id?: string;
    name: string;
    notes?: string | null;
    hasPriority?: boolean;
    priorityExpiryDate?: Date | null;
    priorityNotes?: string | null;
    totalMotoCount?: number | null;
    dealership?: { name: string; city: string } | null;
    dealerships?: {
      order: number;
      motoCount: number | null;
      minExpiryDate: Date | null;
      dealership: { name: string; city: string };
    }[];
  } | null;
};

export async function fetchLslPernoitesForPeriod(
  period: PayrollPeriod,
  opts: { rankingOnly?: boolean } = {},
) {
  const rankingOnly = opts.rankingOnly === true;
  const trips = (
    rankingOnly
      ? await prisma.trip.findMany({
          where: {
            departureAt: { gte: period.start, lte: period.end },
            status: { not: TripStatus.CANCELADO },
            vehicle: {
              OR: [{ owner: 'LSL' }, { plate: { in: [...OPERATOR_HIDDEN_PLATES] } }],
            },
          },
          select: {
            id: true,
            vehicleId: true,
            driverName: true,
            departureAt: true,
            expectedReturn: true,
            returnedAt: true,
            status: true,
            pernoiteNightsOverride: true,
            vehicle: { select: { plate: true, defaultDriver: true } },
          },
          orderBy: [{ departureAt: 'desc' }],
        })
      : await prisma.trip.findMany({
          where: {
            departureAt: { gte: period.start, lte: period.end },
            status: { not: TripStatus.CANCELADO },
            vehicle: {
              OR: [{ owner: 'LSL' }, { plate: { in: [...OPERATOR_HIDDEN_PLATES] } }],
            },
          },
          include: tripInclude,
          orderBy: [{ departureAt: 'desc' }],
        })
  ) as PernoiteQueryTrip[];

  const pernoiteTrips: PernoiteTripRow[] = [];
  const byDriver = new Map<string, PernoiteDriverRanking & { plateSet: Set<string> }>();

  for (const t of trips) {
    const calendarNights = pernoiteNights(t);
    const nights = resolvedPernoiteNights(t);
    const markedNotPernoite = t.pernoiteNightsOverride === 0 && calendarNights > 0;
    if (!isPernoite(t) && !markedNotPernoite) continue;

    const driver = resolveTripDriver(t);
    if (!rankingOnly) {
      pernoiteTrips.push({
        id: t.id,
        vehicleId: t.vehicleId,
        plate: t.vehicle.plate,
        vehicleType: t.vehicle.type ?? null,
        driverName: driver.name === UNKNOWN_DRIVER_LABEL ? null : driver.name,
        dealershipName: t.dealership?.name ?? '—',
        dealershipCity: t.dealership?.city ?? '',
        routeId: t.route?.id ?? null,
        routeName: t.route?.name ?? null,
        routeNotes: t.route?.notes ?? null,
        hasPriority: t.route?.hasPriority === true,
        priorityExpiryDate: t.route?.priorityExpiryDate ?? null,
        priorityNotes: t.route?.priorityNotes ?? null,
        totalMotoCount: t.route?.totalMotoCount ?? null,
        destinations: destinationsFromTrip(t),
        departureAt: t.departureAt,
        expectedReturn: t.expectedReturn,
        returnedAt: t.returnedAt,
        status: t.status,
        nights,
        calendarNights,
        nightsOverridden: t.pernoiteNightsOverride != null,
        confirmed: t.returnedAt != null,
      });
    }

    if (nights <= 0) continue;

    const existing = byDriver.get(driver.key);
    if (existing) {
      existing.pernoites += nights;
      existing.trips += 1;
      existing.plateSet.add(t.vehicle.plate);
    } else {
      byDriver.set(driver.key, {
        driverKey: driver.key,
        driverName: driver.name,
        plates: [],
        plateSet: new Set([t.vehicle.plate]),
        pernoites: nights,
        trips: 1,
      });
    }
  }

  const ranking = [...byDriver.values()]
    .map(({ plateSet, ...row }) => ({
      ...row,
      plates: [...plateSet].sort(),
    }))
    .sort(
      (a, b) =>
        b.pernoites - a.pernoites ||
        b.trips - a.trips ||
        a.driverName.localeCompare(b.driverName, 'pt-BR'),
    );

  return {
    trips: pernoiteTrips,
    ranking,
    totalPernoites: ranking.reduce((sum, r) => sum + r.pernoites, 0),
    totalTrips: ranking.reduce((sum, r) => sum + r.trips, 0),
  };
}
