import { Router } from 'express';
import { z } from 'zod';
import { Role, RouteStatus, VehicleStatus, TripStatus } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { audit } from '../services/audit';
import { expectedReturnDate, daysUntilExpiry } from '../utils/status';
import type { Server } from 'socket.io';

export function createRoutesRouter(io: Server) {
  const router = Router();
  router.use(authenticate);

  const schema = z.object({
    name: z.string().min(2),
    date: z.string(),
    dealershipId: z.string(),
    region: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    productIds: z.array(z.string()).optional(),
  });

  router.get('/', async (req, res) => {
    const { status, date, q } = req.query;
    const where: Record<string, unknown> = {};
    if (status) where.status = String(status);
    if (date) {
      const d = new Date(String(date));
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      where.date = { gte: d, lt: next };
    }
    if (q) {
      where.OR = [
        { name: { contains: String(q) } },
        { region: { contains: String(q) } },
        { dealership: { name: { contains: String(q) } } },
      ];
    }
    const routes = await prisma.route.findMany({
      where,
      include: {
        dealership: true,
        createdBy: { select: { id: true, name: true } },
        vehicles: { include: { vehicle: true } },
        products: { include: { product: true } },
        _count: { select: { trips: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(routes);
  });

  router.get('/:id', async (req, res) => {
    const route = await prisma.route.findUnique({
      where: { id: req.params.id },
      include: {
        dealership: true,
        createdBy: { select: { id: true, name: true } },
        vehicles: { include: { vehicle: true } },
        products: { include: { product: true } },
        trips: { include: { vehicle: true, assignedBy: { select: { name: true } } } },
      },
    });
    if (!route) return res.status(404).json({ error: 'Roteiro não encontrado' });
    res.json(route);
  });

  router.post('/', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });

    const dealership = await prisma.dealership.findUnique({ where: { id: parsed.data.dealershipId } });
    if (!dealership) return res.status(404).json({ error: 'Concessionária não encontrada' });

    const productIds = parsed.data.productIds ?? [];
    let hasPriority = false;
    if (productIds.length) {
      const products = await prisma.priorityProduct.findMany({ where: { id: { in: productIds }, active: true } });
      hasPriority = products.some((p) => daysUntilExpiry(p.expiryDate) <= 30);
    } else {
      const urgent = await prisma.priorityProduct.count({
        where: { active: true, expiryDate: { lte: new Date(Date.now() + 30 * 86400000) } },
      });
      hasPriority = urgent > 0;
    }

    const route = await prisma.route.create({
      data: {
        name: parsed.data.name,
        date: new Date(parsed.data.date),
        dealershipId: parsed.data.dealershipId,
        region: parsed.data.region ?? dealership.region,
        notes: parsed.data.notes,
        hasPriority,
        createdById: req.user!.id,
        products: productIds.length
          ? { create: productIds.map((productId) => ({ productId })) }
          : undefined,
      },
      include: {
        dealership: true,
        products: { include: { product: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    await audit('CREATE', 'Route', { userId: req.user!.id, entityId: route.id, details: route.name });
    io.emit('routes:changed', { action: 'create', id: route.id });
    res.status(201).json(route);
  });

  router.put('/:id', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
    const parsed = schema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });

    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.date) data.date = new Date(parsed.data.date);
    delete data.productIds;

    const route = await prisma.route.update({
      where: { id: req.params.id },
      data,
      include: { dealership: true, vehicles: { include: { vehicle: true } } },
    });
    await audit('UPDATE', 'Route', { userId: req.user!.id, entityId: route.id });
    io.emit('routes:changed', { action: 'update', id: route.id });
    res.json(route);
  });

  /** Assign plates to route (operação) — exclusive screen action */
  router.post('/:id/assign-plates', authorize(Role.ADMIN, Role.OPERACAO), async (req: AuthRequest, res) => {
    const { vehicleIds, driverName } = req.body as { vehicleIds: string[]; driverName?: string };
    if (!Array.isArray(vehicleIds) || vehicleIds.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos uma placa' });
    }

    const route = await prisma.route.findUnique({
      where: { id: req.params.id },
      include: { dealership: true },
    });
    if (!route) return res.status(404).json({ error: 'Roteiro não encontrado' });
    if (route.status === RouteStatus.CANCELADO || route.status === RouteStatus.CONCLUIDO) {
      return res.status(400).json({ error: 'Roteiro não aceita novas placas' });
    }

    const results = [];
    for (const vehicleId of vehicleIds) {
      const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
      if (!vehicle) return res.status(404).json({ error: `Veículo ${vehicleId} não encontrado` });
      if (vehicle.status !== VehicleStatus.DISPONIVEL) {
        return res.status(400).json({ error: `Placa ${vehicle.plate} não está disponível` });
      }

      const openTrip = await prisma.trip.findFirst({
        where: { vehicleId, status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] } },
      });
      if (openTrip) {
        return res.status(409).json({ error: `Placa ${vehicle.plate} já está em outro roteiro/viagem` });
      }

      const allowed = route.dealership.allowedVehicle;
      if (allowed !== 'AMBOS' && vehicle.type !== allowed) {
        return res.status(400).json({
          error: `Placa ${vehicle.plate} (${vehicle.type}) não permitida nesta concessionária (${allowed})`,
        });
      }

      const departureAt = new Date();
      const expectedReturn = expectedReturnDate(departureAt, route.dealership.avgTravelDays);

      const trip = await prisma.$transaction(async (tx) => {
        await tx.routeVehicle.create({ data: { routeId: route.id, vehicleId } });
        await tx.vehicle.update({
          where: { id: vehicleId },
          data: { status: VehicleStatus.EM_VIAGEM },
        });
        const t = await tx.trip.create({
          data: {
            vehicleId,
            dealershipId: route.dealershipId,
            routeId: route.id,
            driverName: driverName || null,
            departureAt,
            expectedReturn,
            assignedById: req.user!.id,
            status: TripStatus.EM_ANDAMENTO,
          },
          include: { vehicle: true, dealership: true },
        });
        await tx.vehicleHistory.create({
          data: {
            vehicleId,
            userId: req.user!.id,
            tripId: t.id,
            action: 'SAIDA',
            fromStatus: VehicleStatus.DISPONIVEL,
            toStatus: VehicleStatus.EM_VIAGEM,
            details: `Roteiro ${route.name} → ${route.dealership.name}`,
          },
        });
        return t;
      });
      results.push(trip);
    }

    await prisma.route.update({
      where: { id: route.id },
      data: { status: RouteStatus.EM_ANDAMENTO },
    });

    await audit('ASSIGN_PLATES', 'Route', {
      userId: req.user!.id,
      entityId: route.id,
      details: `${vehicleIds.length} placa(s)`,
    });
    io.emit('fleet:changed', { action: 'assign', routeId: route.id });
    io.emit('trips:changed', { action: 'create' });
    res.status(201).json({ trips: results });
  });

  router.delete('/:id', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
    const openTrips = await prisma.trip.count({
      where: { routeId: req.params.id, status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] } },
    });
    if (openTrips > 0) return res.status(400).json({ error: 'Roteiro possui viagens abertas' });

    await prisma.route.update({
      where: { id: req.params.id },
      data: { status: RouteStatus.CANCELADO },
    });
    await audit('CANCEL', 'Route', { userId: req.user!.id, entityId: req.params.id });
    io.emit('routes:changed', { action: 'cancel', id: req.params.id });
    res.status(204).send();
  });

  return router;
}
