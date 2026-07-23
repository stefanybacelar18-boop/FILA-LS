import { Router } from 'express';
import { Role } from '../types/enums';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import {
  mailStatus,
  notifyFirstRouteOfDay,
  getLastNotifyResult,
  firstRouteNotifyRecipients,
} from '../services/notify';
import { format } from 'date-fns';

/**
 * Diagnóstico e teste de e-mail do 1º roteiro (somente Admin).
 */
export function createNotifyRouter() {
  const router = Router();
  router.use(authenticate);

  router.get('/status', authorize(Role.ADMIN), (_req, res) => {
    res.json({
      ...mailStatus(),
      lastNotify: getLastNotifyResult(),
    });
  });

  /** Envia e-mail de teste agora (não depende de “1º do dia”). */
  router.post('/test', authorize(Role.ADMIN), async (req: AuthRequest, res) => {
    const result = await notifyFirstRouteOfDay({
      routeId: 'test',
      routeName: 'TESTE — primeiro roteiro do dia',
      routeDate: format(new Date(), 'dd/MM/yyyy'),
      createdByName: req.user?.name || 'Admin',
    });
    res.status(result.sent ? 200 : 502).json({
      ok: result.sent,
      recipients: firstRouteNotifyRecipients(),
      ...result,
    });
  });

  return router;
}
