import { Router } from 'express';
import { z } from 'zod';
import { Role, RouteStatus, VehicleStatus, TripStatus } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { audit } from '../services/audit';
import { expectedReturnDate, routeDepartureAt, vehicleColor } from '../utils/status';
import { resolveTravelFromPad, PAD_LAT, PAD_LNG } from '../utils/geo';
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
  city: string;
  distanceKm: number;
  avgTravelDays: number;
  allowedVehicle: string;
};

type DealershipWithPadTravel = DealershipRow & {
  padDistanceKm: number;
  padAvgTravelDays: number;
  padSource: 'coords' | 'city' | 'stored';
};

/** Enriquece com distância/dias calculados do PAD (coordenadas) → cidade. */
function withPadTravel(d: DealershipRow): DealershipWithPadTravel {
  const travel = resolveTravelFromPad({
    city: d.city,
    distanceKm: d.distanceKm,
    avgTravelDays: d.avgTravelDays,
  });
  return {
    ...d,
    padDistanceKm: travel.distanceKm,
    padAvgTravelDays: travel.avgTravelDays,
    padSource: travel.source,
  };
}

/** Destino mais longe do PAD (maior distância km; desempate por dias). */
function farthestDealershipFromPad(dealerships: DealershipRow[]): DealershipWithPadTravel {
  const enriched = dealerships.map(withPadTravel);
  return [...enriched].sort((a, b) => {
    if (b.padDistanceKm !== a.padDistanceKm) return b.padDistanceKm - a.padDistanceKm;
    return b.padAvgTravelDays - a.padAvgTravelDays;
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
    /** Menor vencimento (YYYY-MM-DD) — pode ser data passada */
    priorityExpiryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de vencimento inválida')
      .optional()
      .nullable(),
    plannedVehicleCount: z.number().int().positive().optional().nullable(),
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
      orderBy: [
        { hasPriority: 'desc' },
        { priorityExpiryDate: 'asc' },
        { date: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    const withForecast = routes.map((route) => {
      const linked: DealershipRow[] =
        route.dealerships.length > 0
          ? route.dealerships.map((rd) => rd.dealership)
          : route.dealership
            ? [route.dealership]
            : [];
      if (linked.length === 0) {
        return { ...route, returnForecast: null };
      }
      const farthest = farthestDealershipFromPad(linked);
      const departureAt = routeDepartureAt(route.date);
      const expectedReturn = expectedReturnDate(departureAt, farthest.padAvgTravelDays);
      return {
        ...route,
        returnForecast: {
          basis: 'PAD_DISTANCE' as const,
          pad: { lat: PAD_LAT, lng: PAD_LNG },
          formula: '(distanceKm * 2) / 400',
          farthestDealership: {
            id: farthest.id,
            name: farthest.name,
            city: farthest.city,
            distanceKm: farthest.padDistanceKm,
            avgTravelDays: farthest.padAvgTravelDays,
            source: farthest.padSource,
          },
          departureAt,
          expectedReturn,
        },
      };
    });

    res.json(withForecast);
  });

  /**
   * Painel para Definir Placas:
   * - available: livres (retorno já liberou / DISPONIVEL)
   * - unavailable: não podem carregar na data do roteiro (em viagem, bloqueado, manutenção…)
   *   + justificativa/previsão se o operador já informou
   */
  router.get('/:id/plates-board', authorize(Role.ADMIN, Role.OPERACAO), async (req, res) => {
    const route = await prisma.route.findUnique({
      where: { id: paramId(req) },
      include: {
        ...routeDealershipInclude,
        dealership: true,
      },
    });
    if (!route) return res.status(404).json({ error: 'Roteiro não encontrado' });

    const loadAt = routeDepartureAt(route.date);

    const linked: DealershipRow[] =
      route.dealerships.length > 0
        ? route.dealerships.map((rd) => rd.dealership)
        : route.dealership
          ? [route.dealership]
          : [];

    let returnForecast = null;
    if (linked.length > 0) {
      const farthest = farthestDealershipFromPad(linked);
      const expectedReturn = expectedReturnDate(loadAt, farthest.padAvgTravelDays);
      returnForecast = {
        basis: 'PAD_DISTANCE' as const,
        pad: { lat: PAD_LAT, lng: PAD_LNG },
        formula: '(distanceKm * 2) / 400',
        farthestDealership: {
          id: farthest.id,
          name: farthest.name,
          city: farthest.city,
          distanceKm: farthest.padDistanceKm,
          avgTravelDays: farthest.padAvgTravelDays,
          source: farthest.padSource,
        },
        departureAt: loadAt,
        expectedReturn,
      };
    }

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
          // Já deveria estar livre para carregar nesta data (previsão de retorno <= 06:00 do roteiro)
          shouldBeAvailable: !!(open && open.expectedReturn <= loadAt) ||
            v.status === VehicleStatus.BLOQUEADO ||
            v.status === VehicleStatus.EM_MANUTENCAO,
          needsJustification: !report,
        });
      }
    }

    const criticalPending = unavailable.filter(
      (u) => (u as { shouldBeAvailable?: boolean }).shouldBeAvailable && !u.report,
    ).length;

    res.json({
      routeId: route.id,
      routeName: route.name,
      loadAt,
      plannedVehicleCount: route.plannedVehicleCount,
      assignedCount: await prisma.routeVehicle.count({ where: { routeId: route.id } }),
      hasPriority: route.hasPriority,
      priorityExpiryDate: route.priorityExpiryDate,
      priorityNotes: route.priorityNotes,
      route: {
        id: route.id,
        name: route.name,
        date: route.date,
        hasPriority: route.hasPriority,
        priorityExpiryDate: route.priorityExpiryDate,
        priorityNotes: route.priorityNotes,
      },
      returnForecast,
      available,
      unavailable,
      summary: {
        available: available.length,
        unavailable: unavailable.length,
        criticalPendingJustifications: criticalPending,
        justified: unavailable.filter((u) => !!u.report).length,
      },
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

    const linked: DealershipRow[] =
      route.dealerships.length > 0
        ? route.dealerships.map((rd) => rd.dealership)
        : route.dealership
          ? [route.dealership]
          : [];

    let returnForecast = null;
    if (linked.length > 0) {
      const farthest = farthestDealershipFromPad(linked);
      const departureAt = routeDepartureAt(route.date);
      const expectedReturn = expectedReturnDate(departureAt, farthest.padAvgTravelDays);
      returnForecast = {
        basis: 'PAD_DISTANCE' as const,
        pad: { lat: PAD_LAT, lng: PAD_LNG },
        formula: '(distanceKm * 2) / 400',
        farthestDealership: {
          id: farthest.id,
          name: farthest.name,
          city: farthest.city,
          distanceKm: farthest.padDistanceKm,
          avgTravelDays: farthest.padAvgTravelDays,
          source: farthest.padSource,
        },
        stops: linked.map((d) => {
          const t = withPadTravel(d);
          return {
            id: t.id,
            name: t.name,
            city: t.city,
            distanceKm: t.padDistanceKm,
            avgTravelDays: t.padAvgTravelDays,
            source: t.padSource,
          };
        }),
        departureAt,
        expectedReturn,
      };
    }

    res.json({ ...route, returnForecast });
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
    if (hasPriority && !parsed.data.priorityExpiryDate) {
      return res.status(400).json({
        error: 'Informe a menor data de vencimento para roteiro prioritário',
      });
    }

    const joinedRegions = [...new Set(ordered.map((d) => d.region))].join(' / ');
    const region = parsed.data.region ?? (joinedRegions || ordered[0]?.region);

    // Admin monta o roteiro; só vai à Operação após "Disponibilizar"
    const route = await prisma.route.create({
      data: {
        name: parsed.data.name.trim(),
        // Persist as noon UTC so calendar day is stable in BR/US timezones
        date: new Date(`${parsed.data.date.slice(0, 10)}T12:00:00.000Z`),
        dealershipId: ordered[0]?.id,
        region,
        notes: parsed.data.notes?.trim() || null,
        hasPriority,
        priorityNotes: hasPriority ? parsed.data.priorityNotes?.trim() || null : null,
        priorityExpiryDate:
          hasPriority && parsed.data.priorityExpiryDate
            ? new Date(`${parsed.data.priorityExpiryDate.slice(0, 10)}T12:00:00.000Z`)
            : null,
        plannedVehicleCount: 1,
        status: RouteStatus.RASCUNHO,
        readyForOperation: false,
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
    io.emit('planning:changed', { action: 'route-create', id: route.id });
    res.status(201).json(route);
  });

  /** Handoff: rascunho → operação (atalho; preferir /planning/routes/:id/send) */
  router.post('/:id/send-to-operation', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
    const routeId = paramId(req);
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: { dealerships: true },
    });
    if (!route) return res.status(404).json({ error: 'Roteiro não encontrado' });
    if (route.status !== RouteStatus.RASCUNHO) {
      return res.status(400).json({ error: 'Só rascunhos podem ser enviados para a operação' });
    }
    if (route.dealerships.length === 0) {
      return res.status(400).json({ error: 'Roteiro sem concessionárias' });
    }
    if (route.hasPriority && !route.priorityExpiryDate) {
      return res.status(400).json({
        error:
          'Roteiro prioritário sem menor data de vencimento. Edite o roteiro e informe o vencimento antes de disponibilizar.',
      });
    }
    if (!route.plannedVehicleCount || route.plannedVehicleCount < 1) {
      // 1 placa por rota
    }

    const updated = await prisma.route.update({
      where: { id: routeId },
      data: {
        status: RouteStatus.AGUARDANDO_PLACAS,
        readyForOperation: true,
        plannedVehicleCount: 1,
        sentToOperationAt: new Date(),
        sentToOperationById: req.user!.id,
      },
      include: {
        ...routeDealershipInclude,
        dealership: true,
        vehicles: { include: { vehicle: true } },
      },
    });

    await audit('SEND_TO_OPERATION', 'Route', {
      userId: req.user!.id,
      entityId: routeId,
      details: `${route.name} · 1 placa`,
    });
    io.emit('routes:changed', { action: 'send', id: routeId });
    io.emit('planning:changed', { action: 'send', id: routeId });
    res.json(updated);
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

    const { dealershipIds, date, priorityExpiryDate, ...rest } = parsed.data;
    const data: Record<string, unknown> = { ...rest };
    if (date) data.date = new Date(`${date.slice(0, 10)}T12:00:00.000Z`);
    if (rest.hasPriority === false) {
      data.priorityNotes = null;
      data.priorityExpiryDate = null;
    }
    if (rest.hasPriority === true && priorityExpiryDate === undefined && !existing.priorityExpiryDate) {
      return res.status(400).json({
        error: 'Informe a menor data de vencimento para roteiro prioritário',
      });
    }
    if (priorityExpiryDate !== undefined) {
      data.priorityExpiryDate = priorityExpiryDate
        ? new Date(`${priorityExpiryDate.slice(0, 10)}T12:00:00.000Z`)
        : null;
    }
    if (rest.hasPriority === true && priorityExpiryDate === null) {
      return res.status(400).json({
        error: 'Informe a menor data de vencimento para roteiro prioritário',
      });
    }
    if (typeof rest.name === 'string') data.name = rest.name.trim();
    if (rest.notes !== undefined) data.notes = rest.notes?.trim() || null;
    if (rest.plannedVehicleCount !== undefined) {
      data.plannedVehicleCount = rest.plannedVehicleCount;
    }

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

  /** Assign plates to route (operação) — 1 placa por rota */
  router.post('/:id/assign-plates', authorize(Role.ADMIN, Role.OPERACAO), async (req: AuthRequest, res) => {
    const { vehicleIds, vehicleId, driverId, driverName, drivers } = req.body as {
      vehicleIds?: string[];
      vehicleId?: string;
      driverId?: string;
      driverName?: string;
      drivers?: Record<string, string>;
    };

    // Aceita vehicleId único ou vehicleIds[0] — regra: exatamente 1 placa por rota
    const rawIds = vehicleId
      ? [vehicleId]
      : Array.isArray(vehicleIds)
        ? vehicleIds
        : [];
    const uniqueVehicleIds = [...new Set(rawIds.filter(Boolean))];
    if (uniqueVehicleIds.length === 0) {
      return res.status(400).json({ error: 'Selecione a placa do veículo' });
    }
    if (uniqueVehicleIds.length > 1) {
      return res.status(400).json({ error: 'Esta rota aceita apenas 1 placa' });
    }

    let resolvedDriverName: string | null = null;
    if (driverId) {
      const driver = await prisma.driver.findUnique({ where: { id: driverId } });
      if (!driver || !driver.active) {
        return res.status(400).json({ error: 'Selecione um motorista cadastrado e ativo' });
      }
      resolvedDriverName = driver.name;
    } else {
      const freeText =
        drivers?.[uniqueVehicleIds[0]]?.trim() || driverName?.trim() || '';
      if (freeText) {
        const byName = await prisma.driver.findFirst({
          where: { name: { equals: freeText }, active: true },
        });
        if (!byName) {
          return res.status(400).json({
            error: 'Motorista deve ser cadastrado. Cadastre em Motoristas ou escolha da lista.',
          });
        }
        resolvedDriverName = byName.name;
      }
    }
    if (!resolvedDriverName) {
      return res.status(400).json({ error: 'Selecione o motorista da viagem' });
    }

    const route = await prisma.route.findUnique({
      where: { id: paramId(req) },
      include: {
        ...routeDealershipInclude,
        dealership: true,
        vehicles: true,
        trips: { where: { status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] } } },
      },
    });
    if (!route) return res.status(404).json({ error: 'Roteiro não encontrado' });
    if (route.status !== RouteStatus.AGUARDANDO_PLACAS) {
      return res.status(400).json({
        error: 'Só rotas enviadas pelo Admin (aguardando placas) podem receber veículo',
      });
    }
    if (route.vehicles.length > 0 || route.trips.length > 0) {
      return res.status(400).json({ error: 'Esta rota já tem placa definida' });
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

    // Previsão SEMPRE pelo PAD (coordenadas) × concessionária mais distante
    const farthest = farthestDealershipFromPad(linked);
    const destNames = linked.map((d) => d.name).join(', ');
    // Saída = data do roteiro às 06:00 (regra operacional)
    const departureAt = routeDepartureAt(route.date);
    const expectedReturn = expectedReturnDate(departureAt, farthest.padAvgTravelDays);

    try {
      const results = await prisma.$transaction(async (tx) => {
        const trips = [];

        for (const vid of uniqueVehicleIds) {
          const vehicle = await tx.vehicle.findUnique({ where: { id: vid } });
          if (!vehicle) {
            throw Object.assign(new Error(`Veículo ${vid} não encontrado`), { status: 404 });
          }

          // Atomic claim: only succeed if still DISPONIVEL
          const claimed = await tx.vehicle.updateMany({
            where: { id: vid, status: VehicleStatus.DISPONIVEL },
            data: { status: VehicleStatus.EM_VIAGEM },
          });
          if (claimed.count !== 1) {
            throw Object.assign(new Error(`Placa ${vehicle.plate} não está disponível`), {
              status: 400,
            });
          }

          const openTrip = await tx.trip.findFirst({
            where: { vehicleId: vid, status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] } },
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

          const resolvedDriver = resolvedDriverName;

          await tx.routeVehicle.upsert({
            where: {
              routeId_vehicleId: { routeId: route.id, vehicleId: vid },
            },
            create: { routeId: route.id, vehicleId: vid },
            update: { assignedAt: new Date() },
          });

          const t = await tx.trip.create({
            data: {
              vehicleId: vid,
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
              vehicleId: vid,
              userId: req.user!.id,
              tripId: t.id,
              action: 'SAIDA',
              fromStatus: VehicleStatus.DISPONIVEL,
              toStatus: VehicleStatus.EM_VIAGEM,
              details: `Roteiro ${route.name} → ${destNames} (retorno: ${farthest.name}, ${farthest.padDistanceKm} km do PAD, ${farthest.padAvgTravelDays} dias)`,
            },
          });

          trips.push(t);
        }

        await tx.route.update({
          where: { id: route.id },
          data: {
            status: RouteStatus.EM_ANDAMENTO,
            plannedVehicleCount: 1,
          },
        });

        return trips;
      });

      await audit('ASSIGN_PLATES', 'Route', {
        userId: req.user!.id,
        entityId: route.id,
        details: `1 placa · retorno PAD→${farthest.name} (${farthest.padDistanceKm} km / ${farthest.padAvgTravelDays} dias)`,
      });
      io.emit('fleet:changed', { action: 'assign', routeId: route.id });
      io.emit('trips:changed', { action: 'create' });
      io.emit('routes:changed', { action: 'assign', id: route.id });
      res.status(201).json({
        trips: results,
        returnForecast: {
          basis: 'PAD_DISTANCE',
          pad: { lat: PAD_LAT, lng: PAD_LNG },
          farthestDealership: {
            id: farthest.id,
            name: farthest.name,
            city: farthest.city,
            distanceKm: farthest.padDistanceKm,
            avgTravelDays: farthest.padAvgTravelDays,
            source: farthest.padSource,
          },
          departureAt,
          expectedReturn,
        },
      });
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
