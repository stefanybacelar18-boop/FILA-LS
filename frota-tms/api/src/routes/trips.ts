import { Router } from 'express';
import { z } from 'zod';
import { Role, TripStatus, VehicleStatus, RouteStatus } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { audit } from '../services/audit';
import { isOverdue, vehicleColor } from '../utils/status';
import { addDays, startOfDay } from 'date-fns';
import type { Server } from 'socket.io';
import { paramId } from '../utils/params';

const delayReportSchema = z.object({
  reason: z.string().min(5, 'Informe o motivo com ao menos 5 caracteres'),
  /** Se true, marca o veículo como indisponível (bloqueado) até o retorno */
  markUnavailable: z.boolean().optional(),
  unavailableReason: z.string().optional().nullable(),
});

const returnSchema = z.object({
  /** Obrigatório se a viagem passou da previsão */
  delayReason: z.string().min(5).optional(),
  notes: z.string().optional().nullable(),
});

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
        delayReportedBy: { select: { id: true, name: true } },
      },
      orderBy: { departureAt: 'desc' },
    });

    res.json(
      trips.map((t) => ({
        ...t,
        overdue: isOverdue(t.expectedReturn, t.returnedAt),
        color: vehicleColor(t.vehicle.status, t.expectedReturn),
        needsDelayReason: isOverdue(t.expectedReturn, t.returnedAt) && !t.delayReason,
      })),
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
        delayReportedBy: { select: { name: true } },
      },
      orderBy: { expectedReturn: 'asc' },
    });

    const mapTrip = (t: (typeof open)[0]) => ({
      ...t,
      overdue: isOverdue(t.expectedReturn, t.returnedAt),
      color: vehicleColor(t.vehicle.status, t.expectedReturn),
      needsDelayReason: isOverdue(t.expectedReturn, t.returnedAt) && !t.delayReason,
    });

    const day3 = addDays(today, 3);
    const overdueIds = new Set(
      open
        .filter((t) => t.expectedReturn < today || t.status === TripStatus.ATRASADO)
        .map((t) => t.id),
    );

    res.json({
      today: open
        .filter((t) => !overdueIds.has(t.id) && t.expectedReturn >= today && t.expectedReturn < tomorrow)
        .map(mapTrip),
      tomorrow: open
        .filter((t) => !overdueIds.has(t.id) && t.expectedReturn >= tomorrow && t.expectedReturn < dayAfter)
        .map(mapTrip),
      in2Days: open
        .filter((t) => !overdueIds.has(t.id) && t.expectedReturn >= dayAfter && t.expectedReturn < day3)
        .map(mapTrip),
      later: open
        .filter((t) => !overdueIds.has(t.id) && t.expectedReturn >= day3)
        .map(mapTrip),
      overdue: open.filter((t) => overdueIds.has(t.id)).map(mapTrip),
    });
  });

  /**
   * Empresa terceira / operação informa atraso ou indisponibilidade
   * (antes do retorno físico).
   */
  router.post('/:id/delay-report', authorize(Role.ADMIN, Role.OPERACAO), async (req: AuthRequest, res) => {
    const parsed = delayReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Informe o motivo (mín. 5 caracteres)' });
    }

    const trip = await prisma.trip.findUnique({
      where: { id: paramId(req) },
      include: { vehicle: true },
    });
    if (!trip) return res.status(404).json({ error: 'Viagem não encontrada' });
    if (trip.status === TripStatus.RETORNOU || trip.status === TripStatus.CANCELADO) {
      return res.status(400).json({ error: 'Viagem já finalizada' });
    }

    const now = new Date();
    const overdue = isOverdue(trip.expectedReturn, trip.returnedAt);
    const markUnavailable = !!parsed.data.markUnavailable;
    const unavailableText =
      parsed.data.unavailableReason?.trim() ||
      (markUnavailable ? parsed.data.reason.trim() : null);

    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.trip.update({
        where: { id: trip.id },
        data: {
          status: overdue || trip.status === TripStatus.ATRASADO ? TripStatus.ATRASADO : trip.status,
          delayReason: parsed.data.reason.trim(),
          delayReportedAt: now,
          delayReportedById: req.user!.id,
          ...(markUnavailable
            ? {
                unavailableReason: unavailableText,
                unavailableAt: now,
              }
            : {}),
        },
        include: {
          vehicle: true,
          dealership: true,
          route: true,
          delayReportedBy: { select: { name: true } },
        },
      });

      if (markUnavailable) {
        await tx.vehicle.update({
          where: { id: trip.vehicleId },
          data: { status: VehicleStatus.BLOQUEADO },
        });
        await tx.vehicleHistory.create({
          data: {
            vehicleId: trip.vehicleId,
            userId: req.user!.id,
            tripId: trip.id,
            action: 'INDISPONIVEL',
            fromStatus: trip.vehicle.status,
            toStatus: VehicleStatus.BLOQUEADO,
            details: unavailableText || parsed.data.reason.trim(),
          },
        });
      } else {
        await tx.vehicleHistory.create({
          data: {
            vehicleId: trip.vehicleId,
            userId: req.user!.id,
            tripId: trip.id,
            action: 'JUSTIFICATIVA_ATRASO',
            fromStatus: trip.vehicle.status,
            toStatus: trip.vehicle.status,
            details: parsed.data.reason.trim(),
          },
        });
      }

      return t;
    });

    await audit('DELAY_REPORT', 'Trip', {
      userId: req.user!.id,
      entityId: trip.id,
      details: `${trip.vehicle.plate}: ${parsed.data.reason.trim().slice(0, 120)}`,
    });
    io.emit('fleet:changed', { action: 'delay-report', tripId: trip.id });
    io.emit('trips:changed', { action: 'delay-report' });
    res.json(updated);
  });

  router.post('/:id/return', authorize(Role.ADMIN, Role.OPERACAO), async (req: AuthRequest, res) => {
    const parsed = returnSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    const trip = await prisma.trip.findUnique({
      where: { id: paramId(req) },
      include: { vehicle: true, route: true, dealership: true },
    });
    if (!trip) return res.status(404).json({ error: 'Viagem não encontrada' });
    if (trip.status === TripStatus.RETORNOU) {
      return res.status(400).json({ error: 'Viagem já finalizada' });
    }

    const overdue = isOverdue(trip.expectedReturn, null) || trip.status === TripStatus.ATRASADO;
    const delayReason = (parsed.data.delayReason || trip.delayReason || '').trim();
    if (overdue && delayReason.length < 5) {
      return res.status(400).json({
        error:
          'Viagem fora da previsão: informe a justificativa do atraso antes de liberar o veículo para novo carregamento.',
        code: 'DELAY_REASON_REQUIRED',
      });
    }

    const returnedAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.trip.update({
        where: { id: trip.id },
        data: {
          status: TripStatus.RETORNOU,
          returnedAt,
          returnedById: req.user!.id,
          notes: parsed.data.notes?.trim() || trip.notes,
          ...(overdue && delayReason
            ? {
                delayReason,
                delayReportedAt: trip.delayReportedAt ?? returnedAt,
                delayReportedById: trip.delayReportedById ?? req.user!.id,
              }
            : {}),
          // ao retornar, limpa indisponibilidade da viagem
          unavailableReason: null,
          unavailableAt: null,
        },
        include: {
          vehicle: true,
          dealership: true,
          returnedBy: { select: { name: true } },
          delayReportedBy: { select: { name: true } },
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
          fromStatus: trip.vehicle.status,
          toStatus: VehicleStatus.DISPONIVEL,
          details: overdue
            ? `Retornou de ${trip.dealership.name} (atraso: ${delayReason})`
            : `Retornou de ${trip.dealership.name}`,
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
      return t;
    });

    await audit('RETURN', 'Trip', {
      userId: req.user!.id,
      entityId: trip.id,
      details: overdue ? `${trip.vehicle.plate} (c/ justificativa)` : trip.vehicle.plate,
    });
    io.emit('fleet:changed', { action: 'return', tripId: trip.id });
    io.emit('trips:changed', { action: 'return' });
    res.json(updated);
  });

  return router;
}
