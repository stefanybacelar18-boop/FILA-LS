import { Router } from 'express';
import { z } from 'zod';
import { AllowedVehicleType, Role } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { audit } from '../services/audit';
import { paramId } from '../utils/params';
import {
  PAD_LAT,
  PAD_LNG,
  TRAVEL_KM_PER_DAY,
  resolveTravelFromPad,
  travelFromPadByCity,
} from '../utils/geo';

const router = Router();
router.use(authenticate);

const schema = z.object({
  code: z.string().optional().nullable(),
  name: z.string().min(2),
  city: z.string().min(2),
  state: z.string().min(2).max(2),
  region: z.string().min(1),
  phone: z.string().optional().nullable(),
  /** Opcional: se omitido, calcula automaticamente PAD → cidade */
  distanceKm: z.number().nonnegative().optional(),
  avgTravelDays: z.number().nonnegative().optional(),
  allowedVehicle: z
    .enum([AllowedVehicleType.TRUCK, AllowedVehicleType.CARRETA, AllowedVehicleType.AMBOS])
    .default(AllowedVehicleType.AMBOS),
  active: z.boolean().optional(),
});

function applyPadTravel(data: {
  city: string;
  distanceKm?: number;
  avgTravelDays?: number;
}) {
  const travel = resolveTravelFromPad({
    city: data.city,
    distanceKm: data.distanceKm,
    avgTravelDays: data.avgTravelDays,
  });
  return {
    distanceKm: travel.distanceKm,
    avgTravelDays: travel.avgTravelDays,
    padSource: travel.source,
  };
}

router.get('/', async (req, res) => {
  const { state, region, q, includeInactive } = req.query;
  const where: Record<string, unknown> = {};
  // Por padrão só ativas (evita montar roteiro com concessionária desativada)
  if (includeInactive !== 'true') where.active = true;
  if (state) where.state = String(state).toUpperCase();
  if (region) where.region = { contains: String(region) };
  if (q) {
    where.OR = [
      { name: { contains: String(q) } },
      { city: { contains: String(q) } },
      { region: { contains: String(q) } },
      { code: { contains: String(q) } },
      { phone: { contains: String(q) } },
    ];
  }
  const items = await prisma.dealership.findMany({ where, orderBy: [{ city: 'asc' }, { name: 'asc' }] });
  res.json(
    items.map((d) => {
      const live = travelFromPadByCity(d.city);
      return {
        ...d,
        pad: live
          ? {
              distanceKm: live.distanceKm,
              avgTravelDays: live.avgTravelDays,
              lat: live.lat,
              lng: live.lng,
            }
          : null,
      };
    }),
  );
});

router.get('/filters/meta', async (_req, res) => {
  const all = await prisma.dealership.findMany({ select: { state: true, region: true } });
  const states = [...new Set(all.map((d) => d.state))].sort();
  const regions = [...new Set(all.map((d) => d.region))].sort();
  res.json({
    states,
    regions,
    pad: {
      lat: PAD_LAT,
      lng: PAD_LNG,
      formula: `(distanceKm * 2) / ${TRAVEL_KM_PER_DAY}`,
      kmPerDay: TRAVEL_KM_PER_DAY,
    },
  });
});

/** Recalcula distanceKm / avgTravelDays de todas as concessionárias a partir do PAD. */
router.post('/recalculate-from-pad', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  const all = await prisma.dealership.findMany();
  let updated = 0;
  let skipped = 0;
  for (const d of all) {
    const travel = travelFromPadByCity(d.city);
    if (!travel) {
      skipped += 1;
      continue;
    }
    await prisma.dealership.update({
      where: { id: d.id },
      data: {
        distanceKm: travel.distanceKm,
        avgTravelDays: travel.avgTravelDays,
      },
    });
    updated += 1;
  }
  await audit('RECALC_PAD', 'Dealership', {
    userId: req.user!.id,
    details: `updated=${updated} skipped=${skipped}`,
  });
  res.json({
    ok: true,
    updated,
    skipped,
    pad: { lat: PAD_LAT, lng: PAD_LNG },
    formula: `(distanceKm * 2) / ${TRAVEL_KM_PER_DAY}`,
  });
});

router.get('/:id', async (req, res) => {
  const item = await prisma.dealership.findUnique({ where: { id: paramId(req) } });
  if (!item) return res.status(404).json({ error: 'Concessionária não encontrada' });
  const live = travelFromPadByCity(item.city);
  res.json({
    ...item,
    pad: live
      ? {
          distanceKm: live.distanceKm,
          avgTravelDays: live.avgTravelDays,
          lat: live.lat,
          lng: live.lng,
        }
      : null,
  });
});

router.post('/', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });

  const pad = applyPadTravel(parsed.data);
  if (!travelFromPadByCity(parsed.data.city) && parsed.data.distanceKm == null) {
    return res.status(400).json({
      error:
        'Cidade sem coordenadas conhecidas. Informe distanceKm manualmente ou use uma cidade mapeada a partir do PAD.',
    });
  }

  const item = await prisma.dealership.create({
    data: {
      code: parsed.data.code,
      name: parsed.data.name,
      city: parsed.data.city,
      state: parsed.data.state.toUpperCase(),
      region: parsed.data.region,
      phone: parsed.data.phone,
      allowedVehicle: parsed.data.allowedVehicle,
      active: parsed.data.active ?? true,
      distanceKm: pad.distanceKm,
      avgTravelDays: pad.avgTravelDays,
    },
  });
  await audit('CREATE', 'Dealership', {
    userId: req.user!.id,
    entityId: item.id,
    details: `${item.name} · ${item.distanceKm} km do PAD (${item.avgTravelDays} dias)`,
  });
  res.status(201).json({ ...item, padSource: pad.padSource });
});

router.put('/:id', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });

  const existing = await prisma.dealership.findUnique({ where: { id: paramId(req) } });
  if (!existing) return res.status(404).json({ error: 'Concessionária não encontrada' });

  const city = parsed.data.city ?? existing.city;
  const pad = applyPadTravel({
    city,
    distanceKm: parsed.data.distanceKm,
    avgTravelDays: parsed.data.avgTravelDays,
  });

  const item = await prisma.dealership.update({
    where: { id: paramId(req) },
    data: {
      ...(parsed.data.code !== undefined ? { code: parsed.data.code } : {}),
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.city !== undefined ? { city: parsed.data.city } : {}),
      ...(parsed.data.state !== undefined ? { state: parsed.data.state.toUpperCase() } : {}),
      ...(parsed.data.region !== undefined ? { region: parsed.data.region } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
      ...(parsed.data.allowedVehicle !== undefined
        ? { allowedVehicle: parsed.data.allowedVehicle }
        : {}),
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      // Sempre persiste distância/dias a partir do PAD quando a cidade é conhecida
      distanceKm: pad.distanceKm,
      avgTravelDays: pad.avgTravelDays,
    },
  });
  await audit('UPDATE', 'Dealership', {
    userId: req.user!.id,
    entityId: item.id,
    details: `${item.distanceKm} km do PAD`,
  });
  res.json({ ...item, padSource: pad.padSource });
});

router.delete('/:id', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  await prisma.dealership.update({ where: { id: paramId(req) }, data: { active: false } });
  await audit('SOFT_DELETE', 'Dealership', { userId: req.user!.id, entityId: paramId(req) });
  res.status(204).send();
});

export default router;
