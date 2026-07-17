import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, signToken, AuthRequest } from '../middleware/auth';
import { audit } from '../services/audit';
import { Role } from '../types/enums';
import { paramId } from '../utils/params';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !user.active) return res.status(401).json({ error: 'Credenciais inválidas' });

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

  const token = signToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
  });
  await audit('LOGIN', 'User', { userId: user.id, entityId: user.id, ip: req.ip });

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

router.get('/me', authenticate, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json(user);
});

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum([Role.ADMIN, Role.OPERACAO, Role.CONSULTA]),
});

router.get('/users', authenticate, authorize(Role.ADMIN), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: { name: 'asc' },
  });
  res.json(users);
});

router.post('/users', authenticate, authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });

  const exists = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (exists) return res.status(409).json({ error: 'E-mail já cadastrado' });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      passwordHash,
      role: parsed.data.role,
    },
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  await audit('CREATE', 'User', { userId: req.user!.id, entityId: user.id, details: user.email });
  res.status(201).json(user);
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum([Role.ADMIN, Role.OPERACAO, Role.CONSULTA]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

router.patch('/users/:id', authenticate, authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });

  const id = paramId(req);
  if (parsed.data.active === false && id === req.user!.id) {
    return res.status(400).json({ error: 'Não é possível desativar o próprio usuário' });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name) data.name = parsed.data.name.trim();
  if (parsed.data.role) data.role = parsed.data.role;
  if (typeof parsed.data.active === 'boolean') data.active = parsed.data.active;
  if (parsed.data.password) data.passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  await audit('UPDATE', 'User', { userId: req.user!.id, entityId: user.id });
  res.json(user);
});

export default router;
