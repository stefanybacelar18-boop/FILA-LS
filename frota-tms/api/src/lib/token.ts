/**
 * Verificação de JWT reutilizável (HTTP middleware + Socket.IO).
 */
import jwt from 'jsonwebtoken';
import { Role } from '../types/enums';
import { prisma } from './prisma';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret === 'dev-secret' || secret.length < 24) {
      throw new Error('JWT_SECRET forte é obrigatório em produção');
    }
  }
  return secret || 'dev-secret';
}

export async function resolveAuthUserFromToken(token: string): Promise<AuthUser | null> {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as AuthUser;
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    if (!dbUser || !dbUser.active) return null;
    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role as Role,
    };
  } catch {
    return null;
  }
}
