import { Router } from 'express';
import { Role, TripStatus, VehicleStatus, RouteStatus } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { audit } from '../services/audit';
import { isOverdue, vehicleColor } from '../utils/status';
import { addDays, startOfDay, endOfDay } from 'date-fns';
import type { Server } from 'socket.io';

export function createTripsRouter(io: Server) {
  const router = Router();
  router.use(authenticate);

  async function syncOverdue() {
    const open = await prisma.trip.findMany({
      where: { status: TripStatus.EM_ANDAMENTO, expectedReturn: { lt: new Date() } },
    });
    for (const t of open) {
      await prisma.trip.update({ where: { id: t.id }, data: { status: TripStatus.ATRASADO } });
    }
  }

  router.get('/', async (req, res) => {
    await syncOverdue();
    const { status, vehicleId, dealershipId, from, to } = req.query;
    const where: Record<string, unknown> = {};
    if (status) where.status = String(status);
    if (vehicleId) where.vehicleId = String(vehicleId);
    if (dealershipId) where.dealershipId = String(dealershipId);
    if (from || to) {
      where.departureAt = {};
      if (from) (where.departureAt as Record<string, Date>).gte = new Date(String(from));
      if (to) (where.departureAt as Record<string, Date>).lte = new Date(String(to));
    }

    const trips = await prisma.trip.findMany({
      where,
      include: {
        vehicle: true,
        dealership: true,
        route: true,
        assignedBy: { select: { id: true, name: true } },
        returnedBy: { select: { id: true, name: true } },
      },
      orderBy: { departureAt: 'desc' },
    });

    res.json(
      trips.map((t) => ({
        ...t,
        overdue: isOverdue(t.expectedReturn, t.returnedAt),
        color: vehicleColor(t.vehicle.status, t.expectedReturn),
      }))
    );
  });

  router.get('/returns', async (_req, res) => {
    await syncOverdue();
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const dayAfter = addDays(today, 2);

    const open = await prisma.trip.findMany({
      where: { status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] } },
      include: {
        vehicle: true,
        dealership: true,
        route: true,
        assignedBy: { select: { name: true } },
      },
      orderBy: { expectedReturn: 'asc' },
    });

    const mapTrip = (t: (typeof open)[0]) => ({
      ...t,
      overdue: isOverdue(t.expectedReturn, t.returnedAt),
      color: vehicleColor(t.vehicle.status, t.expectedReturn),
    });

    res.json({
      today: open.filter((t) => t.expectedReturn >= today && t.expectedReturn < tomorrow).map(mapTrip),
      tomorrow: open.filter((t) => t.expectedReturn >= tomorrow && t.expectedReturn < dayAfter).map(mapTrip),
      in2Days: open
        .filter((t) => t.expectedReturn >= dayAfter && t.expectedReturn < addDays(today, 3))
        .map(mapTrip),
      overdue: open.filter((t) => t.expectedReturn < today || t.status === TripStatus.ATRASADO).map(mapTrip),
    });
  });

  router.post('/:id/return', authorize(Role.ADMIN, Role.OPERACAO), async (req: AuthRequest, res) => {
    const trip = await prisma.trip.findUnique({
      where: { id: req.params.id },
      include: { vehicle: true, route: true, dealership: true },
    });
    if (!trip) return res.status(404).json({ error: 'Viagem não encontrada' });
    if (trip.status === TripStatus.RETORNOU) {
      return res.status(400).json({ error: 'Viagem já finalizada' });
    }

    const returnedAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.trip.update({
        where: { id: trip.id },
        data: {
          status: TripStatus.RETORNOU,
          returnedAt,
          returnedById: req.user!.id,
        },
        include: {
          vehicle: true,
          dealership: true,
          returnedBy: { select: { name: true } },
        },
      });
      await tx.vehicle.update({
        where: { id: trip.vehicleId },
        data: { status: VehicleStatus.DISPONIVEL },
      });
      await tx.vehicleHistory.create({
        data: {
          vehicleId: trip.vehicleId,
          userId: req.user!.id,
          tripId: trip.id,
          action: 'RETORNO',
          fromStatus: VehicleStatus.EM_VIAGEM,
          toStatus: VehicleStatus.DISPONIVEL,
          details: `Retornou de ${trip.dealership.name}`,
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
          await tx.route.update({
            where: { id: trip.routeId },
            data: { status: RouteStatus.CONCLUIDO },
          });
        }
      }
      return t;
    });

    await audit('RETURN', 'Trip', {
      userId: req.user!.id,
      entityId: trip.id,
      details: trip.vehicle.plate,
    });
    io.emit('fleet:changed', { action: 'return', tripId: trip.id });
    io.emit('trips:changed', { action: 'return' });
    res.json(updated);
  });

  return router;
}
