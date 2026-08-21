import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import authRoutes from './routes/auth';
import vehicleRoutes from './routes/vehicles';
import dealershipRoutes from './routes/dealerships';
import driverRoutes, { syncDriversFromVehicles } from './routes/drivers';
import { createRoutesRouter } from './routes/routes';
import { createTripsRouter } from './routes/trips';
import { createPlanningRouter } from './routes/planning';
import dashboardRoutes from './routes/dashboard';
import pernoitesRoutes from './routes/pernoites';
import logbookRoutes from './routes/logbook';
import logbookPublicRoutes from './routes/logbookPublic';
import historyRoutes from './routes/history';
import searchRoutes from './routes/search';
import reportsRoutes from './routes/reports';
import justificationsRoutes from './routes/justifications';
import evidencesRoutes from './routes/evidences';
import publicDriverRoutes from './routes/publicDriver';
import { gzipJson } from './middleware/gzip-json';
import { prisma } from './lib/prisma';
import { healthPayload, probeDatabase } from './lib/health';
import { ensureHotIndexes } from './lib/ensure-indexes';
import { resolveAuthUserFromToken } from './lib/token';
import { resolveTravelFromPad } from './utils/geo';
import { bootstrapReferenceDataIfEmpty, ensureBootstrapUsers, ensureOpsDrivers } from './lib/bootstrap';
import { applyOneOffTripFixes } from './lib/one-off-trip-fixes';
import { captureApiException, initApiMonitoring } from './lib/monitoring';

initApiMonitoring();

const app = express();
const server = http.createServer(app);

const corsOrigin = process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? false : true);

const io = new Server(server, {
  cors: {
    origin: corsOrigin === '*' || corsOrigin === 'true' ? true : corsOrigin || false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  },
});

app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));
app.use(
  cors({
    origin: corsOrigin === '*' ? true : corsOrigin || true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(gzipJson);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/health', async (_req, res) => {
  const db = await probeDatabase(() => prisma.$queryRaw`SELECT 1`);
  res.status(200).json(
    healthPayload({
      db,
      uptimeSec: Math.floor(process.uptime()),
      commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || process.env.GIT_COMMIT?.slice(0, 7) || null,
    }),
  );
});

app.use('/api/auth', authRoutes);
app.use('/api/public', publicDriverRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/dealerships', dealershipRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/routes', createRoutesRouter(io));
app.use('/api/trips', createTripsRouter(io));
app.use('/api/planning', createPlanningRouter(io));
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/pernoites', pernoitesRoutes);
app.use('/api/public/diario-bordo', logbookPublicRoutes);
app.use('/api/logbook', logbookRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/justifications', justificationsRoutes);
app.use('/api/evidences', evidencesRoutes);

/** Evidências de atraso (fotos/PDF) — servidas apenas via /api/evidences/:id */
const uploadsDir = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(path.join(uploadsDir, 'trip-evidence'), { recursive: true });


app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  captureApiException(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

/** Serve built frontend (same origin). Prefer api/public (copiado no build do Render). */
const webDistCandidates = [
  path.resolve(process.cwd(), 'public'),
  path.resolve(__dirname, '../public'),
  path.resolve(__dirname, '../../web/dist'),
  path.resolve(process.cwd(), '../web/dist'),
];
const webDist = webDistCandidates.find((p) => fs.existsSync(path.join(p, 'index.html')));
if (webDist) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/|\/socket\.io\/|\/uploads\/).*/, (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
  console.log(`Serving frontend from ${webDist}`);
}

/** Fallback legado: se o arquivo sumiu do disco, aponta a mensagem clara */
app.use('/uploads', (req, res, next) => {
  if (res.headersSent) return next();
  const rel = req.path.replace(/^\/+/, '');
  res
    .status(404)
    .type('html')
    .send(
      `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Erro</title></head><body><p>Não foi possível obter o arquivo /uploads/${rel}</p><p>Anexos antigos podem ter sido perdidos no deploy. Novas justificativas passam a guardar o arquivo no banco — peça o reenvio se necessário.</p></body></html>`,
    );
});

io.use(async (socket, next) => {
  try {
    const token =
      (typeof socket.handshake.auth?.token === 'string' && socket.handshake.auth.token) ||
      (typeof socket.handshake.headers.authorization === 'string' &&
        socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')) ||
      '';
    if (!token) {
      return next(new Error('Não autenticado'));
    }
    const user = await resolveAuthUserFromToken(token);
    if (!user) {
      return next(new Error('Token inválido'));
    }
    socket.data.user = user;
    next();
  } catch {
    next(new Error('Falha na autenticação do socket'));
  }
});

io.on('connection', (socket) => {
  socket.emit('connected', { ok: true, userId: socket.data.user?.id });
});

const PORT = Number(process.env.PORT) || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`FrotaTMS listening on http://0.0.0.0:${PORT}`);
  void ensureBootstrapUsers(prisma).catch((err) =>
    console.warn('Bootstrap de usuários:', err?.message ?? err),
  );
  void bootstrapReferenceDataIfEmpty(prisma)
    .then(() => syncDriversFromVehicles())
    .then(() => ensureOpsDrivers(prisma))
    .then((n) => {
      if (typeof n === 'number' && n > 0) console.log(`Motoristas oficiais ativos: ${n}`);
    })
    .catch((err) => console.warn('Bootstrap/sync operacional:', err?.message ?? err));

  void applyOneOffTripFixes().catch((err) =>
    console.warn('Correções pontuais de viagem:', err?.message ?? err),
  );

  void ensureHotIndexes(prisma)
    .then(() => console.log('Índices de consulta conferidos'))
    .catch((err) => console.warn('Índices:', err?.message ?? err));

  // Distâncias PAD: só se pedirem — no boot compete com o tráfego no Render Free.
  if (process.env.SYNC_PAD_ON_START === 'true') {
    void (async () => {
      const all = await prisma.dealership.findMany();
      let n = 0;
      for (const d of all) {
        const travel = resolveTravelFromPad({
          city: d.city,
          distanceKm: d.distanceKm,
          avgTravelDays: d.avgTravelDays,
        });
        if (
          Math.abs(travel.distanceKm - d.distanceKm) > 0.05 ||
          Math.abs(travel.avgTravelDays - d.avgTravelDays) > 0.05
        ) {
          await prisma.dealership.update({
            where: { id: d.id },
            data: {
              distanceKm: travel.distanceKm,
              avgTravelDays: travel.avgTravelDays,
            },
          });
          n += 1;
        }
      }
      if (n > 0) console.log(`Concessionárias com previsão PAD atualizada: ${n}`);
    })().catch((err) => console.warn('Sync PAD dealerships:', err?.message ?? err));
  }
});

export { io };
