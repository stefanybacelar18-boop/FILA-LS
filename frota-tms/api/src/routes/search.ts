import { Router } from 'express';
import { Role } from '../types/enums';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  filterPlatesForRole,
  isDriverHiddenFromOperator,
  isPlateHiddenFromOperator,
} from '../data/operatorVisibility';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ results: [] });
  const isAdmin = req.user?.role === Role.ADMIN;
  const role = req.user?.role;

  const [vehicles, dealerships, trips, routes] = await Promise.all([
    prisma.vehicle.findMany({
      where: {
        OR: [
          { plate: { contains: q } },
          { model: { contains: q } },
          { brand: { contains: q } },
          { defaultDriver: { contains: q } },
        ],
      },
      take: 24,
    }),
    prisma.dealership.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { city: { contains: q } },
          { state: { contains: q } },
          { region: { contains: q } },
        ],
      },
      take: 8,
    }),
    prisma.trip.findMany({
      where: {
        OR: [
          { driverName: { contains: q } },
          { vehicle: { plate: { contains: q } } },
        ],
      },
      include: { vehicle: true, dealership: true },
      take: 24,
    }),
    prisma.route.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { region: { contains: q } },
          { dealerships: { some: { dealership: { name: { contains: q } } } } },
        ],
      },
      include: {
        dealerships: { include: { dealership: true }, orderBy: { order: 'asc' } },
        dealership: true,
      },
      take: 8,
    }),
  ]);

  const visibleVehicles = filterPlatesForRole(role, vehicles).slice(0, 8);
  const visibleTrips = trips
    .filter((t) => {
      if (role !== Role.OPERACAO) return true;
      if (isPlateHiddenFromOperator(t.vehicle.plate)) return false;
      if (t.driverName && isDriverHiddenFromOperator(t.driverName)) return false;
      return true;
    })
    .slice(0, 8);

  const results = [
    ...visibleVehicles.map((v) => ({
      type: 'placa' as const,
      id: v.id,
      title: v.plate,
      subtitle: `${v.capacityMotos} motos · ${v.defaultDriver ?? 'sem motorista'} · ${v.status}`,
      href: `/frota/${v.id}`,
    })),
    ...dealerships
      .filter((d) => d.active !== false)
      .map((d) => ({
        type: 'concessionaria' as const,
        id: d.id,
        title: d.name,
        subtitle: `${d.city}/${d.state} · ${d.region}`,
        href: `/concessionarias`,
      })),
    ...visibleTrips
      .filter((t) => t.driverName)
      .map((t) => ({
        type: 'motorista' as const,
        id: t.id,
        title: t.driverName!,
        subtitle: `${t.vehicle.plate} → ${t.dealership.name}`,
        href: `/viagens`,
      })),
    ...routes.map((r) => {
      const names =
        r.dealerships.length > 0
          ? r.dealerships.map((rd) => rd.dealership.name).join(', ')
          : r.dealership?.name ?? '';
      return {
        type: 'roteiro' as const,
        id: r.id,
        title: r.name,
        subtitle: names,
        href: isAdmin ? `/roteiros/${r.id}` : `/roteiros`,
      };
    }),
  ];

  res.json({ results, q });
});

export default router;
