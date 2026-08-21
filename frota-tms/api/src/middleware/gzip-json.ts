import type { Request, Response, NextFunction } from 'express';
import { gzipSync } from 'zlib';

const MIN_BYTES = 1024;

/** Comprime JSON grande (lista de roteiros ~800 KB) sem pacote extra. */
export function gzipJson(req: Request, res: Response, next: NextFunction) {
  const accept = String(req.headers['accept-encoding'] || '');
  if (!/\bgzip\b/i.test(accept)) return next();

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    try {
      const payload = Buffer.from(JSON.stringify(body ?? null));
      if (payload.length < MIN_BYTES) return originalJson(body);
      const compressed = gzipSync(payload);
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Length', String(compressed.length));
      res.setHeader('Vary', 'Accept-Encoding');
      return res.status(res.statusCode).end(compressed);
    } catch {
      return originalJson(body);
    }
  }) as typeof res.json;

  next();
}
