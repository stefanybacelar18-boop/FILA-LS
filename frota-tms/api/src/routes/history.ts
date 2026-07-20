import { Router } from 'express';
import { Role } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { paramId } from '../utils/params';
import { vehicleColor, isOverdue } from '../utils/status';

const router = Router();
router.use(authenticate);

router.get('/vehicle/:id', async (req, res) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: paramId(req) } });
  if (!vehicle) return res.status(404).json({ error: 'Veículo não encontrado' });

  const [history, trips, activeTrip] = await Promise.all([
    prisma.vehicleHistory.findMany({
      where: { vehicleId: paramId(req) },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.trip.findMany({
      where: { vehicleId: paramId(req) },
      include: {
        dealership: true,
        assignedBy: { select: { name: true } },
        returnedBy: { select: { name: true } },
        route: true,
      },
      orderBy: { departureAt: 'desc' },
    }),
    prisma.trip.findFirst({
      where: { vehicleId: paramId(req), status: { in: ['EM_ANDAMENTO', 'ATRASADO'] } },
      orderBy: { departureAt: 'desc' },
    }),
  ]);

  res.json({
    vehicle: {
      ...vehicle,
      color: vehicleColor(vehicle.status, activeTrip?.expectedReturn),
      expectedReturn: activeTrip?.expectedReturn ?? null,
      activeTripId: activeTrip?.id ?? null,
    },
    history,
    trips: trips.map((t) => ({
      ...t,
      overdue: isOverdue(t.expectedReturn, t.returnedAt),
      color: vehicleColor(
        t.status === 'RETORNOU' ? 'DISPONIVEL' : 'EM_VIAGEM',
        t.expectedReturn,
      ),
    })),
  });
});

router.get('/trips', async (req, res) => {
  const { dealershipId, userId, vehicleType, from, to, plate } = req.query;
  const where: Record<string, unknown> = {};
  if (dealershipId) where.dealershipId = String(dealershipId);
  if (userId) where.assignedById = String(userId);
  if (from || to) {
    where.departureAt = {};
    if (from) (where.departureAt as Record<string, Date>).gte = new Date(String(from));
    if (to) (where.departureAt as Record<string, Date>).lte = new Date(String(to));
  }
  if (vehicleType || plate) {
    where.vehicle = {};
    if (vehicleType) (where.vehicle as Record<string, string>).type = String(vehicleType);
    if (plate) (where.vehicle as Record<string, object>).plate = { contains: String(plate).toUpperCase() };
  }

  const trips = await prisma.trip.findMany({
    where,
    include: {
      vehicle: true,
      dealership: true,
      assignedBy: { select: { id: true, name: true } },
      returnedBy: { select: { id: true, name: true } },
      route: true,
    },
    orderBy: { departureAt: 'desc' },
    take: 500,
  });
  res.json(
    trips.map((t) => ({
      ...t,
      overdue: isOverdue(t.expectedReturn, t.returnedAt),
      color: vehicleColor(t.vehicle.status, t.expectedReturn),
    })),
  );
});

router.get('/audit', authorize(Role.ADMIN), async (_req, res) => {
  const logs = await prisma.auditLog.findMany({
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json(logs);
});

export default router;
