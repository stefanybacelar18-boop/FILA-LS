import { Router } from 'express';
import { z } from 'zod';
import { format } from 'date-fns';
import { authenticate, authorize, type AuthRequest } from '../middleware/auth';
import { Role } from '../types/enums';
import { prisma } from '../lib/prisma';
import { serializeLogbook } from '../lib/logbook-service';
import { validateSignaturePng, LOGBOOK_CHECKLIST_ITEMS, LOGBOOK_STATUS_LABELS, logbookWorkflowStatus } from '../lib/logbook-checklist';
import { buildLogbookPdf } from '../lib/logbook-pdf';

const router = Router();
router.use(authenticate);
router.use(authorize(Role.ADMIN, Role.OPERACAO, Role.CONSULTA));

const tripInclude = {
  vehicle: { select: { plate: true, brand: true, model: true } },
  dealership: { select: { name: true, city: true } },
  route: { select: { name: true, date: true } },
} as const;

router.get('/', async (req, res) => {
  const pending = req.query.pending === 'true';
  const where = pending
    ? { returnSignedAt: { not: null }, coordinatorSignedAt: null }
    : {};

  const [rows, pendingCoordinator] = await Promise.all([
    prisma.tripLogbook.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 80,
      include: {
        trip: { include: tripInclude },
        vehicle: { select: { plate: true } },
        coordinatorUser: { select: { name: true } },
      },
    }),
    prisma.tripLogbook.count({
      where: { returnSignedAt: { not: null }, coordinatorSignedAt: null },
    }),
  ]);

  res.json({
    pendingCoordinator,
    items: rows.map((r) => {
      const status = logbookWorkflowStatus(r);
      return {
        id: r.id,
        tripId: r.tripId,
        plate: r.vehicle.plate,
        driverName: r.trip.driverName,
        routeName: r.trip.route?.name ?? null,
        departureAt: r.trip.departureAt.toISOString(),
        departureComplete: !!r.departureSignedAt,
        returnComplete: !!r.returnSignedAt,
        coordinatorComplete: !!r.coordinatorSignedAt,
        coordinatorName: r.coordinatorUser?.name ?? null,
        status,
        statusLabel: LOGBOOK_STATUS_LABELS[status],
        updatedAt: r.updatedAt.toISOString(),
      };
    }),
  });
});

router.get('/:tripId', async (req, res) => {
  const tripId = String(req.params.tripId);
  const logbook = await prisma.tripLogbook.findUnique({
    where: { tripId },
    include: {
      trip: { include: tripInclude },
      vehicle: { select: { plate: true, brand: true, model: true } },
      coordinatorUser: { select: { name: true, email: true } },
    },
  });
  if (!logbook) return res.status(404).json({ error: 'Diário não encontrado.' });

  res.json({
    ...serializeLogbook(logbook),
    trip: {
      id: logbook.trip.id,
      driverName: logbook.trip.driverName,
      departureAt: logbook.trip.departureAt.toISOString(),
      expectedReturn: logbook.trip.expectedReturn.toISOString(),
      returnedAt: logbook.trip.returnedAt?.toISOString() ?? null,
      status: logbook.trip.status,
      dealership: logbook.trip.dealership,
      route: logbook.trip.route,
    },
    plate: logbook.vehicle.plate,
    vehicleLabel: `${logbook.vehicle.brand} ${logbook.vehicle.model}`,
    departureSignaturePng: logbook.departureSignaturePng,
    returnSignaturePng: logbook.returnSignaturePng,
    coordinatorSignaturePng: logbook.coordinatorSignaturePng,
    coordinatorName: logbook.coordinatorUser?.name ?? null,
    departureSignedIp: logbook.departureSignedIp,
    returnSignedIp: logbook.returnSignedIp,
    departureSignedAt: logbook.departureSignedAt?.toISOString() ?? null,
    returnSignedAt: logbook.returnSignedAt?.toISOString() ?? null,
    coordinatorSignedAt: logbook.coordinatorSignedAt?.toISOString() ?? null,
    checklistItems: LOGBOOK_CHECKLIST_ITEMS,
  });
});

router.get('/:tripId/pdf', async (req, res) => {
  const tripId = String(req.params.tripId);
  const logbook = await prisma.tripLogbook.findUnique({
    where: { tripId },
    include: {
      trip: { include: tripInclude },
      vehicle: { select: { plate: true, brand: true, model: true } },
      coordinatorUser: { select: { name: true } },
    },
  });
  if (!logbook) return res.status(404).json({ error: 'Diário não encontrado.' });
  if (!logbook.returnSignedAt) {
    return res.status(400).json({
      error: 'Diário incompleto — aguardando motorista concluir saída e retorno.',
    });
  }

  const plate = logbook.vehicle.plate.replace(/[^A-Z0-9]/gi, '');
  const date = format(logbook.trip.departureAt, 'yyyy-MM-dd');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=diario-bordo-${plate}-${date}.pdf`,
  );

  const doc = buildLogbookPdf(logbook);
  doc.pipe(res);
  doc.end();
});

const signSchema = z.object({ signaturePng: z.string().min(100) });

router.post('/:tripId/coordinator-sign', async (req: AuthRequest, res) => {
  if (req.user?.role === Role.CONSULTA) {
    return res.status(403).json({ error: 'Perfil consulta não pode assinar.' });
  }

  const parsed = signSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Assinatura inválida.' });

  const sigErr = validateSignaturePng(parsed.data.signaturePng);
  if (sigErr) return res.status(400).json({ error: sigErr });

  const tripId = String(req.params.tripId);
  const logbook = await prisma.tripLogbook.findUnique({ where: { tripId } });
  if (!logbook) return res.status(404).json({ error: 'Diário não encontrado.' });
  if (!logbook.returnSignedAt) {
    return res.status(400).json({ error: 'Aguardando checklist de retorno do motorista.' });
  }
  if (logbook.coordinatorSignedAt) {
    return res.status(400).json({ error: 'Coordenador já assinou este diário.' });
  }

  const updated = await prisma.tripLogbook.update({
    where: { id: logbook.id },
    data: {
      coordinatorSignedAt: new Date(),
      coordinatorSignaturePng: parsed.data.signaturePng,
      coordinatorUserId: req.user!.id,
    },
  });

  res.json({ ok: true, logbook: serializeLogbook(updated) });
});

export default router;
