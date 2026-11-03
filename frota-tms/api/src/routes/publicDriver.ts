import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireLslDriverPin } from '../lib/driver-pin';
import {
  DELIVERY_ORDER_WARNING,
  NO_DELIVERY_ORDER_NOTE,
  destinationsAsStored,
  manifestNumberFromRouteName,
  matchDriverByName,
  nextWorkDateKey,
  tripBelongsToDriver,
  type StoredStop,
} from '../lib/driver-route-lookup';
import { TripStatus } from '../types/enums';

const router = Router();

const bodySchema = z.object({
  driverName: z.string().trim().min(2).max(120),
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

function dateKey(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

/**
 * Consulta pública da frota LSL.
 * O motorista informa o nome cadastrado e a senha compartilhada.
 * A viagem já liga motorista (driverName), placa e roteiro. Não há tabela nova.
 * Só entram viagens desse motorista no próximo dia de trabalho.
 * POST { driverName, pin }
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
    return res.status(400).json({ error: 'Informe seu nome e a senha.' });
  }

  const expectedPin = requireLslDriverPin();
  if (!pinOk(parsed.data.pin.trim(), expectedPin)) {
    return res.status(403).json({ error: 'Senha incorreta.' });
  }

  const drivers = await prisma.driver.findMany({
    select: { id: true, name: true, active: true },
  });
  const matched = matchDriverByName(parsed.data.driverName, drivers);
  if (!matched.ok) {
    const error =
      matched.reason === 'ambiguous'
        ? 'Há mais de um motorista com esse nome. Procure a operação.'
        : 'Motorista não encontrado. Use o nome cadastrado no FrotaTMS.';
    return res.status(404).json({ error });
  }

  const workDate = nextWorkDateKey();
  const trips = await prisma.trip.findMany({
    where: {
      status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] },
      route: { date: new Date(`${workDate}T12:00:00.000Z`) },
    },
    orderBy: { departureAt: 'asc' },
    include: {
      vehicle: { select: { plate: true, owner: true } },
      route: {
        include: {
          dealerships: {
            orderBy: { order: 'asc' },
            include: {
              dealership: { select: { name: true, city: true, state: true } },
            },
          },
          dealership: { select: { name: true, city: true, state: true } },
        },
      },
    },
  });

  const routes = trips
    .filter(
      (trip) =>
        trip.route &&
        tripBelongsToDriver(
          {
            driverName: trip.driverName,
            plate: trip.vehicle.plate,
            owner: trip.vehicle.owner,
          },
          matched.driver.name,
        ),
    )
    .map((trip) => {
      const route = trip.route!;
      const stored: StoredStop[] =
        route.dealerships.length > 0
          ? route.dealerships.map((link) => ({
              order: link.order,
              name: link.dealership.name,
              city: link.dealership.city,
              state: link.dealership.state,
              motoCount: link.motoCount,
            }))
          : route.dealership
            ? [
                {
                  order: 0,
                  name: route.dealership.name,
                  city: route.dealership.city,
                  state: route.dealership.state,
                  motoCount: null,
                },
              ]
            : [];
      const destinations = destinationsAsStored(stored);
      return {
        tripId: trip.id,
        routeName: route.name,
        plate: trip.vehicle.plate,
        manifestNumber: manifestNumberFromRouteName(route.name),
        deliveryCount: destinations.length,
        routeDate: dateKey(route.date),
        departureAt: '06:00',
        expectedReturnAt: trip.expectedReturn,
        hasPriority: route.hasPriority,
        priorityExpiryDate: route.priorityExpiryDate ? dateKey(route.priorityExpiryDate) : null,
        tripStatus: trip.status,
        orderDefined: false as const,
        orderNote: NO_DELIVERY_ORDER_NOTE,
        destinations,
      };
    });

  return res.json({
    found: routes.length > 0,
    driverName: matched.driver.name,
    workDate,
    orderWarning: DELIVERY_ORDER_WARNING,
    message:
      routes.length > 0 ? null : 'Nenhum roteiro seu neste dia de trabalho.',
    routes,
  });
});

export default router;
