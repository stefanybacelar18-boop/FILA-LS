import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { normalizePlate, plateOwner } from '../data/operatorVisibility';
import { TripStatus, RouteStatus } from '../types/enums';

const router = Router();

const bodySchema = z.object({
  plate: z.string().min(5).max(12),
  pin: z.string().min(4).max(32),
});

/** Dia de calendário em Bahia/Brasil (YYYY-MM-DD). */
function brazilYmd(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bahia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function pinOk(provided: string, expected: string): boolean {
  const a = Buffer.from(provided.normalize('NFKC'));
  const b = Buffer.from(expected.normalize('NFKC'));
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Rate limit simples por IP (consulta pública). */
const attempts = new Map<string, { n: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const row = attempts.get(ip);
  if (!row || now > row.resetAt) {
    attempts.set(ip, { n: 1, resetAt: now + 15 * 60_000 });
    return false;
  }
  row.n += 1;
  return row.n > 30;
}

/**
 * Consulta pública — motorista LSL vê o roteiro de amanhã.
 * POST { plate, pin }
 */
router.post('/meu-roteiro', async (req, res) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Informe a placa e a senha.' });
  }

  const expectedPin = (process.env.LSL_DRIVER_PIN || 'lsl2026').trim();
  if (!pinOk(parsed.data.pin.trim(), expectedPin)) {
    return res.status(403).json({ error: 'Senha incorreta.' });
  }

  const plateNorm = normalizePlate(parsed.data.plate);
  if (!plateNorm) {
    return res.status(400).json({ error: 'Placa inválida.' });
  }

  const vehicles = await prisma.vehicle.findMany({ select: { id: true, plate: true } });
  const vehicle = vehicles.find((v) => normalizePlate(v.plate) === plateNorm);
  if (!vehicle) {
    return res.status(404).json({ error: 'Placa não encontrada.' });
  }
  if (plateOwner(vehicle.plate) !== 'LSL') {
    return res.status(403).json({ error: 'Esta consulta é só para placas da frota LSL.' });
  }

  const tomorrow = addDaysYmd(brazilYmd(), 1);
  const dayAfter = addDaysYmd(tomorrow, 1);
  const from = new Date(`${tomorrow}T00:00:00.000Z`);
  const to = new Date(`${dayAfter}T00:00:00.000Z`);

  const route = await prisma.route.findFirst({
    where: {
      date: { gte: from, lt: to },
      status: { not: RouteStatus.CANCELADO },
      vehicles: { some: { vehicleId: vehicle.id } },
    },
    include: {
      dealerships: {
        orderBy: { order: 'asc' },
        include: { dealership: { select: { name: true, city: true, state: true } } },
      },
      dealership: { select: { name: true, city: true, state: true } },
      vehicles: { include: { vehicle: { select: { plate: true } } } },
      trips: {
        where: {
          vehicleId: vehicle.id,
          status: {
            in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO, TripStatus.RETORNOU],
          },
        },
        orderBy: { departureAt: 'desc' },
        take: 1,
        select: {
          driverName: true,
          departureAt: true,
          expectedReturn: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!route) {
    return res.json({
      found: false,
      plate: vehicle.plate,
      routeDate: tomorrow,
      message: 'Nenhum roteiro encontrado para amanhã nesta placa.',
    });
  }

  const stops =
    route.dealerships.length > 0
      ? route.dealerships.map((rd) => ({
          name: rd.dealership.name,
          city: rd.dealership.city,
          state: rd.dealership.state,
        }))
      : route.dealership
        ? [
            {
              name: route.dealership.name,
              city: route.dealership.city,
              state: route.dealership.state,
            },
          ]
        : [];

  const trip = route.trips[0] ?? null;
  const expectedReturnAt = trip?.expectedReturn ?? null;

  return res.json({
    found: true,
    plate: vehicle.plate,
    fleet: 'LSL',
    routeName: route.name,
    routeDate: tomorrow,
    departureAt: '06:00',
    expectedReturnAt,
    driverName: trip?.driverName ?? null,
    hasPriority: route.hasPriority,
    priorityExpiryDate: route.priorityExpiryDate
      ? String(route.priorityExpiryDate).slice(0, 10)
      : null,
    status: route.status,
    tripStatus: trip?.status ?? null,
    destinations: stops,
  });
});

export default router;
