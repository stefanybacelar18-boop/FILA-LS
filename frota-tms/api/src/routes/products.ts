import { Router } from 'express';
import { z } from 'zod';
import { Role } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { audit } from '../services/audit';
import { daysUntilExpiry, priorityColor } from '../utils/status';
import { addDays, startOfDay } from 'date-fns';
import { paramId } from '../utils/params';

const router = Router();
router.use(authenticate);

function enrich(p: {
  id: string;
  product: string;
  code: string;
  lot: string;
  quantity: number;
  expiryDate: Date;
  notes: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  const days = daysUntilExpiry(p.expiryDate);
  return { ...p, daysRemaining: days, color: priorityColor(days), blinking: days < 7 && days >= 0 };
}

const schema = z.object({
  product: z.string().min(1),
  code: z.string().min(1),
  lot: z.string().min(1),
  quantity: z.number().positive(),
  expiryDate: z.string(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

router.get('/', async (req, res) => {
  const { q, active } = req.query;
  const where: Record<string, unknown> = {};
  if (active !== 'false') where.active = true;
  if (q) {
    where.OR = [
      { product: { contains: String(q) } },
      { code: { contains: String(q) } },
      { lot: { contains: String(q) } },
    ];
  }
  const items = await prisma.priorityProduct.findMany({ where, orderBy: { expiryDate: 'asc' } });
  res.json(items.map(enrich).sort((a, b) => a.daysRemaining - b.daysRemaining));
});

router.get('/panel', async (_req, res) => {
  const today = startOfDay(new Date());
  const all = await prisma.priorityProduct.findMany({ where: { active: true } });
  const enriched = all.map(enrich);

  res.json({
    in30: enriched.filter((p) => p.daysRemaining > 15 && p.daysRemaining <= 30),
    in15: enriched.filter((p) => p.daysRemaining >= 7 && p.daysRemaining <= 15),
    in7: enriched.filter((p) => p.daysRemaining >= 1 && p.daysRemaining < 7),
    today: enriched.filter((p) => p.daysRemaining === 0),
    expired: enriched.filter((p) => p.daysRemaining < 0),
    urgentTop: enriched.filter((p) => p.daysRemaining <= 30).slice(0, 20),
  });
});

router.get('/:id', async (req, res) => {
  const item = await prisma.priorityProduct.findUnique({ where: { id: paramId(req) } });
  if (!item) return res.status(404).json({ error: 'Produto não encontrado' });
  res.json(enrich(item));
});

router.post('/', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });

  const item = await prisma.priorityProduct.create({
    data: {
      ...parsed.data,
      expiryDate: new Date(parsed.data.expiryDate),
    },
  });
  await audit('CREATE', 'PriorityProduct', { userId: req.user!.id, entityId: item.id, details: item.product });
  res.status(201).json(enrich(item));
});

router.put('/:id', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.expiryDate) data.expiryDate = new Date(parsed.data.expiryDate);

  const item = await prisma.priorityProduct.update({ where: { id: paramId(req) }, data });
  await audit('UPDATE', 'PriorityProduct', { userId: req.user!.id, entityId: item.id });
  res.json(enrich(item));
});

router.delete('/:id', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  await prisma.priorityProduct.update({ where: { id: paramId(req) }, data: { active: false } });
  await audit('SOFT_DELETE', 'PriorityProduct', { userId: req.user!.id, entityId: paramId(req) });
  res.status(204).send();
});

export default router;
