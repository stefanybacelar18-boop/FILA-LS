import { Router } from 'express';
import { z } from 'zod';
import { Role } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { audit } from '../services/audit';
import { paramId } from '../utils/params';
import { filterDriversForRole } from '../data/operatorVisibility';

const router = Router();
router.use(authenticate);

const schema = z.object({
  name: z.string().min(2),
  phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

const blockSchema = z.object({
  reason: z.string().trim().min(3, 'Informe o motivo do bloqueio'),
});

/** Lista motoristas (operação precisa dos ativos para definir placa) */
router.get('/', authorize(Role.ADMIN, Role.OPERACAO, Role.CONSULTA), async (req: AuthRequest, res) => {
  const { q, active } = req.query;
  const where: Record<string, unknown> = {};
  if (q) where.name = { contains: String(q) };
  if (active === 'true') where.active = true;
  if (active === 'false') where.active = false;

  const drivers = await prisma.driver.findMany({
    where,
    orderBy: [{ active: 'desc' }, { blocked: 'asc' }, { name: 'asc' }],
  });
  res.json(filterDriversForRole(req.user?.role, drivers));
});

router.post('/', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });

  const name = parsed.data.name.trim().replace(/\s+/g, ' ');
  const exists = await prisma.driver.findFirst({
    where: { name: { equals: name } },
  });
  if (exists) return res.status(409).json({ error: 'Já existe motorista com este nome' });

  const driver = await prisma.driver.create({
    data: {
      name,
      phone: parsed.data.phone?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
      active: parsed.data.active ?? true,
      blocked: false,
      blockReason: null,
      blockedAt: null,
    },
  });
  await audit('CREATE', 'Driver', { userId: req.user!.id, entityId: driver.id, details: driver.name });
  res.status(201).json(driver);
});

router.put('/:id', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });

  const id = paramId(req);
  const existing = await prisma.driver.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Motorista não encontrado' });

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) {
    const name = parsed.data.name.trim().replace(/\s+/g, ' ');
    const clash = await prisma.driver.findFirst({
      where: { name: { equals: name }, NOT: { id } },
    });
    if (clash) return res.status(409).json({ error: 'Já existe motorista com este nome' });
    data.name = name;
  }
  if (parsed.data.phone !== undefined) data.phone = parsed.data.phone?.trim() || null;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes?.trim() || null;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;

  const driver = await prisma.driver.update({ where: { id }, data });
  await audit('UPDATE', 'Driver', { userId: req.user!.id, entityId: id, details: driver.name });
  res.json(driver);
});

/** Bloqueia motorista com motivo (não pode ser usado na definição de placa) */
router.post('/:id/block', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  const parsed = blockSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Informe o motivo' });
  }

  const id = paramId(req);
  const existing = await prisma.driver.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Motorista não encontrado' });
  if (!existing.active) {
    return res.status(400).json({ error: 'Motorista inativo não pode ser bloqueado' });
  }

  const driver = await prisma.driver.update({
    where: { id },
    data: {
      blocked: true,
      blockReason: parsed.data.reason,
      blockedAt: new Date(),
    },
  });
  await audit('BLOCK', 'Driver', {
    userId: req.user!.id,
    entityId: id,
    details: `${driver.name}: ${driver.blockReason}`,
  });
  res.json(driver);
});

/** Remove bloqueio */
router.post('/:id/unblock', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  const id = paramId(req);
  const existing = await prisma.driver.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Motorista não encontrado' });

  const driver = await prisma.driver.update({
    where: { id },
    data: {
      blocked: false,
      blockReason: null,
      blockedAt: null,
    },
  });
  await audit('UNBLOCK', 'Driver', { userId: req.user!.id, entityId: id, details: driver.name });
  res.json(driver);
});

router.delete('/:id', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  const id = paramId(req);
  const existing = await prisma.driver.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Motorista não encontrado' });

  // Soft-delete: desativa (mantém histórico de nomes em viagens)
  const driver = await prisma.driver.update({
    where: { id },
    data: {
      active: false,
      blocked: false,
      blockReason: null,
      blockedAt: null,
    },
  });
  await audit('DEACTIVATE', 'Driver', { userId: req.user!.id, entityId: id, details: driver.name });
  res.json(driver);
});

export default router;

/** Importa nomes de motorista padrão das placas que ainda não estão cadastrados */
export async function syncDriversFromVehicles() {
  const vehicles = await prisma.vehicle.findMany({
    where: { defaultDriver: { not: null } },
    select: { defaultDriver: true },
  });
  const names = [
    ...new Set(
      vehicles
        .map((v) => v.defaultDriver?.trim().replace(/\s+/g, ' '))
        .filter((n): n is string => !!n && n.length >= 2),
    ),
  ];
  for (const name of names) {
    await prisma.driver.upsert({
      where: { name },
      create: { name, active: true, blocked: false },
      update: {},
    });
  }
  return names.length;
}
