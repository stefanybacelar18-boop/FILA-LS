import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { normalizePlate, plateOwner } from '../data/operatorVisibility';
import { requireLslDriverPin } from '../lib/driver-pin';
import {
  FUEL_LEVELS,
  validateChecklistComplete,
  validateSignaturePng,
  type ChecklistState,
} from '../lib/logbook-checklist';
import {
  buildPrefilledTrip,
  ensureLogbookStops,
  findOpenLslTripByPlate,
  getOrCreateLogbook,
  serializeLogbook,
  suggestedKmInitial,
} from '../lib/logbook-service';
import { LOGBOOK_CHECKLIST_ITEMS } from '../lib/logbook-checklist';
import { validateStopsForSubmit, parseStopsJson } from '../lib/logbook-report';
import { prisma } from '../lib/prisma';

const router = Router();

const authSchema = z.object({
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

const attempts = new Map<string, { n: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const row = attempts.get(ip);
  if (!row || now > row.resetAt) {
    attempts.set(ip, { n: 1, resetAt: now + 15 * 60_000 });
    return false;
  }
  row.n += 1;
  return row.n > 40;
}

function clientMeta(req: { headers: Record<string, unknown>; socket: { remoteAddress?: string | null } }) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
  const userAgent = String(req.headers['user-agent'] || '');
  return { ip, userAgent };
}

async function authenticateDriver(
  plate: string,
  pin: string,
): Promise<
  | { trip: NonNullable<Awaited<ReturnType<typeof findOpenLslTripByPlate>>> }
  | { error: string; status: number }
> {
  const expectedPin = requireLslDriverPin();
  if (!pinOk(pin.trim(), expectedPin)) {
    return { error: 'Senha incorreta.', status: 403 as const };
  }
  const plateNorm = normalizePlate(plate);
  if (!plateNorm) return { error: 'Placa inválida.', status: 400 as const };

  const trip = await findOpenLslTripByPlate(plateNorm);
  if (!trip) return { error: 'Nenhuma viagem ativa para esta placa.', status: 404 as const };
  if (plateOwner(trip.vehicle.plate) !== 'LSL') {
    return { error: 'Diário de bordo disponível só para frota LSL.', status: 403 as const };
  }
  return { trip };
}

/** Abre sessão do diário — dados automáticos + estado atual */
router.post('/session', async (req, res) => {
  const ip = clientMeta(req).ip;
  if (rateLimited(ip)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde.' });

  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Informe placa e senha.' });

  const auth = await authenticateDriver(parsed.data.plate, parsed.data.pin);
  if ('error' in auth) return res.status(auth.status).json({ error: auth.error });

  const { trip } = auth;
  const logbook = await getOrCreateLogbook(trip.id);
  await ensureLogbookStops(logbook.id, {
    routeDealerships: trip.route?.dealerships,
    tripDealership: trip.dealership,
  });
  const fresh = await prisma.tripLogbook.findUniqueOrThrow({ where: { id: logbook.id } });
  const kmSuggestion = await suggestedKmInitial(trip.vehicleId);

  res.json({
    prefilled: buildPrefilledTrip(trip),
    logbook: serializeLogbook(fresh),
    suggestedKmInitial: kmSuggestion,
    checklistItems: LOGBOOK_CHECKLIST_ITEMS,
    fuelLevels: FUEL_LEVELS,
  });
});

const departureSchema = authSchema.extend({
  driverMatricula: z.string().max(32).optional(),
  helperName: z.string().max(80).optional(),
  helperMatricula: z.string().max(32).optional(),
  kmInitial: z.coerce.number().int().min(0).max(9_999_999),
  fuelDieselDeparture: z.enum(FUEL_LEVELS).optional(),
  fuelOilDeparture: z.enum(FUEL_LEVELS).optional(),
  checklistDeparture: z.record(z.string(), z.any()),
  fuelingDeparture: z
    .array(
      z.object({
        liters: z.number().optional(),
        odometerKm: z.number().optional(),
        valueReais: z.number().optional(),
      }),
    )
    .optional(),
  signaturePng: z.string().min(100),
});

router.post('/departure', async (req, res) => {
  const ipMeta = clientMeta(req);
  if (rateLimited(ipMeta.ip)) return res.status(429).json({ error: 'Muitas tentativas.' });

  const parsed = departureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos. Verifique KM e checklist.' });

  const auth = await authenticateDriver(parsed.data.plate, parsed.data.pin);
  if ('error' in auth) return res.status(auth.status).json({ error: auth.error });

  const sigErr = validateSignaturePng(parsed.data.signaturePng);
  if (sigErr) return res.status(400).json({ error: sigErr });

  const checklist = parsed.data.checklistDeparture as ChecklistState;
  const checklistErr = validateChecklistComplete(checklist);
  if (checklistErr) return res.status(400).json({ error: checklistErr });

  const logbook = await getOrCreateLogbook(auth.trip.id);
  if (logbook.departureSignedAt) {
    return res.status(400).json({ error: 'Checklist de saída já assinado.' });
  }

  const updated = await prisma.tripLogbook.update({
    where: { id: logbook.id },
    data: {
      driverMatricula: parsed.data.driverMatricula?.trim() || null,
      helperName: parsed.data.helperName?.trim() || null,
      helperMatricula: parsed.data.helperMatricula?.trim() || null,
      kmInitial: parsed.data.kmInitial,
      fuelDieselDeparture: parsed.data.fuelDieselDeparture ?? null,
      fuelOilDeparture: parsed.data.fuelOilDeparture ?? null,
      checklistDeparture: JSON.stringify(checklist),
      fuelingDepartureJson: JSON.stringify(parsed.data.fuelingDeparture ?? []),
      departureSignedAt: new Date(),
      departureSignaturePng: parsed.data.signaturePng,
      departureSignedIp: ipMeta.ip,
      departureUserAgent: ipMeta.userAgent.slice(0, 500),
    },
  });

  res.json({ ok: true, logbook: serializeLogbook(updated) });
});

const returnSchema = authSchema.extend({
  kmFinal: z.coerce.number().int().min(0).max(9_999_999),
  fuelDieselReturn: z.enum(FUEL_LEVELS).optional(),
  fuelOilReturn: z.enum(FUEL_LEVELS).optional(),
  checklistReturn: z.record(z.string(), z.any()),
  fuelingReturn: z
    .array(
      z.object({
        liters: z.number().optional(),
        odometerKm: z.number().optional(),
        valueReais: z.number().optional(),
      }),
    )
    .optional(),
  damageDescription: z.string().max(2000).optional(),
  damageMarks: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  maintenanceDescription: z.string().max(2000).optional(),
  signaturePng: z.string().min(100),
});

router.post('/return', async (req, res) => {
  const ipMeta = clientMeta(req);
  if (rateLimited(ipMeta.ip)) return res.status(429).json({ error: 'Muitas tentativas.' });

  const parsed = returnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos. Verifique KM e checklist.' });

  const auth = await authenticateDriver(parsed.data.plate, parsed.data.pin);
  if ('error' in auth) return res.status(auth.status).json({ error: auth.error });

  const sigErr = validateSignaturePng(parsed.data.signaturePng);
  if (sigErr) return res.status(400).json({ error: sigErr });

  const checklist = parsed.data.checklistReturn as ChecklistState;
  const checklistErr = validateChecklistComplete(checklist);
  if (checklistErr) return res.status(400).json({ error: checklistErr });

  const logbook = await getOrCreateLogbook(auth.trip.id);
  if (!logbook.departureSignedAt) {
    return res.status(400).json({ error: 'Complete e assine o checklist de saída primeiro.' });
  }
  if (logbook.returnSignedAt) {
    return res.status(400).json({ error: 'Checklist de retorno já assinado.' });
  }
  const stopsErr = validateStopsForSubmit(parseStopsJson(logbook.stopsJson));
  if (stopsErr) {
    return res.status(400).json({ error: `Relatório de paradas incompleto: ${stopsErr}` });
  }
  if (parsed.data.kmFinal < (logbook.kmInitial ?? 0)) {
    return res.status(400).json({ error: 'KM final não pode ser menor que o KM inicial.' });
  }

  const updated = await prisma.tripLogbook.update({
    where: { id: logbook.id },
    data: {
      kmFinal: parsed.data.kmFinal,
      fuelDieselReturn: parsed.data.fuelDieselReturn ?? null,
      fuelOilReturn: parsed.data.fuelOilReturn ?? null,
      checklistReturn: JSON.stringify(checklist),
      fuelingReturnJson: JSON.stringify(parsed.data.fuelingReturn ?? []),
      damageDescription: parsed.data.damageDescription?.trim() || null,
      damageMarksJson: JSON.stringify(parsed.data.damageMarks ?? []),
      maintenanceDescription: parsed.data.maintenanceDescription?.trim() || null,
      returnSignedAt: new Date(),
      returnSignaturePng: parsed.data.signaturePng,
      returnSignedIp: ipMeta.ip,
      returnUserAgent: ipMeta.userAgent.slice(0, 500),
    },
  });

  res.json({ ok: true, logbook: serializeLogbook(updated) });
});

const stopSchema = z.object({
  order: z.number().int().min(1).max(10),
  dealershipId: z.string().nullable().optional(),
  dealershipName: z.string().max(120),
  city: z.string().max(80),
  plannedMotoCount: z.number().int().nullable().optional(),
  kmArrival: z.number().int().nullable().optional(),
  arrivalTime: z.string().max(8).nullable().optional(),
  departureTime: z.string().max(8).nullable().optional(),
  boxQty: z.number().int().nullable().optional(),
  motoQty: z.number().int().nullable().optional(),
});

const reportSchema = authSchema.extend({
  stops: z.array(stopSchema).min(1).max(10),
  reportExtras: z.object({
    pernoites: z.array(z.record(z.string(), z.any())).max(3),
    meals: z.array(z.record(z.string(), z.any())).max(3),
    restTimes: z.array(z.record(z.string(), z.any())).max(3),
    waitTimes: z.array(z.record(z.string(), z.any())).max(3),
    maintenance: z.record(z.string(), z.any()),
  }),
  tripObservations: z.string().max(4000).optional(),
});

router.post('/report', async (req, res) => {
  const ipMeta = clientMeta(req);
  if (rateLimited(ipMeta.ip)) return res.status(429).json({ error: 'Muitas tentativas.' });

  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados do relatório inválidos.' });

  const auth = await authenticateDriver(parsed.data.plate, parsed.data.pin);
  if ('error' in auth) return res.status(auth.status).json({ error: auth.error });

  const logbook = await getOrCreateLogbook(auth.trip.id);
  if (!logbook.departureSignedAt) {
    return res.status(400).json({ error: 'Assine o checklist de saída antes de registrar paradas.' });
  }
  if (logbook.returnSignedAt) {
    return res.status(400).json({ error: 'Relatório bloqueado — retorno já assinado.' });
  }

  const stopsErr = validateStopsForSubmit(parsed.data.stops);
  if (stopsErr) return res.status(400).json({ error: stopsErr });

  const updated = await prisma.tripLogbook.update({
    where: { id: logbook.id },
    data: {
      stopsJson: JSON.stringify(parsed.data.stops),
      reportExtrasJson: JSON.stringify(parsed.data.reportExtras),
      tripObservations: parsed.data.tripObservations?.trim() || null,
    },
  });

  res.json({ ok: true, logbook: serializeLogbook(updated) });
});

export default router;
