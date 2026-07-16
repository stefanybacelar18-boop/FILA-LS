import { prisma } from '../lib/prisma';

export async function audit(
  action: string,
  entity: string,
  opts: { userId?: string; entityId?: string; details?: string; ip?: string } = {}
) {
  await prisma.auditLog.create({
    data: {
      action,
      entity,
      userId: opts.userId,
      entityId: opts.entityId,
      details: opts.details,
      ip: opts.ip,
    },
  });
}
