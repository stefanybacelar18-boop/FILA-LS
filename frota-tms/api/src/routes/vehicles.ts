import { Router } from 'express';
import { z } from 'zod';
import { VehicleStatus, VehicleType, Role } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { audit } from '../services/audit';
import { vehicleColor } from '../utils/status';
import { paramId } from '../utils/params';

const router = Router();
router.use(authenticate);

const schema = z.object({
  plate: z.string().min(7).max(8),
  type: z.enum([VehicleType.TRUCK, VehicleType.CARRETA]),
  model: z.string().min(1),
  brand: z.string().min(1),
  year: z.number().int().min(1990).max(2100),
  capacityKg: z.number().positive(),
  status: z
    .enum([
      VehicleStatus.DISPONIVEL,
      VehicleStatus.EM_VIAGEM,
      VehicleStatus.EM_CARREGAMENTO,
      VehicleStatus.EM_MANUTENCAO,
      VehicleStatus.BLOQUEADO,
    ])
    .optional(),
  notes: z.string().optional().nullable(),
});

async function enrichVehicle(v: {
  id: string;
  plate: string;
  type: string;
  model: string;
  brand: string;
  year: number;
  capacityKg: number;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const activeTrip = await prisma.trip.findFirst({
    where: { vehicleId: v.id, status: { in: ['EM_ANDAMENTO', 'ATRASADO'] } },
    orderBy: { departureAt: 'desc' },
  });
  return {
    ...v,
    color: vehicleColor(v.status as VehicleStatus, activeTrip?.expectedReturn),
    expectedReturn: activeTrip?.expectedReturn ?? null,
    activeTripId: activeTrip?.id ?? null,
  };
}

router.get('/', async (req, res) => {
  const { status, type, q } = req.query;
  const where: Record<string, unknown> = {};
  if (status) where.status = String(status);
  if (type) where.type = String(type);
  if (q) {
    where.OR = [
      { plate: { contains: String(q) } },
      { model: { contains: String(q) } },
      { brand: { contains: String(q) } },
    ];
  }
  const vehicles = await prisma.vehicle.findMany({ where, orderBy: { plate: 'asc' } });
  res.json(await Promise.all(vehicles.map(enrichVehicle)));
});

router.get('/available', async (_req, res) => {
  const vehicles = await prisma.vehicle.findMany({
    where: { status: VehicleStatus.DISPONIVEL },
    orderBy: { plate: 'asc' },
  });
  res.json(await Promise.all(vehicles.map(enrichVehicle)));
});

router.get('/:id', async (req, res) => {
  const v = await prisma.vehicle.findUnique({ where: { id: paramId(req) } });
  if (!v) return res.status(404).json({ error: 'Veículo não encontrado' });
  res.json(await enrichVehicle(v));
});

router.post('/', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });

  const plate = parsed.data.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const exists = await prisma.vehicle.findUnique({ where: { plate } });
  if (exists) return res.status(409).json({ error: 'Placa já cadastrada' });

  const vehicle = await prisma.vehicle.create({
    data: { ...parsed.data, plate, status: parsed.data.status ?? VehicleStatus.DISPONIVEL },
  });
  await prisma.vehicleHistory.create({
    data: {
      vehicleId: vehicle.id,
      userId: req.user!.id,
      action: 'CADASTRO',
      toStatus: vehicle.status,
      details: 'Veículo cadastrado',
    },
  });
  await audit('CREATE', 'Vehicle', { userId: req.user!.id, entityId: vehicle.id, details: plate });
  res.status(201).json(await enrichVehicle(vehicle));
});

router.put('/:id', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });

  const current = await prisma.vehicle.findUnique({ where: { id: paramId(req) } });
  if (!current) return res.status(404).json({ error: 'Veículo não encontrado' });

  const data = { ...parsed.data };
  if (data.plate) data.plate = data.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const vehicle = await prisma.vehicle.update({ where: { id: paramId(req) }, data });
  if (data.status && data.status !== current.status) {
    await prisma.vehicleHistory.create({
      data: {
        vehicleId: vehicle.id,
        userId: req.user!.id,
        action: 'STATUS_MANUAL',
        fromStatus: current.status,
        toStatus: data.status,
      },
    });
  }
  await audit('UPDATE', 'Vehicle', { userId: req.user!.id, entityId: vehicle.id });
  res.json(await enrichVehicle(vehicle));
});

router.delete('/:id', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
  const active = await prisma.trip.findFirst({
    where: { vehicleId: paramId(req), status: { in: ['EM_ANDAMENTO', 'ATRASADO'] } },
  });
  if (active) return res.status(400).json({ error: 'Veículo em viagem não pode ser excluído' });

  await prisma.vehicle.delete({ where: { id: paramId(req) } });
  await audit('DELETE', 'Vehicle', { userId: req.user!.id, entityId: paramId(req) });
  res.status(204).send();
});

export default router;
