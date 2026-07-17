import { Router } from 'express';
import { z } from 'zod';
import { AllowedVehicleType, Role } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { audit } from '../services/audit';
import { paramId } from '../utils/params';

const router = Router();
router.use(authenticate);

const schema = z.object({
  code: z.string().optional().nullable(),
  name: z.string().min(2),
  city: z.string().min(2),
  state: z.string().min(2).max(2),
  region: z.string().min(1),
  phone: z.string().optional().nullable(),
  distanceKm: z.number().nonnegative(),
  avgTravelDays: z.number().positive(),
  allowedVehicle: z
    .enum([AllowedVehicleType.TRUCK, AllowedVehicleType.CARRETA, AllowedVehicleType.AMBOS])
    .default(AllowedVehicleType.AMBOS),
  active: z.boolean().optional(),
});

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
  res.json(items);
});

router.get('/filters/meta', async (_req, res) => {
  const all = await prisma.dealership.findMany({ select: { state: true, region: true } });
  const states = [...new Set(all.map((d) => d.state))].sort();
  const regions = [...new Set(all.map((d) => d.region))].sort();
  res.json({ states, regions });
});

router.get('/:id', async (req, res) => {
  const item = await prisma.dealership.findUnique({ where: { id: paramId(req) } });
  if (!item) return res.status(404).json({ error: 'Concessionária não encontrada' });
  res.json(item);
});

router.post('/', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });

  const item = await prisma.dealership.create({
    data: { ...parsed.data, state: parsed.data.state.toUpperCase() },
  });
  await audit('CREATE', 'Dealership', { userId: req.user!.id, entityId: item.id, details: item.name });
  res.status(201).json(item);
});

router.put('/:id', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
  const data = { ...parsed.data };
  if (data.state) data.state = data.state.toUpperCase();
  const item = await prisma.dealership.update({ where: { id: paramId(req) }, data });
  await audit('UPDATE', 'Dealership', { userId: req.user!.id, entityId: item.id });
  res.json(item);
});

router.delete('/:id', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  await prisma.dealership.update({ where: { id: paramId(req) }, data: { active: false } });
  await audit('SOFT_DELETE', 'Dealership', { userId: req.user!.id, entityId: paramId(req) });
  res.status(204).send();
});

export default router;
