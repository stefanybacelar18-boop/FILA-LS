import { Router } from 'express';
import { z } from 'zod';
import { Role, RouteStatus, VehicleStatus, TripStatus } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { audit } from '../services/audit';
import { expectedReturnDate, daysUntilExpiry } from '../utils/status';
import type { Server } from 'socket.io';
import { paramId } from '../utils/params';

const routeDealershipInclude = {
  dealerships: {
    include: { dealership: true },
    orderBy: { order: 'asc' as const },
  },
};

type DealershipRow = {
  id: string;
  name: string;
  distanceKm: number;
  avgTravelDays: number;
  allowedVehicle: string;
};

/** Farthest dealership: highest avgTravelDays, then distanceKm */
function farthestDealership(dealerships: DealershipRow[]): DealershipRow {
  return [...dealerships].sort((a, b) => {
    if (b.avgTravelDays !== a.avgTravelDays) return b.avgTravelDays - a.avgTravelDays;
    return b.distanceKm - a.distanceKm;
  })[0];
}

export function createRoutesRouter(io: Server) {
  const router = Router();
  router.use(authenticate);

  const schema = z.object({
    name: z.string().min(2),
    date: z.string(),
    dealershipIds: z.array(z.string()).min(1),
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
        { dealerships: { some: { dealership: { name: { contains: String(q) } } } } },
      ];
    }
    const routes = await prisma.route.findMany({
      where,
      include: {
        ...routeDealershipInclude,
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
      where: { id: paramId(req) },
      include: {
        ...routeDealershipInclude,
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

    const dealerships = await prisma.dealership.findMany({
      where: { id: { in: parsed.data.dealershipIds } },
    });
    if (dealerships.length !== parsed.data.dealershipIds.length) {
      return res.status(404).json({ error: 'Uma ou mais concessionárias não encontradas' });
    }

    const ordered = parsed.data.dealershipIds.map((id) => dealerships.find((d) => d.id === id)!);
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

    const joinedRegions = [...new Set(ordered.map((d) => d.region))].join(' / ');
    const region = parsed.data.region ?? (joinedRegions || ordered[0]?.region);

    const route = await prisma.route.create({
      data: {
        name: parsed.data.name,
        date: new Date(parsed.data.date),
        dealershipId: ordered[0]?.id,
        region,
        notes: parsed.data.notes,
        hasPriority,
        createdById: req.user!.id,
        dealerships: {
          create: ordered.map((d, order) => ({
            dealershipId: d.id,
            order,
          })),
        },
        products: productIds.length
          ? { create: productIds.map((productId) => ({ productId })) }
          : undefined,
      },
      include: {
        ...routeDealershipInclude,
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

    const routeId = paramId(req);
    const existing = await prisma.route.findUnique({ where: { id: routeId } });
    if (!existing) return res.status(404).json({ error: 'Roteiro não encontrado' });

    const { dealershipIds, productIds, date, ...rest } = parsed.data;
    const data: Record<string, unknown> = { ...rest };
    if (date) data.date = new Date(date);

    if (dealershipIds?.length) {
      const dealerships = await prisma.dealership.findMany({
        where: { id: { in: dealershipIds } },
      });
      if (dealerships.length !== dealershipIds.length) {
        return res.status(404).json({ error: 'Uma ou mais concessionárias não encontradas' });
      }
      const ordered = dealershipIds.map((id) => dealerships.find((d) => d.id === id)!);
      data.dealershipId = ordered[0]?.id;
      if (rest.region === undefined) {
        data.region = [...new Set(ordered.map((d) => d.region))].join(' / ') || ordered[0]?.region;
      }
      await prisma.$transaction(async (tx) => {
        await tx.routeDealership.deleteMany({ where: { routeId } });
        await tx.routeDealership.createMany({
          data: ordered.map((d, order) => ({
            routeId,
            dealershipId: d.id,
            order,
          })),
        });
        await tx.route.update({ where: { id: routeId }, data });
      });
    } else {
      await prisma.route.update({ where: { id: routeId }, data });
    }

    if (productIds) {
      await prisma.routeProduct.deleteMany({ where: { routeId } });
      if (productIds.length) {
        await prisma.routeProduct.createMany({
          data: productIds.map((productId) => ({ routeId, productId })),
        });
      }
    }

    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: {
        ...routeDealershipInclude,
        dealership: true,
        vehicles: { include: { vehicle: true } },
        products: { include: { product: true } },
      },
    });
    await audit('UPDATE', 'Route', { userId: req.user!.id, entityId: routeId });
    io.emit('routes:changed', { action: 'update', id: routeId });
    res.json(route);
  });

  /** Assign plates to route (operação) — exclusive screen action */
  router.post('/:id/assign-plates', authorize(Role.ADMIN, Role.OPERACAO), async (req: AuthRequest, res) => {
    const { vehicleIds, driverName, drivers } = req.body as {
      vehicleIds: string[];
      driverName?: string;
      drivers?: Record<string, string>;
    };
    if (!Array.isArray(vehicleIds) || vehicleIds.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos uma placa' });
    }

    const route = await prisma.route.findUnique({
      where: { id: paramId(req) },
      include: {
        ...routeDealershipInclude,
        dealership: true,
      },
    });
    if (!route) return res.status(404).json({ error: 'Roteiro não encontrado' });
    if (route.status === RouteStatus.CANCELADO || route.status === RouteStatus.CONCLUIDO) {
      return res.status(400).json({ error: 'Roteiro não aceita novas placas' });
    }

    const linked: DealershipRow[] =
      route.dealerships.length > 0
        ? route.dealerships.map((rd) => rd.dealership)
        : route.dealership
          ? [route.dealership]
          : [];
    if (linked.length === 0) {
      return res.status(400).json({ error: 'Roteiro sem concessionárias' });
    }

    const farthest = farthestDealership(linked);
    const destNames = linked.map((d) => d.name).join(', ');

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

      const allowed = farthest.allowedVehicle;
      if (allowed !== 'AMBOS' && vehicle.type !== allowed) {
        return res.status(400).json({
          error: `Placa ${vehicle.plate} (${vehicle.type}) não permitida nesta concessionária (${allowed})`,
        });
      }

      const departureAt = new Date();
      const expectedReturn = expectedReturnDate(departureAt, farthest.avgTravelDays);
      const resolvedDriver =
        drivers?.[vehicleId]?.trim() ||
        driverName?.trim() ||
        vehicle.defaultDriver ||
        null;

      const trip = await prisma.$transaction(async (tx) => {
        await tx.routeVehicle.create({ data: { routeId: route.id, vehicleId } });
        await tx.vehicle.update({
          where: { id: vehicleId },
          data: { status: VehicleStatus.EM_VIAGEM },
        });
        const t = await tx.trip.create({
          data: {
            vehicleId,
            dealershipId: farthest.id,
            routeId: route.id,
            driverName: resolvedDriver,
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
            details: `Roteiro ${route.name} → ${destNames} (retorno: ${farthest.name})`,
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
      where: { routeId: paramId(req), status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] } },
    });
    if (openTrips > 0) return res.status(400).json({ error: 'Roteiro possui viagens abertas' });

    await prisma.route.update({
      where: { id: paramId(req) },
      data: { status: RouteStatus.CANCELADO },
    });
    await audit('CANCEL', 'Route', { userId: req.user!.id, entityId: paramId(req) });
    io.emit('routes:changed', { action: 'cancel', id: paramId(req) });
    res.status(204).send();
  });

  return router;
}
