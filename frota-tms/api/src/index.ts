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
import { createRoutesRouter } from './routes/routes';
import { createTripsRouter } from './routes/trips';
import dashboardRoutes from './routes/dashboard';
import historyRoutes from './routes/history';
import searchRoutes from './routes/search';
import reportsRoutes from './routes/reports';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
});

app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'frota-tms-api' }));

app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/dealerships', dealershipRoutes);
app.use('/api/routes', createRoutesRouter(io));
app.use('/api/trips', createTripsRouter(io));
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/reports', reportsRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

/** Serve built frontend (same origin) when available — ideal for demo/túnel público */
const webDistCandidates = [
  path.resolve(__dirname, '../../web/dist'),
  path.resolve(process.cwd(), '../web/dist'),
  path.resolve(process.cwd(), 'public'),
];
const webDist = webDistCandidates.find((p) => fs.existsSync(path.join(p, 'index.html')));
if (webDist) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/|\/socket\.io\/).*/, (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
  console.log(`Serving frontend from ${webDist}`);
}

io.on('connection', (socket) => {
  socket.emit('connected', { ok: true });
});

const PORT = Number(process.env.PORT) || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`FrotaTMS listening on http://0.0.0.0:${PORT}`);
});

export { io };
