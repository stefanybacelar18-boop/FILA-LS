import { Router } from 'express';
import { z } from 'zod';
import { Role, RouteStatus, VehicleStatus, TripStatus } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { audit } from '../services/audit';
import { expectedReturnDate, routeDepartureAt, vehicleColor } from '../utils/status';
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

/** Vehicle type must be allowed by EVERY stop (AMBOS = any). */
function vehicleAllowedAtAllStops(vehicleType: string, dealerships: DealershipRow[]): DealershipRow | null {
  for (const d of dealerships) {
    if (d.allowedVehicle !== 'AMBOS' && d.allowedVehicle !== vehicleType) {
      return d;
    }
  }
  return null;
}

export function createRoutesRouter(io: Server) {
  const router = Router();
  router.use(authenticate);

  const schema = z.object({
    name: z.string().min(2),
    date: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida'),
    dealershipIds: z.array(z.string()).min(1),
    region: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    hasPriority: z.boolean().optional(),
    priorityNotes: z.string().optional().nullable(),
  });

  router.get('/', async (req, res) => {
    const { status, date, q } = req.query;
    const where: Record<string, unknown> = {};
    if (status) where.status = String(status);
    if (date) {
      const d = new Date(String(date));
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: 'Data inválida' });
      }
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
        _count: { select: { trips: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(routes);
  });

  /**
   * Painel para Definir Placas:
   * - available: livres (retorno já liberou / DISPONIVEL)
   * - unavailable: não podem carregar na data do roteiro (em viagem, bloqueado, manutenção…)
   *   + justificativa/previsão se o operador já informou
   */
  router.get('/:id/plates-board', authorize(Role.ADMIN, Role.OPERACAO), async (req, res) => {
    const route = await prisma.route.findUnique({ where: { id: paramId(req) } });
    if (!route) return res.status(404).json({ error: 'Roteiro não encontrado' });

    const loadAt = routeDepartureAt(route.date);

    const [vehicles, reports] = await Promise.all([
      prisma.vehicle.findMany({ orderBy: { plate: 'asc' } }),
      prisma.plateUnavailability.findMany({
        where: { routeId: route.id },
        include: { reportedBy: { select: { id: true, name: true } } },
      }),
    ]);

    const reportByVehicle = new Map(reports.map((r) => [r.vehicleId, r]));

    const openTrips = await prisma.trip.findMany({
      where: {
        vehicleId: { in: vehicles.map((v) => v.id) },
        status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] },
      },
      orderBy: { departureAt: 'desc' },
    });
    const tripByVehicle = new Map<string, (typeof openTrips)[0]>();
    for (const t of openTrips) {
      if (!tripByVehicle.has(t.vehicleId)) tripByVehicle.set(t.vehicleId, t);
    }

    const available = [];
    const unavailable = [];

    for (const v of vehicles) {
      const open = tripByVehicle.get(v.id);
      const report = reportByVehicle.get(v.id);
      const isFree =
        v.status === VehicleStatus.DISPONIVEL && !open;

      const enriched = {
        ...v,
        color: vehicleColor(v.status, open?.expectedReturn),
        expectedReturn: open?.expectedReturn ?? null,
        activeTripId: open?.id ?? null,
        report: report
          ? {
              id: report.id,
              reason: report.reason,
              availableAtForecast: report.availableAtForecast,
              reportedAt: report.createdAt,
              reportedBy: report.reportedBy,
            }
          : null,
      };

      if (isFree) {
        available.push(enriched);
      } else {
        let statusLabel = v.status;
        if (open) {
          statusLabel =
            open.expectedReturn <= loadAt
              ? 'EM_VIAGEM_ATRASADO_OU_SEM_RETORNO'
              : 'EM_VIAGEM';
        }
        unavailable.push({
          ...enriched,
          unavailableReasonCode: statusLabel,
          loadDate: loadAt,
        });
      }
    }

    res.json({
      routeId: route.id,
      routeName: route.name,
      loadAt,
      available,
      unavailable,
    });
  });

  const unavailabilitySchema = z.object({
    vehicleId: z.string().min(1),
    reason: z.string().min(5),
    availableAtForecast: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida'),
  });

  /** Operador justifica indisponibilidade para a data de carregamento do roteiro */
  router.post(
    '/:id/unavailable',
    authorize(Role.ADMIN, Role.OPERACAO),
    async (req: AuthRequest, res) => {
      const parsed = unavailabilitySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Informe o motivo (mín. 5 caracteres) e a previsão de disponibilidade',
        });
      }

      const routeId = paramId(req);
      const route = await prisma.route.findUnique({ where: { id: routeId } });
      if (!route) return res.status(404).json({ error: 'Roteiro não encontrado' });

      const vehicle = await prisma.vehicle.findUnique({ where: { id: parsed.data.vehicleId } });
      if (!vehicle) return res.status(404).json({ error: 'Veículo não encontrado' });

      const open = await prisma.trip.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] },
        },
      });
      const isFree = vehicle.status === VehicleStatus.DISPONIVEL && !open;
      if (isFree) {
        return res.status(400).json({
          error: 'Esta placa já está disponível. Não é necessário justificar indisponibilidade.',
        });
      }

      const forecast = new Date(parsed.data.availableAtForecast);
      const loadAt = routeDepartureAt(route.date);
      if (forecast < loadAt && forecast < new Date()) {
        // allow past forecast only if clarifying; prefer forecast >= today
      }

      const row = await prisma.plateUnavailability.upsert({
        where: {
          routeId_vehicleId: { routeId, vehicleId: vehicle.id },
        },
        create: {
          routeId,
          vehicleId: vehicle.id,
          reason: parsed.data.reason.trim(),
          availableAtForecast: forecast,
          reportedById: req.user!.id,
        },
        update: {
          reason: parsed.data.reason.trim(),
          availableAtForecast: forecast,
          reportedById: req.user!.id,
        },
        include: {
          vehicle: true,
          reportedBy: { select: { id: true, name: true } },
        },
      });

      await prisma.vehicleHistory.create({
        data: {
          vehicleId: vehicle.id,
          userId: req.user!.id,
          action: 'INDISPONIVEL_ROTEIRO',
          fromStatus: vehicle.status,
          toStatus: vehicle.status,
          details: `Roteiro ${route.name} (${loadAt.toISOString().slice(0, 10)} 06:00): ${parsed.data.reason.trim()} · prev. disp. ${forecast.toISOString().slice(0, 10)}`,
        },
      });

      await audit('UNAVAILABLE_REPORT', 'Route', {
        userId: req.user!.id,
        entityId: routeId,
        details: `${vehicle.plate}: ${parsed.data.reason.trim().slice(0, 100)}`,
      });
      io.emit('routes:changed', { action: 'unavailable', id: routeId });
      io.emit('fleet:changed', { action: 'unavailable', vehicleId: vehicle.id });
      res.status(201).json(row);
    },
  );

  router.get('/:id', async (req, res) => {
    const route = await prisma.route.findUnique({
      where: { id: paramId(req) },
      include: {
        ...routeDealershipInclude,
        dealership: true,
        createdBy: { select: { id: true, name: true } },
        vehicles: { include: { vehicle: true } },
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
      where: { id: { in: parsed.data.dealershipIds }, active: true },
    });
    if (dealerships.length !== parsed.data.dealershipIds.length) {
      return res.status(400).json({ error: 'Uma ou mais concessionárias inválidas ou inativas' });
    }

    const ordered = parsed.data.dealershipIds.map((id) => dealerships.find((d) => d.id === id)!);
    const hasPriority = !!parsed.data.hasPriority;

    const joinedRegions = [...new Set(ordered.map((d) => d.region))].join(' / ');
    const region = parsed.data.region ?? (joinedRegions || ordered[0]?.region);

    const route = await prisma.route.create({
      data: {
        name: parsed.data.name.trim(),
        date: new Date(parsed.data.date),
        dealershipId: ordered[0]?.id,
        region,
        notes: parsed.data.notes?.trim() || null,
        hasPriority,
        priorityNotes: hasPriority ? parsed.data.priorityNotes?.trim() || null : null,
        createdById: req.user!.id,
        dealerships: {
          create: ordered.map((d, order) => ({
            dealershipId: d.id,
            order,
          })),
        },
      },
      include: {
        ...routeDealershipInclude,
        dealership: true,
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
    if (existing.status === RouteStatus.CANCELADO || existing.status === RouteStatus.CONCLUIDO) {
      return res.status(400).json({ error: 'Roteiro finalizado não pode ser editado' });
    }

    const { dealershipIds, date, ...rest } = parsed.data;
    const data: Record<string, unknown> = { ...rest };
    if (date) data.date = new Date(date);
    if (rest.hasPriority === false) data.priorityNotes = null;
    if (typeof rest.name === 'string') data.name = rest.name.trim();
    if (rest.notes !== undefined) data.notes = rest.notes?.trim() || null;

    if (dealershipIds?.length) {
      const dealerships = await prisma.dealership.findMany({
        where: { id: { in: dealershipIds }, active: true },
      });
      if (dealerships.length !== dealershipIds.length) {
        return res.status(400).json({ error: 'Uma ou mais concessionárias inválidas ou inativas' });
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

    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: {
        ...routeDealershipInclude,
        dealership: true,
        vehicles: { include: { vehicle: true } },
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

    const uniqueVehicleIds = [...new Set(vehicleIds)];

    const route = await prisma.route.findUnique({
      where: { id: paramId(req) },
      include: {
        ...routeDealershipInclude,
        dealership: true,
      },
    });
    if (!route) return res.status(404).json({ error: 'Roteiro não encontrado' });
    if (
      route.status !== RouteStatus.AGUARDANDO_PLACAS &&
      route.status !== RouteStatus.RASCUNHO &&
      route.status !== RouteStatus.EM_ANDAMENTO
    ) {
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
    // Saída = data do roteiro às 06:00 (regra operacional)
    const departureAt = routeDepartureAt(route.date);
    const expectedReturn = expectedReturnDate(departureAt, farthest.avgTravelDays);

    try {
      const results = await prisma.$transaction(async (tx) => {
        const trips = [];

        for (const vehicleId of uniqueVehicleIds) {
          const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId } });
          if (!vehicle) {
            throw Object.assign(new Error(`Veículo ${vehicleId} não encontrado`), { status: 404 });
          }

          // Atomic claim: only succeed if still DISPONIVEL
          const claimed = await tx.vehicle.updateMany({
            where: { id: vehicleId, status: VehicleStatus.DISPONIVEL },
            data: { status: VehicleStatus.EM_VIAGEM },
          });
          if (claimed.count !== 1) {
            throw Object.assign(new Error(`Placa ${vehicle.plate} não está disponível`), {
              status: 400,
            });
          }

          const openTrip = await tx.trip.findFirst({
            where: { vehicleId, status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] } },
          });
          if (openTrip) {
            throw Object.assign(
              new Error(`Placa ${vehicle.plate} já está em outro roteiro/viagem`),
              { status: 409 },
            );
          }

          const blockedBy = vehicleAllowedAtAllStops(vehicle.type, linked);
          if (blockedBy) {
            throw Object.assign(
              new Error(
                `Placa ${vehicle.plate} (${vehicle.type}) não permitida em ${blockedBy.name} (${blockedBy.allowedVehicle})`,
              ),
              { status: 400 },
            );
          }

          const resolvedDriver =
            drivers?.[vehicleId]?.trim() ||
            driverName?.trim() ||
            vehicle.defaultDriver ||
            null;

          await tx.routeVehicle.upsert({
            where: {
              routeId_vehicleId: { routeId: route.id, vehicleId },
            },
            create: { routeId: route.id, vehicleId },
            update: { assignedAt: new Date() },
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

          trips.push(t);
        }

        await tx.route.update({
          where: { id: route.id },
          data: { status: RouteStatus.EM_ANDAMENTO },
        });

        return trips;
      });

      await audit('ASSIGN_PLATES', 'Route', {
        userId: req.user!.id,
        entityId: route.id,
        details: `${uniqueVehicleIds.length} placa(s)`,
      });
      io.emit('fleet:changed', { action: 'assign', routeId: route.id });
      io.emit('trips:changed', { action: 'create' });
      io.emit('routes:changed', { action: 'assign', id: route.id });
      res.status(201).json({ trips: results });
    } catch (err) {
      const e = err as Error & { status?: number };
      const status = e.status ?? 500;
      if (status >= 400 && status < 500) {
        return res.status(status).json({ error: e.message });
      }
      console.error('assign-plates failed', err);
      return res.status(500).json({ error: 'Falha ao atribuir placas' });
    }
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
