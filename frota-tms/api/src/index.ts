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
import historyRoutes from './routes/history';
import searchRoutes from './routes/search';
import reportsRoutes from './routes/reports';
import { prisma } from './lib/prisma';
import { resolveAuthUserFromToken } from './lib/token';
import { resolveTravelFromPad } from './utils/geo';

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
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: 'frota-tms-api', db: 'up' });
  } catch {
    res.status(503).json({ ok: false, service: 'frota-tms-api', db: 'down' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/dealerships', dealershipRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/routes', createRoutesRouter(io));
app.use('/api/trips', createTripsRouter(io));
app.use('/api/planning', createPlanningRouter(io));
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/reports', reportsRoutes);

/** Evidências de atraso (fotos/PDF) */
const uploadsDir = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(path.join(uploadsDir, 'trip-evidence'), { recursive: true });
app.use('/uploads', express.static(uploadsDir));


app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

/** Serve built frontend (same origin) when available — ideal for demo/túnel público */
const webDistCandidates = [
  path.resolve(__dirname, '../../web/dist'),
  path.resolve(process.cwd(), '../web/dist'),
  path.resolve(process.cwd(), 'public'),
  path.resolve(__dirname, '../public'),
];
const webDist = webDistCandidates.find((p) => fs.existsSync(path.join(p, 'index.html')));
if (webDist) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/|\/socket\.io\/|\/uploads\/).*/, (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
  console.log(`Serving frontend from ${webDist}`);
}

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
  void syncDriversFromVehicles()
    .then((n) => {
      if (n > 0) console.log(`Motoristas sincronizados a partir das placas: ${n}`);
    })
    .catch((err) => console.warn('Sync de motoristas:', err?.message ?? err));

  // Atualiza dias de viagem (inclui regra de retorno no mesmo dia)
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
});

export { io };
