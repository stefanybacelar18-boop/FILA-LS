import { Router } from 'express';
import { TripStatus, VehicleStatus, VehicleType, RouteStatus } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { isOverdue, routeDepartureAt } from '../utils/status';
import { addDays, startOfDay, subDays, format } from 'date-fns';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res) => {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const dayAfter = addDays(today, 2);

  const [
    fleet,
    trucksAvailable,
    carretasAvailable,
    emViagem,
    emManutencao,
    bloqueados,
    openTrips,
    dealershipTripCounts,
    tripsLast14,
    priorityRoutes,
    awaitingPlatesRoutes,
    pendingRoutes,
  ] = await Promise.all([
    prisma.vehicle.count(),
    prisma.vehicle.count({ where: { type: VehicleType.TRUCK, status: VehicleStatus.DISPONIVEL } }),
    prisma.vehicle.count({ where: { type: VehicleType.CARRETA, status: VehicleStatus.DISPONIVEL } }),
    prisma.vehicle.count({ where: { status: VehicleStatus.EM_VIAGEM } }),
    prisma.vehicle.count({ where: { status: VehicleStatus.EM_MANUTENCAO } }),
    prisma.vehicle.count({ where: { status: VehicleStatus.BLOQUEADO } }),
    prisma.trip.findMany({
      where: { status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] } },
      include: {
        dealership: true,
        vehicle: { select: { id: true, plate: true } },
        route: { select: { id: true, name: true } },
      },
    }),
    prisma.trip.groupBy({
      by: ['dealershipId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }),
    prisma.trip.findMany({
      where: { departureAt: { gte: subDays(today, 13) } },
      select: { departureAt: true },
    }),
    prisma.route.count({
      where: {
        hasPriority: true,
        status: { in: [RouteStatus.AGUARDANDO_PLACAS, RouteStatus.EM_ANDAMENTO] },
      },
    }),
    prisma.route.count({
      where: { status: { in: [RouteStatus.AGUARDANDO_PLACAS, RouteStatus.RASCUNHO] } },
    }),
    prisma.route.findMany({
      where: {
        status: { in: [RouteStatus.AGUARDANDO_PLACAS, RouteStatus.RASCUNHO, RouteStatus.EM_ANDAMENTO] },
        date: { gte: today, lt: dayAfter },
      },
      include: {
        vehicles: true,
        dealerships: { include: { dealership: { select: { name: true, city: true } } }, orderBy: { order: 'asc' } },
        dealership: { select: { name: true, city: true } },
        unavailabilities: true,
      },
      orderBy: { date: 'asc' },
    }),
  ]);

  const retornamHoje = openTrips.filter(
    (t) => t.expectedReturn >= today && t.expectedReturn < tomorrow,
  ).length;
  const retornamAmanha = openTrips.filter(
    (t) => t.expectedReturn >= tomorrow && t.expectedReturn < dayAfter,
  ).length;
  const atrasadas = openTrips.filter((t) => isOverdue(t.expectedReturn, t.returnedAt)).length;
  const atrasadasSemJustificativa = openTrips.filter(
    (t) => isOverdue(t.expectedReturn, t.returnedAt) && !t.delayReason,
  ).length;

  // Placas que já deveriam ter voltado (previsão <= agora) e ainda estão fora
  const deveriamEstarDisponiveis = openTrips.filter((t) => t.expectedReturn <= new Date()).length;

  // Justificativas pendentes em roteiros aguardando placas (placa fora que já deveria ter retornado até o load)
  const pendingPlateRoutes = await prisma.route.findMany({
    where: { status: { in: [RouteStatus.AGUARDANDO_PLACAS, RouteStatus.RASCUNHO] } },
    include: { unavailabilities: true },
  });

  let justificativasPendentes = 0;
  for (const route of pendingPlateRoutes) {
    const loadAt = routeDepartureAt(route.date);
    const reported = new Set(route.unavailabilities.map((u) => u.vehicleId));
    const overdueOpen = openTrips.filter(
      (t) => t.expectedReturn <= loadAt && !reported.has(t.vehicleId),
    );
    justificativasPendentes += overdueOpen.length;
  }

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

  const hojeCarregamento = pendingRoutes.map((r) => {
    const dest =
      r.dealerships.length > 0
        ? r.dealerships.map((rd) => rd.dealership.city).join(', ')
        : r.dealership?.city ?? '';
    const assigned = r.vehicles.length;
    const planned = r.plannedVehicleCount ?? null;
    return {
      id: r.id,
      name: r.name,
      date: r.date,
      hasPriority: r.hasPriority,
      status: r.status,
      cities: dest,
      assignedPlates: assigned,
      plannedPlates: planned,
      coverage:
        planned && planned > 0 ? Math.min(100, Math.round((assigned / planned) * 100)) : null,
      justifications: r.unavailabilities.length,
    };
  });

  res.json({
    fleet: {
      total: fleet,
      trucksAvailable,
      carretasAvailable,
      emViagem,
      emManutencao,
      bloqueados,
      retornamHoje,
      retornamAmanha,
      atrasadas,
      atrasadasSemJustificativa,
      deveriamEstarDisponiveis,
    },
    ops: {
      awaitingPlates: awaitingPlatesRoutes,
      priorityRoutes,
      justificativasPendentes,
      atrasadasSemJustificativa,
    },
    hojeCarregamento,
    topDealership: ranking[0] ?? null,
    avgTravelDays: Math.round(avgTravelDays * 10) / 10,
    tripsPerDay,
    tripsPerDealership: ranking,
    ranking,
    priorityRoutes,
  });
});

export default router;
