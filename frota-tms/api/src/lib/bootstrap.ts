import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { Role } from '../types/enums';

/**
 * Bootstrap seguro para produção (Render free sem Shell):
 * - Só cria usuários se o banco estiver VAZIO (não apaga dados).
 * - Credenciais via env (sem a@a.com / 1 de demo).
 */
export async function bootstrapAdminIfEmpty(prisma: PrismaClient): Promise<void> {
  const count = await prisma.user.count();
  if (count > 0) return;

  const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@frotatms.app').trim().toLowerCase();
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'TrocarSenha@2026';
  const adminName = process.env.BOOTSTRAP_ADMIN_NAME || 'Administrador';

  const opsEmail = (process.env.BOOTSTRAP_OPS_EMAIL || 'operacao@frotatms.app').trim().toLowerCase();
  const opsPassword = process.env.BOOTSTRAP_OPS_PASSWORD || 'TrocarSenha@2026';
  const opsName = process.env.BOOTSTRAP_OPS_NAME || 'Operação';

  await prisma.user.create({
    data: {
      name: adminName,
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: Role.ADMIN,
    },
  });

  await prisma.user.create({
    data: {
      name: opsName,
      email: opsEmail,
      passwordHash: await bcrypt.hash(opsPassword, 10),
      role: Role.OPERACAO,
    },
  });

  console.log(
    `Bootstrap: usuários iniciais criados (${adminEmail} / ${opsEmail}). Troque as senhas após o primeiro login.`,
  );
}
