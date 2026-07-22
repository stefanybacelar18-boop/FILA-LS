import { Router } from 'express';
import { Role } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import {
  filterTripsForRole,
  isPlateHiddenFromOperator,
} from '../data/operatorVisibility';

const router = Router();
router.use(authenticate);

/**
 * Central de justificativas para Admin/Operação:
 * - indisponibilidade de placa por roteiro (Definir placas)
 * - atraso/problema de viagem (Retornos)
 */
router.get('/', authorize(Role.ADMIN, Role.OPERACAO), async (req: AuthRequest, res) => {
  const role = req.user?.role;
  const take = Math.min(Number(req.query.limit) || 100, 200);

  const [routeReports, tripDelays] = await Promise.all([
    prisma.plateUnavailability.findMany({
      include: {
        vehicle: { select: { id: true, plate: true, status: true } },
        route: { select: { id: true, name: true, date: true, status: true } },
        reportedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    }),
    prisma.trip.findMany({
      where: { delayReason: { not: null } },
      include: {
        vehicle: { select: { id: true, plate: true, status: true } },
        dealership: { select: { id: true, name: true, city: true } },
        route: { select: { id: true, name: true, date: true } },
        delayReportedBy: { select: { id: true, name: true } },
        evidences: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            filename: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ delayReportedAt: 'desc' }, { updatedAt: 'desc' }],
      take,
    }),
  ]);

  const visibleRouteReports =
    role === Role.OPERACAO
      ? routeReports.filter((r) => !isPlateHiddenFromOperator(r.vehicle.plate))
      : routeReports;

  const visibleTripDelays = filterTripsForRole(role, tripDelays);

  res.json({
    routeUnavailabilities: visibleRouteReports,
    tripDelays: visibleTripDelays,
    summary: {
      routeUnavailabilities: visibleRouteReports.length,
      tripDelays: visibleTripDelays.length,
      total: visibleRouteReports.length + visibleTripDelays.length,
    },
  });
});

export default router;
