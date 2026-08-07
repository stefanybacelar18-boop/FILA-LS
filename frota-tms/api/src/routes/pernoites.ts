import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { Role } from '../types/enums';
import { fetchLslPernoitesForPeriod } from '../lib/pernoite-service';
import { payrollPeriodForDate, payrollPeriodOffset } from '../utils/pernoite';

const router = Router();
router.use(authenticate);
router.use(authorize(Role.ADMIN, Role.CONSULTA));

router.get('/', async (req, res) => {
  const offset = Number(req.query.offset ?? 0);
  const safeOffset = Number.isFinite(offset) ? Math.trunc(offset) : 0;
  const period = payrollPeriodOffset(new Date(), safeOffset);
  const data = await fetchLslPernoitesForPeriod(period);

  res.json({
    period: {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      label: period.label,
      offset: safeOffset,
    },
    summary: {
      totalPernoites: data.totalPernoites,
      totalTrips: data.totalTrips,
      driversWithPernoites: data.ranking.length,
    },
    ranking: data.ranking,
    trips: data.trips.map((t) => ({
      ...t,
      departureAt: t.departureAt.toISOString(),
      expectedReturn: t.expectedReturn.toISOString(),
      returnedAt: t.returnedAt?.toISOString() ?? null,
    })),
  });
});

export { payrollPeriodForDate };
export default router;
