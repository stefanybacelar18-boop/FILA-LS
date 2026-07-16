import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { daysUntilExpiry, priorityColor } from '../utils/status';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ results: [] });

  const [vehicles, dealerships, products, trips, routes] = await Promise.all([
    prisma.vehicle.findMany({
      where: {
        OR: [
          { plate: { contains: q } },
          { model: { contains: q } },
          { brand: { contains: q } },
        ],
      },
      take: 8,
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
    prisma.priorityProduct.findMany({
      where: {
        OR: [
          { product: { contains: q } },
          { code: { contains: q } },
          { lot: { contains: q } },
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
      take: 8,
    }),
    prisma.route.findMany({
      where: {
        OR: [{ name: { contains: q } }, { region: { contains: q } }],
      },
      include: { dealership: true },
      take: 8,
    }),
  ]);

  const results = [
    ...vehicles.map((v) => ({
      type: 'placa' as const,
      id: v.id,
      title: v.plate,
      subtitle: `${v.brand} ${v.model} · ${v.status}`,
      href: `/frota/${v.id}`,
    })),
    ...dealerships.map((d) => ({
      type: 'concessionaria' as const,
      id: d.id,
      title: d.name,
      subtitle: `${d.city}/${d.state} · ${d.region}`,
      href: `/concessionarias`,
    })),
    ...products.map((p) => {
      const days = daysUntilExpiry(p.expiryDate);
      return {
        type: 'produto' as const,
        id: p.id,
        title: p.product,
        subtitle: `Lote ${p.lot} · ${days} dias · ${priorityColor(days)}`,
        href: `/produtos`,
      };
    }),
    ...trips
      .filter((t) => t.driverName)
      .map((t) => ({
        type: 'motorista' as const,
        id: t.id,
        title: t.driverName!,
        subtitle: `${t.vehicle.plate} → ${t.dealership.name}`,
        href: `/viagens`,
      })),
    ...routes.map((r) => ({
      type: 'roteiro' as const,
      id: r.id,
      title: r.name,
      subtitle: r.dealership.name,
      href: `/roteiros/${r.id}`,
    })),
  ];

  res.json({ results, q });
});

export default router;
