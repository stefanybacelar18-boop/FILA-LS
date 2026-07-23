import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { Role, TripStatus, VehicleStatus, RouteStatus } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { audit } from '../services/audit';
import { isOverdue, vehicleColor } from '../utils/status';
import { addDays, startOfDay } from 'date-fns';

import type { Server } from 'socket.io';
import { paramId } from '../utils/params';
import {
  filterTripsForRole,
  isDriverHiddenFromOperator,
  isPlateHiddenFromOperator,
} from '../data/operatorVisibility';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads/trip-evidence');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype) || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Envie apenas imagens (JPG/PNG/WEBP) ou PDF'));
    }
  },
});

function evidenceFilename(originalName: string): string {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
}

const delayReportSchema = z.object({
  reason: z.string().min(5, 'Informe o motivo com ao menos 5 caracteres'),
  /** Nova previsão de retorno (obrigatória ao informar problema) */
  newExpectedReturn: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Nova previsão inválida'),
  markUnavailable: z
    .union([z.boolean(), z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1'),
  unavailableReason: z.string().optional().nullable(),
});

const returnSchema = z.object({
  delayReason: z.string().min(5).optional(),
  notes: z.string().optional().nullable(),
});

const tripInclude = {
  vehicle: true,
  dealership: true,
  route: true,
  assignedBy: { select: { id: true, name: true } },
  returnedBy: { select: { id: true, name: true } },
  delayReportedBy: { select: { id: true, name: true } },
  evidences: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      filename: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      uploadedBy: { select: { name: true } },
    },
  },
};

export function createTripsRouter(io: Server) {
  const router = Router();
  router.use(authenticate);

  function denyHiddenTripForOps(
    role: string | undefined,
    trip: { driverName?: string | null; vehicle: { plate: string } },
  ): boolean {
    if (role !== Role.OPERACAO) return false;
    if (isPlateHiddenFromOperator(trip.vehicle.plate)) return true;
    if (trip.driverName && isDriverHiddenFromOperator(trip.driverName)) return true;
    return false;
  }

  /**
   * Atraso só quando o dia civil da previsão já passou.
   * Também corrige viagens marcadas ATRASADO cedo demais (ex.: previsão hoje às 06:00).
   */
  async function syncOverdue() {
    const today = startOfDay(new Date());
    const pastDue = await prisma.trip.findMany({
      where: { status: TripStatus.EM_ANDAMENTO, expectedReturn: { lt: today } },
    });
    for (const t of pastDue) {
      await prisma.trip.update({ where: { id: t.id }, data: { status: TripStatus.ATRASADO } });
    }
    const wronglyLate = await prisma.trip.findMany({
      where: { status: TripStatus.ATRASADO, expectedReturn: { gte: today }, returnedAt: null },
    });
    for (const t of wronglyLate) {
      await prisma.trip.update({
        where: { id: t.id },
        data: { status: TripStatus.EM_ANDAMENTO },
      });
    }
  }

  router.get('/', async (req: AuthRequest, res) => {
    await syncOverdue();
    const { status, vehicleId, dealershipId, from, to } = req.query;
    const where: Record<string, unknown> = {};
    if (status) where.status = String(status);
    if (vehicleId) where.vehicleId = String(vehicleId);
    if (dealershipId) where.dealershipId = String(dealershipId);
    if (from || to) {
      where.departureAt = {};
      if (from) (where.departureAt as Record<string, Date>).gte = new Date(String(from));
      if (to) (where.departureAt as Record<string, Date>).lte = new Date(String(to));
    }

    const trips = await prisma.trip.findMany({
      where,
      include: tripInclude,
      orderBy: { departureAt: 'desc' },
    });
    const visible = filterTripsForRole(req.user?.role, trips);

    res.json(
      visible.map((t) => ({
        ...t,
        overdue: isOverdue(t.expectedReturn, t.returnedAt),
        color: vehicleColor(t.vehicle.status, t.expectedReturn),
        needsDelayReason: isOverdue(t.expectedReturn, t.returnedAt) && !t.delayReason,
      })),
    );
  });

  router.get('/returns', async (req: AuthRequest, res) => {
    await syncOverdue();
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const dayAfter = addDays(today, 2);

    const openAll = await prisma.trip.findMany({
      where: { status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] } },
      include: tripInclude,
      orderBy: { expectedReturn: 'asc' },
    });
    const open = filterTripsForRole(req.user?.role, openAll);

    const mapTrip = (t: (typeof open)[0]) => ({
      ...t,
      overdue: isOverdue(t.expectedReturn, t.returnedAt),
      color: vehicleColor(t.vehicle.status, t.expectedReturn),
      needsDelayReason: isOverdue(t.expectedReturn, t.returnedAt) && !t.delayReason,
    });

    const day3 = addDays(today, 3);
    // Atraso = dia da previsão < hoje (não usa só status ATRASADO: previsão "hoje" fica em Hoje)
    const overdueIds = new Set(
      open.filter((t) => isOverdue(t.expectedReturn, t.returnedAt)).map((t) => t.id),
    );

    res.json({
      today: open
        .filter((t) => !overdueIds.has(t.id) && t.expectedReturn >= today && t.expectedReturn < tomorrow)
        .map(mapTrip),
      tomorrow: open
        .filter((t) => !overdueIds.has(t.id) && t.expectedReturn >= tomorrow && t.expectedReturn < dayAfter)
        .map(mapTrip),
      in2Days: open
        .filter((t) => !overdueIds.has(t.id) && t.expectedReturn >= dayAfter && t.expectedReturn < day3)
        .map(mapTrip),
      later: open
        .filter((t) => !overdueIds.has(t.id) && t.expectedReturn >= day3)
        .map(mapTrip),
      overdue: open.filter((t) => overdueIds.has(t.id)).map(mapTrip),
    });
  });

  /**
   * Problema / atraso: justificativa + nova previsão + evidências (fotos/PDF).
   * Aceita JSON ou multipart (campo "evidence").
   */
  router.post(
    '/:id/delay-report',
    authorize(Role.ADMIN, Role.OPERACAO),
    (req, res, next) => {
      upload.array('evidence', 6)(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Falha no upload' });
        next();
      });
    },
    async (req: AuthRequest, res) => {
      const body = {
        reason: req.body?.reason,
        newExpectedReturn: req.body?.newExpectedReturn,
        markUnavailable: req.body?.markUnavailable,
        unavailableReason: req.body?.unavailableReason,
      };
      const parsed = delayReportSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Informe justificativa (mín. 5 caracteres) e a nova previsão de retorno',
          details: parsed.error.flatten(),
        });
      }

      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length < 1) {
        return res.status(400).json({
          error: 'Anexe ao menos uma foto ou evidência do atraso/problema',
          code: 'EVIDENCE_REQUIRED',
        });
      }

      const trip = await prisma.trip.findUnique({
        where: { id: paramId(req) },
        include: { vehicle: true },
      });
      if (!trip) return res.status(404).json({ error: 'Viagem não encontrada' });
      if (denyHiddenTripForOps(req.user?.role, trip)) {
        return res.status(404).json({ error: 'Viagem não encontrada' });
      }
      if (trip.status === TripStatus.RETORNOU || trip.status === TripStatus.CANCELADO) {
        return res.status(400).json({ error: 'Viagem já finalizada' });
      }

      const newExpected = new Date(parsed.data.newExpectedReturn);
      if (newExpected <= new Date()) {
        return res.status(400).json({
          error: 'A nova previsão de retorno deve ser uma data futura',
        });
      }

      const now = new Date();
      const markUnavailable = !!parsed.data.markUnavailable;
      const unavailableText =
        parsed.data.unavailableReason?.trim() ||
        (markUnavailable ? parsed.data.reason.trim() : null);

      const updated = await prisma.$transaction(async (tx) => {
        const t = await tx.trip.update({
          where: { id: trip.id },
          data: {
            status: TripStatus.ATRASADO,
            expectedReturn: newExpected,
            delayReason: parsed.data.reason.trim(),
            delayReportedAt: now,
            delayReportedById: req.user!.id,
            ...(markUnavailable
              ? {
                  unavailableReason: unavailableText,
                  unavailableAt: now,
                }
              : {}),
          },
          include: tripInclude,
        });

        for (const f of files) {
          const filename = evidenceFilename(f.originalname);
          const buffer = f.buffer;
          try {
            fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
          } catch (err) {
            console.warn('Falha ao gravar evidência em disco (seguindo com banco):', err);
          }
          await tx.tripEvidence.create({
            data: {
              tripId: trip.id,
              filename,
              originalName: f.originalname,
              mimeType: f.mimetype,
              sizeBytes: f.size,
              content: buffer,
              uploadedById: req.user!.id,
            },
          });
        }

        if (markUnavailable) {
          await tx.vehicle.update({
            where: { id: trip.vehicleId },
            data: { status: VehicleStatus.BLOQUEADO },
          });
          await tx.vehicleHistory.create({
            data: {
              vehicleId: trip.vehicleId,
              userId: req.user!.id,
              tripId: trip.id,
              action: 'INDISPONIVEL',
              fromStatus: trip.vehicle.status,
              toStatus: VehicleStatus.BLOQUEADO,
              details: unavailableText || parsed.data.reason.trim(),
            },
          });
        } else {
          await tx.vehicleHistory.create({
            data: {
              vehicleId: trip.vehicleId,
              userId: req.user!.id,
              tripId: trip.id,
              action: 'JUSTIFICATIVA_ATRASO',
              fromStatus: trip.vehicle.status,
              toStatus: trip.vehicle.status,
              details: `${parsed.data.reason.trim()} · nova previsão ${newExpected.toISOString().slice(0, 10)} · ${files.length} evidência(s)`,
            },
          });
        }

        return tx.trip.findUniqueOrThrow({
          where: { id: trip.id },
          include: tripInclude,
        });
      });

      await audit('DELAY_REPORT', 'Trip', {
        userId: req.user!.id,
        entityId: trip.id,
        details: `${trip.vehicle.plate}: ${parsed.data.reason.trim().slice(0, 100)} · ${files.length} arquivo(s)`,
      });
      io.emit('fleet:changed', { action: 'delay-report', tripId: trip.id });
      io.emit('trips:changed', { action: 'delay-report' });
      res.json(updated);
    },
  );

  router.post('/:id/return', authorize(Role.ADMIN, Role.OPERACAO), async (req: AuthRequest, res) => {
    const parsed = returnSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    const trip = await prisma.trip.findUnique({
      where: { id: paramId(req) },
      include: { vehicle: true, route: true, dealership: true, evidences: true },
    });
    if (!trip) return res.status(404).json({ error: 'Viagem não encontrada' });
    if (denyHiddenTripForOps(req.user?.role, trip)) {
      return res.status(404).json({ error: 'Viagem não encontrada' });
    }
    if (trip.status === TripStatus.RETORNOU) {
      return res.status(400).json({ error: 'Viagem já finalizada' });
    }

    // Exige justificativa só se o dia da previsão já passou (não no mesmo dia)
    const overdue = isOverdue(trip.expectedReturn, null);
    const delayReason = (parsed.data.delayReason || trip.delayReason || '').trim();
    if (overdue && delayReason.length < 5) {
      return res.status(400).json({
        error:
          'Viagem fora da previsão: informe o problema (justificativa + evidências) antes de confirmar o retorno.',
        code: 'DELAY_REASON_REQUIRED',
      });
    }
    if (overdue && !trip.delayReason && (trip.evidences?.length ?? 0) < 1) {
      return res.status(400).json({
        error: 'Registre o problema com justificativa e evidência antes de confirmar o retorno em atraso.',
        code: 'EVIDENCE_REQUIRED',
      });
    }

    const returnedAt = new Date();
    const holdMaintenance = !!(trip.vehicle as { maintenanceHold?: boolean }).maintenanceHold;
    const nextVehicleStatus = holdMaintenance
      ? VehicleStatus.EM_MANUTENCAO
      : VehicleStatus.DISPONIVEL;

    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.trip.update({
        where: { id: trip.id },
        data: {
          status: TripStatus.RETORNOU,
          returnedAt,
          returnedById: req.user!.id,
          notes: parsed.data.notes?.trim() || trip.notes,
          ...(overdue && delayReason
            ? {
                delayReason,
                delayReportedAt: trip.delayReportedAt ?? returnedAt,
                delayReportedById: trip.delayReportedById ?? req.user!.id,
              }
            : {}),
          unavailableReason: null,
          unavailableAt: null,
        },
        include: tripInclude,
      });
      await tx.vehicle.update({
        where: { id: trip.vehicleId },
        data: { status: nextVehicleStatus },
      });
      await tx.vehicleHistory.create({
        data: {
          vehicleId: trip.vehicleId,
          userId: req.user!.id,
          tripId: trip.id,
          action: 'RETORNO',
          fromStatus: trip.vehicle.status,
          toStatus: nextVehicleStatus,
          details: holdMaintenance
            ? overdue
              ? `Retornou de ${trip.dealership.name} (atraso: ${delayReason}) — permanece em manutenção até liberação`
              : `Retornou de ${trip.dealership.name} — permanece em manutenção até liberação`
            : overdue
              ? `Retornou de ${trip.dealership.name} (atraso: ${delayReason})`
              : `Retornou de ${trip.dealership.name}`,
        },
      });

      if (trip.routeId) {
        const remaining = await tx.trip.count({
          where: {
            routeId: trip.routeId,
            status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] },
          },
        });
        if (remaining === 0) {
          await tx.route.updateMany({
            where: {
              id: trip.routeId,
              status: { in: [RouteStatus.EM_ANDAMENTO, RouteStatus.AGUARDANDO_PLACAS] },
            },
            data: { status: RouteStatus.CONCLUIDO },
          });
        }
      }
      return t;
    });

    await audit('RETURN', 'Trip', {
      userId: req.user!.id,
      entityId: trip.id,
      details: overdue ? `${trip.vehicle.plate} (c/ justificativa)` : trip.vehicle.plate,
    });
    io.emit('fleet:changed', { action: 'return', tripId: trip.id });
    io.emit('trips:changed', { action: 'return' });
    res.json(updated);
  });

  return router;
}
