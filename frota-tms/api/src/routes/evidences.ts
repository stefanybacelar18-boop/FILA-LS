import { Router, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth';
import { resolveAuthUserFromToken } from '../lib/token';
import { paramId } from '../utils/params';

const router = Router();

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads/trip-evidence');

async function resolveUser(req: AuthRequest) {
  if (req.user) return req.user;
  const q = typeof req.query.token === 'string' ? req.query.token : '';
  const header = req.headers.authorization;
  const raw = q || (header?.startsWith('Bearer ') ? header.slice(7) : '');
  if (!raw) return null;
  return resolveAuthUserFromToken(raw);
}

function sendMissing(res: Response, filename: string) {
  const label = `/uploads/trip-evidence/${filename}`;
  res
    .status(404)
    .type('html')
    .send(
      `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Erro</title></head><body><p>Não foi possível obter o arquivo ${label}</p><p>O anexo pode ter sido perdido no último deploy. Peça à Operação para reenviar a evidência na justificativa.</p></body></html>`,
    );
}

/** Abre evidência (Bearer ou ?token=) — conteúdo no banco, com fallback em disco */
router.get('/:id', async (req: AuthRequest, res) => {
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ error: 'Não autenticado' });

  const evidence = await prisma.tripEvidence.findUnique({ where: { id: paramId(req) } });
  if (!evidence) return sendMissing(res, paramId(req));

  let buffer: Buffer | null = evidence.content ? Buffer.from(evidence.content) : null;
  if (!buffer || buffer.length === 0) {
    const diskPath = path.join(UPLOAD_DIR, evidence.filename);
    try {
      if (fs.existsSync(diskPath)) buffer = fs.readFileSync(diskPath);
    } catch {
      buffer = null;
    }
  }

  if (!buffer || buffer.length === 0) {
    return sendMissing(res, evidence.filename);
  }

  const safeName = evidence.originalName.replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 120);
  res.setHeader('Content-Type', evidence.mimeType || 'application/octet-stream');
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.send(buffer);
});

export default router;
