import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { normalizePlate, plateOwner } from '../data/operatorVisibility';
import { TripStatus } from '../types/enums';

const router = Router();

const bodySchema = z.object({
  plate: z.string().min(5).max(12),
  pin: z.string().min(4).max(32),
});

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
 * Consulta pública — motorista LSL vê o roteiro ativo da placa
 * (permanece até “Retorna” no FrotaTMS ou nova atribuição).
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

  const openTrip = await prisma.trip.findFirst({
    where: {
      vehicleId: vehicle.id,
      status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] },
    },
    orderBy: { departureAt: 'desc' },
    include: {
      route: {
        include: {
          dealerships: {
            orderBy: { order: 'asc' },
            include: { dealership: { select: { name: true, city: true, state: true } } },
          },
          dealership: { select: { name: true, city: true, state: true } },
        },
      },
    },
  });

  if (!openTrip?.route) {
    return res.json({
      found: false,
      plate: vehicle.plate,
      routeDate: null,
      message: 'Nenhum roteiro ativo nesta placa.',
    });
  }

  const route = openTrip.route;
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

  const routeDate =
    route.date instanceof Date
      ? route.date.toISOString().slice(0, 10)
      : String(route.date).slice(0, 10);

  return res.json({
    found: true,
    plate: vehicle.plate,
    fleet: 'LSL',
    routeName: route.name,
    routeDate,
    departureAt: '06:00',
    expectedReturnAt: openTrip.expectedReturn,
    driverName: openTrip.driverName ?? null,
    hasPriority: route.hasPriority,
    priorityExpiryDate: route.priorityExpiryDate
      ? String(route.priorityExpiryDate).slice(0, 10)
      : null,
    status: route.status,
    tripStatus: openTrip.status,
    tripId: openTrip.id,
    destinations: stops,
  });
});

export default router;
