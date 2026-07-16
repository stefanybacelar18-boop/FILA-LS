import { Router } from 'express';
import { TripStatus, VehicleStatus, VehicleType } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { daysUntilExpiry, isOverdue } from '../utils/status';
import { addDays, startOfDay, subDays, format } from 'date-fns';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res) => {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);

  const [
    fleet,
    trucksAvailable,
    carretasAvailable,
    emViagem,
    emManutencao,
    openTrips,
    dealershipTripCounts,
    products,
    tripsLast14,
  ] = await Promise.all([
    prisma.vehicle.count(),
    prisma.vehicle.count({ where: { type: VehicleType.TRUCK, status: VehicleStatus.DISPONIVEL } }),
    prisma.vehicle.count({ where: { type: VehicleType.CARRETA, status: VehicleStatus.DISPONIVEL } }),
    prisma.vehicle.count({ where: { status: VehicleStatus.EM_VIAGEM } }),
    prisma.vehicle.count({ where: { status: VehicleStatus.EM_MANUTENCAO } }),
    prisma.trip.findMany({
      where: { status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] } },
      include: { dealership: true },
    }),
    prisma.trip.groupBy({
      by: ['dealershipId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }),
    prisma.priorityProduct.findMany({ where: { active: true } }),
    prisma.trip.findMany({
      where: { departureAt: { gte: subDays(today, 13) } },
      select: { departureAt: true },
    }),
  ]);

  const retornamHoje = openTrips.filter(
    (t) => t.expectedReturn >= today && t.expectedReturn < tomorrow
  ).length;
  const retornamAmanha = openTrips.filter(
    (t) => t.expectedReturn >= tomorrow && t.expectedReturn < addDays(today, 2)
  ).length;
  const atrasadas = openTrips.filter((t) => isOverdue(t.expectedReturn, t.returnedAt)).length;

  const dealershipIds = dealershipTripCounts.map((d) => d.dealershipId);
  const dealerships = await prisma.dealership.findMany({ where: { id: { in: dealershipIds } } });
  const dealershipMap = Object.fromEntries(dealerships.map((d) => [d.id, d]));

  const ranking = dealershipTripCounts.map((d) => ({
    dealershipId: d.dealershipId,
    name: dealershipMap[d.dealershipId]?.name ?? '—',
    city: dealershipMap[d.dealershipId]?.city ?? '',
    trips: d._count.id,
  }));

  const completed = await prisma.trip.findMany({
    where: { status: TripStatus.RETORNOU, returnedAt: { not: null } },
    select: { departureAt: true, returnedAt: true },
  });
  const avgTravelDays =
    completed.length === 0
      ? 0
      : completed.reduce((acc, t) => {
          const days =
            (t.returnedAt!.getTime() - t.departureAt.getTime()) / (1000 * 60 * 60 * 24);
          return acc + days;
        }, 0) / completed.length;

  const tripsPerDay: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = subDays(today, i);
    const key = format(d, 'yyyy-MM-dd');
    const count = tripsLast14.filter((t) => format(t.departureAt, 'yyyy-MM-dd') === key).length;
    tripsPerDay.push({ date: key, count });
  }

  const enrichedProducts = products.map((p) => ({
    ...p,
    daysRemaining: daysUntilExpiry(p.expiryDate),
  }));

  res.json({
    fleet: {
      total: fleet,
      trucksAvailable,
      carretasAvailable,
      emViagem,
      emManutencao,
      retornamHoje,
      retornamAmanha,
      atrasadas,
    },
    topDealership: ranking[0] ?? null,
    avgTravelDays: Math.round(avgTravelDays * 10) / 10,
    tripsPerDay,
    tripsPerDealership: ranking,
    ranking,
    products: {
      prioritarios: enrichedProducts.filter((p) => p.daysRemaining <= 30 && p.daysRemaining >= 0).length,
      vencendo: enrichedProducts.filter((p) => p.daysRemaining >= 0 && p.daysRemaining < 15).length,
      vencidos: enrichedProducts.filter((p) => p.daysRemaining < 0).length,
      list: enrichedProducts.filter((p) => p.daysRemaining <= 30).slice(0, 10),
    },
  });
});

export default router;
