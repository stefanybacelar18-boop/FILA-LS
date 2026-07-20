import { Request, Response, NextFunction } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { Role } from '../types/enums';
import { getJwtSecret, resolveAuthUserFromToken, type AuthUser } from '../lib/token';

export type { AuthUser };

export interface AuthRequest extends Request {
  user?: AuthUser;
}

const JWT_SECRET = getJwtSecret();

export function signToken(user: AuthUser): string {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as SignOptions['expiresIn'],
  };
  return jwt.sign({ ...user }, JWT_SECRET, options);
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  const user = await resolveAuthUserFromToken(header.slice(7));
  if (!user) {
    return res.status(401).json({ error: 'Token inválido, expirado ou usuário inativo' });
  }
  req.user = user;
  next();
}

export function authorize(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if (!roles.includes(req.user.role as Role)) {
      return res.status(403).json({ error: 'Sem permissão para esta ação' });
    }
    next();
  };
}
