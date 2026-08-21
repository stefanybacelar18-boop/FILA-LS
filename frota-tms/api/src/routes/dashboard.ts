import { Router } from 'express';
import { TripStatus, VehicleStatus, RouteStatus } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, type AuthRequest } from '../middleware/auth';
import { Role } from '../types/enums';
import { isOverdue } from '../utils/status';
import { addDays, startOfDay, subDays, format } from 'date-fns';
import { hasActivePriority } from '../lib/route-priority.js';
import { fetchLslPernoitesForPeriod } from '../lib/pernoite-service';
import { payrollPeriodForDate } from '../utils/pernoite';

const router = Router();
router.use(authenticate);

const TRIPS_CHART_DAYS = 14;
const RANKING_DAYS = 30;
const RANKING_LIMIT = 10;

router.get('/', async (req: AuthRequest, res) => {
  const today = startOfDay(new Date());
  const rankingSince = subDays(today, RANKING_DAYS - 1);
  const chartSince = subDays(today, TRIPS_CHART_DAYS - 1);

  const [
    availableForRoutes,
    emViagem,
    openTrips,
    tripsForDealershipRanking,
    vehicleTripCounts,
    tripsInChartWindow,
    awaitingPlatesRoutes,
    openRoutesWithExpiry,
  ] = await Promise.all([
    prisma.vehicle.count({
      where: {
        status: VehicleStatus.DISPONIVEL,
        trips: { none: { status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] } } },
      },
    }),
    prisma.vehicle.count({ where: { status: VehicleStatus.EM_VIAGEM } }),
    prisma.trip.findMany({
      where: { status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] } },
      select: { expectedReturn: true, returnedAt: true, delayReason: true },
    }),
    prisma.trip.findMany({
      where: {
        departureAt: { gte: rankingSince },
        status: { not: TripStatus.CANCELADO },
      },
      select: {
        dealershipId: true,
        route: {
          select: {
            dealerships: {
              select: { dealershipId: true, motoCount: true },
            },
          },
        },
      },
    }),
    prisma.trip.groupBy({
      by: ['vehicleId'],
      where: { departureAt: { gte: rankingSince } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: RANKING_LIMIT,
    }),
    prisma.trip.findMany({
      where: { departureAt: { gte: chartSince } },
      select: { departureAt: true },
    }),
    prisma.route.count({
      where: { status: RouteStatus.AGUARDANDO_PLACAS, vehicles: { none: {} } },
    }),
    prisma.route.findMany({
      where: {
        status: { in: [RouteStatus.AGUARDANDO_PLACAS, RouteStatus.RASCUNHO, RouteStatus.EM_ANDAMENTO] },
        priorityExpiryDate: { not: null },
      },
      select: { hasPriority: true, priorityExpiryDate: true },
    }),
  ]);

  const atrasadas = openTrips.filter((t) => isOverdue(t.expectedReturn, t.returnedAt)).length;
  const urgentRoutes = openRoutesWithExpiry.filter((r) => hasActivePriority(r)).length;

  const motoByDealership = new Map<string, number>();
  for (const trip of tripsForDealershipRanking) {
    const stops = trip.route?.dealerships;
    if (stops && stops.length > 0) {
      for (const stop of stops) {
        const add = stop.motoCount ?? 1;
        motoByDealership.set(stop.dealershipId, (motoByDealership.get(stop.dealershipId) ?? 0) + add);
      }
    } else {
      motoByDealership.set(trip.dealershipId, (motoByDealership.get(trip.dealershipId) ?? 0) + 1);
    }
  }

  const topDealershipIds = [...motoByDealership.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, RANKING_LIMIT)
    .map(([id]) => id);

  const dealerships = await prisma.dealership.findMany({ where: { id: { in: topDealershipIds } } });
  const dealershipMap = Object.fromEntries(dealerships.map((d) => [d.id, d]));

  const vehicleIds = vehicleTripCounts.map((v) => v.vehicleId);
  const vehicles = await prisma.vehicle.findMany({
    where: { id: { in: vehicleIds } },
    select: { id: true, plate: true, type: true },
  });
  const vehicleMap = Object.fromEntries(vehicles.map((v) => [v.id, v]));

  const dealershipRanking = topDealershipIds.map((dealershipId) => ({
    dealershipId,
    name: dealershipMap[dealershipId]?.name ?? '—',
    city: dealershipMap[dealershipId]?.city ?? '',
    motos: motoByDealership.get(dealershipId) ?? 0,
  }));

  const plateRanking = vehicleTripCounts.map((v) => ({
    vehicleId: v.vehicleId,
    plate: vehicleMap[v.vehicleId]?.plate ?? '—',
    type: vehicleMap[v.vehicleId]?.type ?? null,
    trips: v._count.id,
  }));

  const tripsPerDay: { date: string; count: number }[] = [];
  for (let i = TRIPS_CHART_DAYS - 1; i >= 0; i -= 1) {
    const d = subDays(today, i);
    const key = format(d, 'yyyy-MM-dd');
    const count = tripsInChartWindow.filter((t) => format(t.departureAt, 'yyyy-MM-dd') === key).length;
    tripsPerDay.push({ date: key, count });
  }

  const payrollPeriod = payrollPeriodForDate(today);
  const showPernoites = req.user?.role === Role.ADMIN || req.user?.role === Role.CONSULTA;
  const pernoiteData = showPernoites
    ? await fetchLslPernoitesForPeriod(payrollPeriod)
    : { ranking: [] as Awaited<ReturnType<typeof fetchLslPernoitesForPeriod>>['ranking'], totalPernoites: 0, totalTrips: 0 };
  const pernoiteRanking = pernoiteData.ranking.slice(0, RANKING_LIMIT);

  res.json({
    period: {
      tripsChartDays: TRIPS_CHART_DAYS,
      rankingDays: RANKING_DAYS,
      pernoites: {
        start: payrollPeriod.start.toISOString(),
        end: payrollPeriod.end.toISOString(),
        label: payrollPeriod.label,
      },
    },
    summary: {
      placasDisponiveis: availableForRoutes,
      emViagem,
      aguardandoPlaca: awaitingPlatesRoutes,
      vencimentoUrgente: urgentRoutes,
      viagensAtrasadas: atrasadas,
    },
    tripsPerDay,
    dealershipRanking,
    plateRanking,
    pernoiteRanking: showPernoites ? pernoiteRanking : [],
    pernoiteSummary: showPernoites
      ? {
          totalPernoites: pernoiteData.totalPernoites,
          totalTrips: pernoiteData.totalTrips,
        }
      : { totalPernoites: 0, totalTrips: 0 },
  });
});

export default router;
