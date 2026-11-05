import { Router } from 'express';
import { Role, TripStatus } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { cargoDelivery, cargoLookupFilter } from '../lib/cargo-lookup';

const router = Router();
router.use(authenticate);

const SITUATION_LABEL = {
  ENTREGUE: 'Entregue',
  EM_VIAGEM: 'Em viagem',
  SEM_VIAGEM: 'Sem viagem',
} as const;

router.get(
  '/lookup',
  authorize(Role.ADMIN, Role.OPERACAO, Role.CONSULTA),
  async (req: AuthRequest, res) => {
    const filter = cargoLookupFilter(String(req.query.q ?? ''));
    if (!filter) {
      return res.status(400).json({ error: 'Informe o chassi ou a nota fiscal.' });
    }

    const items = await prisma.cargoItem.findMany({
      where: filter.invoiceKey
        ? { OR: [{ chassis: filter.chassis }, { invoiceKey: filter.invoiceKey }] }
        : { chassis: filter.chassis },
      include: {
        dealership: { select: { name: true, city: true } },
        route: {
          select: {
            name: true,
            date: true,
            trips: {
              where: { status: { not: TripStatus.CANCELADO } },
              select: {
                status: true,
                returnedAt: true,
                departureAt: true,
                vehicle: { select: { plate: true } },
              },
            },
          },
        },
      },
      take: 80,
    });

    const matches = items
      .map((item) => {
        const delivery = cargoDelivery(
          item.route.trips.map((trip) => ({
            status: trip.status,
            returnedAt: trip.returnedAt,
            departureAt: trip.departureAt,
            plate: trip.vehicle.plate,
          })),
        );
        return {
          id: item.id,
          chassis: item.chassis,
          invoiceNumber: item.invoiceNumber || null,
          model: item.model,
          dealershipName: item.dealership?.name ?? null,
          city: item.dealership?.city ?? null,
          routeName: item.route.name,
          routeDate: item.route.date.toISOString(),
          plate: delivery.plate,
          situation: delivery.situation,
          situationLabel: SITUATION_LABEL[delivery.situation],
          deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
        };
      })
      .sort((a, b) => {
        if (a.situation === 'ENTREGUE' && b.situation !== 'ENTREGUE') return -1;
        if (b.situation === 'ENTREGUE' && a.situation !== 'ENTREGUE') return 1;
        const aTime = a.deliveredAt ? Date.parse(a.deliveredAt) : Date.parse(a.routeDate);
        const bTime = b.deliveredAt ? Date.parse(b.deliveredAt) : Date.parse(b.routeDate);
        return bTime - aTime;
      });

    res.json({ q: filter.chassis, matches });
  },
);

export default router;
