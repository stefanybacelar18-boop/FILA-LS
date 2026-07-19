import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { Role, RouteStatus, TripStatus, VehicleStatus } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { audit } from '../services/audit';
import { isOverdue } from '../utils/status';
import { addDays, startOfDay } from 'date-fns';
import type { Server } from 'socket.io';
import { paramId } from '../utils/params';

function normalizeCity(city: string): string {
  return city.trim().replace(/\s+/g, ' ');
}

function suggestRouteName(cities: string[], date: Date): string {
  const day = date.toISOString().slice(0, 10);
  if (cities.length === 0) return `Roteiro ${day}`;
  if (cities.length === 1) return `${cities[0]} · ${day}`;
  if (cities.length === 2) return `${cities[0]} + ${cities[1]} · ${day}`;
  return `${cities[0]} +${cities.length - 1} · ${day}`;
}

async function matchDealership(city: string, state?: string | null) {
  const key = normalizeCity(city).toLowerCase();
  const dealers = await prisma.dealership.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
  });
  const matches = dealers.filter((d) => {
    const sameCity = d.city.trim().toLowerCase() === key;
    if (!sameCity) return false;
    if (state && d.state && d.state.toLowerCase() !== state.toLowerCase()) return false;
    return true;
  });
  return matches[0] ?? null;
}

const routeInclude = {
  dealerships: {
    include: { dealership: true },
    orderBy: { order: 'asc' as const },
  },
  dealership: true,
  vehicles: { include: { vehicle: true } },
  planningCities: true,
  createdBy: { select: { id: true, name: true } },
  sentToOperationBy: { select: { id: true, name: true } },
};

function coverageOf(route: { plannedVehicleCount: number | null; vehicles: unknown[] }) {
  const planned = route.plannedVehicleCount;
  const assigned = route.vehicles.length;
  if (!planned || planned <= 0) {
    return { planned: planned ?? null, assigned, missing: null, excess: null, coverage: null };
  }
  const coverage = Math.min(100, Math.round((assigned / planned) * 100));
  const missing = Math.max(0, planned - assigned);
  const excess = Math.max(0, assigned - planned);
  return { planned, assigned, missing, excess, coverage };
}

export function createPlanningRouter(io: Server) {
  const router = Router();
  router.use(authenticate);

  /** Mesa de Roteirização — 3 colunas */
  router.get('/board', authorize(Role.ADMIN, Role.CONSULTA), async (_req, res) => {
    const today = startOfDay(new Date());
    const [pending, drafting, readyRows] = await Promise.all([
      prisma.planningCity.findMany({
        where: { status: 'PENDENTE' },
        include: { dealership: true },
        orderBy: [{ noteCount: 'desc' }, { city: 'asc' }],
      }),
      prisma.route.findMany({
        where: { status: RouteStatus.RASCUNHO, readyForOperation: false },
        include: routeInclude,
        orderBy: [{ hasPriority: 'desc' }, { date: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.route.findMany({
        where: {
          OR: [
            { status: RouteStatus.RASCUNHO, readyForOperation: true },
            {
              status: RouteStatus.AGUARDANDO_PLACAS,
              date: { gte: today },
            },
          ],
        },
        include: routeInclude,
        orderBy: [{ hasPriority: 'desc' }, { date: 'asc' }],
      }),
    ]);

    const mapRoute = (r: (typeof drafting)[0]) => ({
      ...r,
      ...coverageOf(r),
      cityCount: r.dealerships.length || (r.dealership ? 1 : 0),
      noteCount: r.planningCities.reduce((s, c) => s + c.noteCount, 0),
      suggestedName: suggestRouteName(
        r.dealerships.map((d) => d.dealership.city),
        r.date,
      ),
    });

    const draftingMapped = drafting.map(mapRoute);
    const readyRoutes = readyRows.map(mapRoute);

    // Agrupa pendentes por cidade (reforça soma se houver duplicatas)
    const pendingGrouped = new Map<string, (typeof pending)[0] & { ids: string[] }>();
    for (const row of pending) {
      const key = `${normalizeCity(row.city).toLowerCase()}|${(row.state || '').toLowerCase()}`;
      const existing = pendingGrouped.get(key);
      if (!existing) {
        pendingGrouped.set(key, { ...row, ids: [row.id] });
      } else {
        existing.noteCount += row.noteCount;
        existing.ids.push(row.id);
      }
    }

    res.json({
      pending: [...pendingGrouped.values()].sort((a, b) => b.noteCount - a.noteCount),
      drafting: draftingMapped,
      ready: readyRoutes,
      summary: {
        pendingCities: pendingGrouped.size,
        pendingNotes: [...pendingGrouped.values()].reduce((s, c) => s + c.noteCount, 0),
        draftingRoutes: draftingMapped.length,
        readyRoutes: readyRoutes.length,
      },
    });
  });

  /** Adiciona cidade/notas manualmente (agrupa se já existir pendente) */
  router.post('/cities', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
    const schema = z.object({
      city: z.string().min(2),
      state: z.string().optional().nullable(),
      noteCount: z.number().int().positive().default(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Informe a cidade e a quantidade de notas' });

    const city = normalizeCity(parsed.data.city);
    const state = parsed.data.state?.trim() || null;
    const dealer = await matchDealership(city, state);

    const existing = await prisma.planningCity.findFirst({
      where: {
        status: 'PENDENTE',
        city: { equals: city },
        ...(state ? { state } : {}),
        routeId: null,
      },
    });

    let row;
    if (existing) {
      row = await prisma.planningCity.update({
        where: { id: existing.id },
        data: {
          noteCount: existing.noteCount + parsed.data.noteCount,
          dealershipId: existing.dealershipId ?? dealer?.id ?? null,
          state: existing.state ?? state ?? dealer?.state ?? null,
        },
        include: { dealership: true },
      });
    } else {
      row = await prisma.planningCity.create({
        data: {
          city,
          state: state ?? dealer?.state ?? null,
          noteCount: parsed.data.noteCount,
          dealershipId: dealer?.id ?? null,
          source: 'MANUAL',
          status: 'PENDENTE',
        },
        include: { dealership: true },
      });
    }

    await audit('PLANNING_CITY_ADD', 'PlanningCity', {
      userId: req.user!.id,
      entityId: row.id,
      details: `${city} (+${parsed.data.noteCount})`,
    });
    io.emit('planning:changed', { action: 'city-add' });
    res.status(201).json(row);
  });

  /** Demo: carrega cidades a partir das concessionárias cadastradas */
  router.post('/cities/demo', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
    const dealers = await prisma.dealership.findMany({
      where: { active: true },
      orderBy: { city: 'asc' },
    });
    const byCity = new Map<string, { city: string; state: string; dealershipId: string; count: number }>();
    for (const d of dealers) {
      const key = d.city.trim().toLowerCase();
      const cur = byCity.get(key);
      if (!cur) {
        byCity.set(key, {
          city: d.city.trim(),
          state: d.state,
          dealershipId: d.id,
          count: 3 + Math.floor(Math.random() * 16),
        });
      } else {
        cur.count += 2 + Math.floor(Math.random() * 6);
      }
    }

    // Limpa só demos pendentes anteriores
    await prisma.planningCity.deleteMany({ where: { status: 'PENDENTE', source: 'DEMO' } });

    const created = [];
    for (const item of [...byCity.values()].slice(0, 18)) {
      const row = await prisma.planningCity.create({
        data: {
          city: item.city,
          state: item.state,
          noteCount: item.count,
          dealershipId: item.dealershipId,
          source: 'DEMO',
          status: 'PENDENTE',
        },
      });
      created.push(row);
    }

    await audit('PLANNING_DEMO', 'PlanningCity', {
      userId: req.user!.id,
      details: `${created.length} cidades demo`,
    });
    io.emit('planning:changed', { action: 'demo' });
    res.status(201).json({ created: created.length, cities: created });
  });

  /** Cria rota em montagem (RASCUNHO) a partir de cidades da mesa */
  router.post('/routes', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
    const schema = z.object({
      planningCityIds: z.array(z.string()).min(1),
      date: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida'),
      name: z.string().optional(),
      hasPriority: z.boolean().optional(),
      priorityNotes: z.string().optional().nullable(),
      plannedVehicleCount: z.number().int().positive().optional().nullable(),
      notes: z.string().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos para montar a rota' });

    const cities = await prisma.planningCity.findMany({
      where: { id: { in: parsed.data.planningCityIds }, status: 'PENDENTE' },
      include: { dealership: true },
    });
    if (cities.length === 0) {
      return res.status(400).json({ error: 'Nenhuma cidade pendente selecionada' });
    }

    const date = new Date(parsed.data.date);
    const cityNames = cities.map((c) => c.city);
    const name = parsed.data.name?.trim() || suggestRouteName(cityNames, date);

    // Resolve dealerships: prefer linked, else match by city
    const dealerIds: string[] = [];
    for (const c of cities) {
      let dealerId = c.dealershipId;
      if (!dealerId) {
        const m = await matchDealership(c.city, c.state);
        dealerId = m?.id ?? null;
      }
      if (dealerId && !dealerIds.includes(dealerId)) dealerIds.push(dealerId);
    }
    if (dealerIds.length === 0) {
      return res.status(400).json({
        error:
          'Nenhuma concessionária encontrada para as cidades. Cadastre a concessionária ou vincule a cidade.',
      });
    }

    const dealers = await prisma.dealership.findMany({ where: { id: { in: dealerIds } } });
    const ordered = dealerIds.map((id) => dealers.find((d) => d.id === id)!);
    const region = [...new Set(ordered.map((d) => d.region))].join(' / ');

    const route = await prisma.$transaction(async (tx) => {
      const r = await tx.route.create({
        data: {
          name,
          date,
          dealershipId: ordered[0].id,
          region,
          notes: parsed.data.notes?.trim() || null,
          hasPriority: !!parsed.data.hasPriority,
          priorityNotes: parsed.data.hasPriority ? parsed.data.priorityNotes?.trim() || null : null,
          plannedVehicleCount: 1,
          status: RouteStatus.RASCUNHO,
          readyForOperation: false,
          createdById: req.user!.id,
          dealerships: {
            create: ordered.map((d, order) => ({ dealershipId: d.id, order })),
          },
        },
        include: routeInclude,
      });

      await tx.planningCity.updateMany({
        where: { id: { in: cities.map((c) => c.id) } },
        data: { status: 'EM_ROTA', routeId: r.id },
      });

      return tx.route.findUnique({ where: { id: r.id }, include: routeInclude });
    });

    await audit('PLANNING_ROUTE_CREATE', 'Route', {
      userId: req.user!.id,
      entityId: route!.id,
      details: name,
    });
    io.emit('planning:changed', { action: 'route-create', id: route!.id });
    io.emit('routes:changed', { action: 'create', id: route!.id });
    res.status(201).json(route);
  });

  /** Adiciona cidade pendente a uma rota em montagem */
  router.post('/routes/:id/add-city', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
    const schema = z.object({ planningCityId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Informe a cidade' });

    const routeId = paramId(req);
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: { dealerships: true },
    });
    if (!route) return res.status(404).json({ error: 'Roteiro não encontrado' });
    if (route.status !== RouteStatus.RASCUNHO) {
      return res.status(400).json({ error: 'Só é possível alterar rotas em montagem' });
    }

    const city = await prisma.planningCity.findUnique({ where: { id: parsed.data.planningCityId } });
    if (!city || city.status !== 'PENDENTE') {
      return res.status(400).json({ error: 'Cidade não está pendente' });
    }

    let dealerId = city.dealershipId;
    if (!dealerId) {
      const m = await matchDealership(city.city, city.state);
      dealerId = m?.id ?? null;
    }
    if (!dealerId) {
      return res.status(400).json({ error: `Sem concessionária para ${city.city}` });
    }

    const order = route.dealerships.length;
    const updated = await prisma.$transaction(async (tx) => {
      const exists = await tx.routeDealership.findUnique({
        where: { routeId_dealershipId: { routeId, dealershipId: dealerId! } },
      });
      if (!exists) {
        await tx.routeDealership.create({
          data: { routeId, dealershipId: dealerId!, order },
        });
      }
      if (!route.dealershipId) {
        await tx.route.update({ where: { id: routeId }, data: { dealershipId: dealerId! } });
      }
      await tx.planningCity.update({
        where: { id: city.id },
        data: { status: 'EM_ROTA', routeId, dealershipId: dealerId },
      });

      // Auto-renomeia se ainda parece nome sugerido genérico
      const cities = await tx.planningCity.findMany({ where: { routeId } });
      const names = cities.map((c) => c.city);
      const suggested = suggestRouteName(names, route.date);
      await tx.route.update({
        where: { id: routeId },
        data: {
          name: route.name.startsWith('Roteiro ') || route.name.includes(' · ')
            ? suggested
            : route.name,
          region: [...new Set(names)].join(' / '),
        },
      });

      return tx.route.findUnique({ where: { id: routeId }, include: routeInclude });
    });

    io.emit('planning:changed', { action: 'add-city', id: routeId });
    io.emit('routes:changed', { action: 'update', id: routeId });
    res.json(updated);
  });

  /** Remove cidade da rota → volta para pendentes */
  router.post('/routes/:id/remove-city', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
    const schema = z.object({ planningCityId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Informe a cidade' });

    const routeId = paramId(req);
    const route = await prisma.route.findUnique({ where: { id: routeId } });
    if (!route || route.status !== RouteStatus.RASCUNHO) {
      return res.status(400).json({ error: 'Roteiro inválido para edição' });
    }

    const city = await prisma.planningCity.findFirst({
      where: { id: parsed.data.planningCityId, routeId },
    });
    if (!city) return res.status(404).json({ error: 'Cidade não está nesta rota' });

    await prisma.$transaction(async (tx) => {
      await tx.planningCity.update({
        where: { id: city.id },
        data: { status: 'PENDENTE', routeId: null },
      });
      if (city.dealershipId) {
        const still = await tx.planningCity.count({
          where: { routeId, dealershipId: city.dealershipId },
        });
        if (still === 0) {
          await tx.routeDealership.deleteMany({
            where: { routeId, dealershipId: city.dealershipId },
          });
        }
      }
      const remaining = await tx.planningCity.findMany({ where: { routeId } });
      if (remaining.length === 0) {
        await tx.route.update({
          where: { id: routeId },
          data: { name: suggestRouteName([], route.date), dealershipId: null },
        });
      } else {
        await tx.route.update({
          where: { id: routeId },
          data: { name: suggestRouteName(remaining.map((c) => c.city), route.date) },
        });
      }
    });

    const updated = await prisma.route.findUnique({ where: { id: routeId }, include: routeInclude });
    io.emit('planning:changed', { action: 'remove-city', id: routeId });
    res.json(updated);
  });

  /** Atualiza meta / prioridade / obs da rota em montagem */
  router.patch('/routes/:id', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
    const schema = z.object({
      name: z.string().min(2).optional(),
      date: z.string().optional(),
      hasPriority: z.boolean().optional(),
      priorityNotes: z.string().optional().nullable(),
      plannedVehicleCount: z.number().int().positive().optional().nullable(),
      notes: z.string().optional().nullable(),
      readyForOperation: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });

    const routeId = paramId(req);
    const route = await prisma.route.findUnique({ where: { id: routeId } });
    if (!route) return res.status(404).json({ error: 'Roteiro não encontrado' });
    if (route.status !== RouteStatus.RASCUNHO && route.status !== RouteStatus.AGUARDANDO_PLACAS) {
      return res.status(400).json({ error: 'Roteiro não pode ser editado neste status' });
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.name) data.name = parsed.data.name.trim();
    if (parsed.data.date) data.date = new Date(parsed.data.date);
    if (parsed.data.hasPriority !== undefined) {
      data.hasPriority = parsed.data.hasPriority;
      if (!parsed.data.hasPriority) data.priorityNotes = null;
    }
    if (parsed.data.priorityNotes !== undefined) data.priorityNotes = parsed.data.priorityNotes;
    if (parsed.data.plannedVehicleCount !== undefined) {
      data.plannedVehicleCount = parsed.data.plannedVehicleCount;
    }
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes?.trim() || null;
    if (parsed.data.readyForOperation !== undefined && route.status === RouteStatus.RASCUNHO) {
      data.readyForOperation = parsed.data.readyForOperation;
    }

    const updated = await prisma.route.update({
      where: { id: routeId },
      data,
      include: routeInclude,
    });
    io.emit('planning:changed', { action: 'update', id: routeId });
    io.emit('routes:changed', { action: 'update', id: routeId });
    res.json(updated);
  });

  /** Enviar para Operação — handoff do papel */
  router.post('/routes/:id/send', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
    const routeId = paramId(req);
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: { dealerships: true, planningCities: true },
    });
    if (!route) return res.status(404).json({ error: 'Roteiro não encontrado' });
    if (route.status !== RouteStatus.RASCUNHO) {
      return res.status(400).json({ error: 'Só rascunhos podem ser enviados para a operação' });
    }
    if (route.dealerships.length === 0) {
      return res.status(400).json({ error: 'Roteiro sem cidades/concessionárias' });
    }
    if (!route.plannedVehicleCount || route.plannedVehicleCount < 1) {
      // Regra operacional: 1 placa por rota
      await prisma.route.update({
        where: { id: routeId },
        data: { plannedVehicleCount: 1 },
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.planningCity.updateMany({
        where: { routeId },
        data: { status: 'ENVIADA' },
      });
      return tx.route.update({
        where: { id: routeId },
        data: {
          status: RouteStatus.AGUARDANDO_PLACAS,
          readyForOperation: true,
          plannedVehicleCount: 1,
          sentToOperationAt: new Date(),
          sentToOperationById: req.user!.id,
        },
        include: routeInclude,
      });
    });

    await audit('SEND_TO_OPERATION', 'Route', {
      userId: req.user!.id,
      entityId: routeId,
      details: `${route.name} · 1 placa`,
    });
    io.emit('planning:changed', { action: 'send', id: routeId });
    io.emit('routes:changed', { action: 'send', id: routeId });
    res.json(updated);
  });

  /** Meu Dia — planejador */
  router.get('/my-day', authorize(Role.ADMIN, Role.CONSULTA), async (_req, res) => {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);

    const [createdToday, awaiting, complete, drafting, lastRoute] = await Promise.all([
      prisma.route.findMany({
        where: { createdAt: { gte: today, lt: tomorrow } },
        include: routeInclude,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.route.findMany({
        where: { status: RouteStatus.AGUARDANDO_PLACAS },
        include: routeInclude,
        orderBy: [{ hasPriority: 'desc' }, { date: 'asc' }],
      }),
      prisma.route.findMany({
        where: {
          status: { in: [RouteStatus.EM_ANDAMENTO, RouteStatus.CONCLUIDO] },
          date: { gte: today, lt: tomorrow },
        },
        include: routeInclude,
      }),
      prisma.route.count({ where: { status: RouteStatus.RASCUNHO } }),
      prisma.route.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true, name: true },
      }),
    ]);

    res.json({
      createdToday: createdToday.map((r) => ({ ...r, ...coverageOf(r) })),
      awaitingPlates: awaiting.map((r) => ({ ...r, ...coverageOf(r) })),
      completeToday: complete.map((r) => ({ ...r, ...coverageOf(r) })),
      draftingCount: drafting,
      lastUpdate: lastRoute?.updatedAt ?? null,
      lastUpdateLabel: lastRoute?.name ?? null,
    });
  });

  /** Central de Alertas */
  router.get('/alerts', async (_req, res) => {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const dayAfter = addDays(today, 2);

    const [semPlacas, prioritarias, openTrips, bloqueados] = await Promise.all([
      prisma.route.findMany({
        where: { status: RouteStatus.AGUARDANDO_PLACAS },
        include: routeInclude,
        orderBy: [{ hasPriority: 'desc' }, { date: 'asc' }],
      }),
      prisma.route.findMany({
        where: {
          hasPriority: true,
          status: { in: [RouteStatus.RASCUNHO, RouteStatus.AGUARDANDO_PLACAS, RouteStatus.EM_ANDAMENTO] },
        },
        include: routeInclude,
      }),
      prisma.trip.findMany({
        where: { status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] } },
        include: {
          vehicle: true,
          dealership: true,
          route: { select: { id: true, name: true } },
        },
      }),
      prisma.vehicle.findMany({
        where: { status: { in: [VehicleStatus.BLOQUEADO, VehicleStatus.EM_MANUTENCAO] } },
        orderBy: { plate: 'asc' },
      }),
    ]);

    const atrasados = openTrips.filter((t) => isOverdue(t.expectedReturn, t.returnedAt));
    const retornosHoje = openTrips.filter(
      (t) => t.expectedReturn >= today && t.expectedReturn < tomorrow,
    );
    const retornosAmanha = openTrips.filter(
      (t) => t.expectedReturn >= tomorrow && t.expectedReturn < dayAfter,
    );

    // Críticas: prioritárias aguardando OU meta sem placas no dia do load
    const criticas = semPlacas.filter(
      (r) => r.hasPriority || (r.plannedVehicleCount && r.vehicles.length === 0),
    );

    res.json({
      semPlacas: semPlacas.map((r) => ({ ...r, ...coverageOf(r) })),
      criticas: criticas.map((r) => ({ ...r, ...coverageOf(r) })),
      prioritarias: prioritarias.map((r) => ({ ...r, ...coverageOf(r) })),
      atrasados,
      bloqueados,
      retornosHoje,
      retornosAmanha,
      counts: {
        semPlacas: semPlacas.length,
        criticas: criticas.length,
        atrasados: atrasados.length,
        bloqueados: bloqueados.length,
        retornosHoje: retornosHoje.length,
        retornosAmanha: retornosAmanha.length,
      },
    });
  });

  /** Central de Planejamento (dashboard Admin) */
  router.get('/overview', authorize(Role.ADMIN, Role.CONSULTA), async (_req, res) => {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);

    const routesToday = await prisma.route.findMany({
      where: {
        date: { gte: today, lt: tomorrow },
        status: { not: RouteStatus.CANCELADO },
      },
      include: routeInclude,
      orderBy: [{ hasPriority: 'desc' }, { name: 'asc' }],
    });

    const mapped = routesToday.map((r) => ({ ...r, ...coverageOf(r) }));
    const planned = mapped.reduce((s, r) => s + (r.planned ?? 0), 0);
    const assigned = mapped.reduce((s, r) => s + r.assigned, 0);
    const coverage =
      planned > 0 ? Math.min(100, Math.round((assigned / planned) * 100)) : null;

    res.json({
      date: today.toISOString(),
      routesToday: mapped,
      prioritarias: mapped.filter((r) => r.hasPriority),
      aguardandoPlacas: mapped.filter((r) => r.status === RouteStatus.AGUARDANDO_PLACAS),
      completas: mapped.filter(
        (r) =>
          r.status === RouteStatus.EM_ANDAMENTO ||
          r.status === RouteStatus.CONCLUIDO ||
          (r.planned && r.assigned >= r.planned),
      ),
      totais: {
        rotas: mapped.length,
        plannedVehicles: planned,
        assignedVehicles: assigned,
        missing: Math.max(0, planned - assigned),
        coverage,
      },
    });
  });

  /** Exportação simples: rotas do dia (ou uma rota) */
  router.get('/export', authorize(Role.ADMIN, Role.OPERACAO, Role.CONSULTA), async (req, res) => {
    const routeId = req.query.routeId ? String(req.query.routeId) : null;
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);

    const routes = await prisma.route.findMany({
      where: routeId
        ? { id: routeId }
        : {
            date: { gte: today, lt: tomorrow },
            status: { not: RouteStatus.CANCELADO },
          },
      include: {
        vehicles: { include: { vehicle: true } },
        dealerships: { include: { dealership: true } },
      },
      orderBy: { name: 'asc' },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Planejamento');
    sheet.columns = [
      { header: 'Roteiro', key: 'name', width: 28 },
      { header: 'Prioridade', key: 'priority', width: 12 },
      { header: 'Qtd. planejada', key: 'planned', width: 14 },
      { header: 'Qtd. placas', key: 'qty', width: 12 },
      { header: 'Placas', key: 'plates', width: 40 },
      { header: 'Cidades', key: 'cities', width: 36 },
      { header: 'Observações', key: 'notes', width: 40 },
      { header: 'Status', key: 'status', width: 18 },
    ];

    for (const r of routes) {
      const plates = r.vehicles.map((v) => v.vehicle.plate).join(', ');
      const cities = r.dealerships.map((d) => d.dealership.city).join(', ');
      sheet.addRow({
        name: r.name,
        priority: r.hasPriority ? 'SIM' : 'NÃO',
        planned: r.plannedVehicleCount ?? '',
        qty: r.vehicles.length,
        plates: plates || '—',
        cities,
        notes: [r.priorityNotes, r.notes].filter(Boolean).join(' | '),
        status: r.status,
      });
    }

    const buf = Buffer.from(await workbook.xlsx.writeBuffer());
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="frotatms-planejamento-${today.toISOString().slice(0, 10)}.xlsx"`,
    );
    res.send(buf);
  });

  /**
   * Importação Excel — arquitetura preparada.
   * POST /import/preview  { rows: [{ city, noteCount, state? }] } ou multipart futuro
   * POST /import/commit   { batchId }
   */
  router.post('/import/preview', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
    const schema = z.object({
      filename: z.string().optional(),
      rows: z
        .array(
          z.object({
            city: z.string().min(1),
            noteCount: z.number().int().positive().default(1),
            state: z.string().optional().nullable(),
          }),
        )
        .min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Envie rows: [{ city, noteCount, state? }]. Upload Excel completo virá na próxima etapa.',
        code: 'IMPORT_PREVIEW_JSON',
      });
    }

    // Agrupa cidades repetidas
    const grouped = new Map<string, { city: string; state: string | null; noteCount: number }>();
    for (const row of parsed.data.rows) {
      const city = normalizeCity(row.city);
      const state = row.state?.trim() || null;
      const key = `${city.toLowerCase()}|${(state || '').toLowerCase()}`;
      const cur = grouped.get(key);
      if (!cur) grouped.set(key, { city, state, noteCount: row.noteCount });
      else cur.noteCount += row.noteCount;
    }

    const preview = [];
    for (const g of grouped.values()) {
      const dealer = await matchDealership(g.city, g.state);
      preview.push({
        city: g.city,
        state: g.state ?? dealer?.state ?? null,
        noteCount: g.noteCount,
        dealershipId: dealer?.id ?? null,
        dealershipName: dealer?.name ?? null,
        matched: !!dealer,
      });
    }

    const batch = await prisma.importBatch.create({
      data: {
        filename: parsed.data.filename || 'manual-preview.json',
        status: 'PREVIEW',
        rowCount: preview.reduce((s, r) => s + r.noteCount, 0),
        previewJson: JSON.stringify(preview),
        createdById: req.user!.id,
      },
    });

    res.status(201).json({
      batchId: batch.id,
      status: batch.status,
      preview,
      unmatched: preview.filter((p) => !p.matched).length,
      message:
        'Preview pronto. Chame POST /planning/import/commit com { batchId } para lançar na mesa.',
    });
  });

  router.post('/import/commit', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
    const schema = z.object({ batchId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Informe batchId' });

    const batch = await prisma.importBatch.findUnique({ where: { id: parsed.data.batchId } });
    if (!batch || batch.status !== 'PREVIEW' || !batch.previewJson) {
      return res.status(400).json({ error: 'Lote inválido ou já processado' });
    }

    const preview = JSON.parse(batch.previewJson) as {
      city: string;
      state: string | null;
      noteCount: number;
      dealershipId: string | null;
    }[];

    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const p of preview) {
        const existing = await tx.planningCity.findFirst({
          where: {
            status: 'PENDENTE',
            city: p.city,
            routeId: null,
            ...(p.state ? { state: p.state } : {}),
          },
        });
        if (existing) {
          rows.push(
            await tx.planningCity.update({
              where: { id: existing.id },
              data: {
                noteCount: existing.noteCount + p.noteCount,
                dealershipId: existing.dealershipId ?? p.dealershipId,
                importBatchId: batch.id,
                source: 'EXCEL',
              },
            }),
          );
        } else {
          rows.push(
            await tx.planningCity.create({
              data: {
                city: p.city,
                state: p.state,
                noteCount: p.noteCount,
                dealershipId: p.dealershipId,
                importBatchId: batch.id,
                source: 'EXCEL',
                status: 'PENDENTE',
              },
            }),
          );
        }
      }
      await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: 'COMMITTED' },
      });
      return rows;
    });

    await audit('IMPORT_COMMIT', 'ImportBatch', {
      userId: req.user!.id,
      entityId: batch.id,
      details: `${created.length} cidades`,
    });
    io.emit('planning:changed', { action: 'import', batchId: batch.id });
    res.json({ committed: created.length, cities: created });
  });

  /** Sugestão de nome (utilitário UI) */
  router.post('/suggest-name', authorize(Role.ADMIN), async (req, res) => {
    const schema = z.object({
      cities: z.array(z.string()),
      date: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Informe cities' });
    const date = parsed.data.date ? new Date(parsed.data.date) : new Date();
    res.json({ name: suggestRouteName(parsed.data.cities, date) });
  });

  return router;
}
