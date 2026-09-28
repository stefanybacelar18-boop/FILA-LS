import type { PrismaClient } from '@prisma/client';
import { OPERATOR_HIDDEN_PLATES, normalizePlate } from '../data/operatorVisibility';

const UEV4A13 = 'UEV4A13';
const UEV4A13_HISTORY_ACTION = 'OWNER_LSL_UEV4A13';

/**
 * Após criar a coluna `owner`, placas LSL históricas ficam AG (default).
 * Só preenche quando ainda não há nenhuma LSL gravada — não sobrescreve
 * alteração feita no cadastro.
 */
export async function backfillKnownLslOwners(prisma: PrismaClient): Promise<number> {
  const lslCount = await prisma.vehicle.count({ where: { owner: 'LSL' } });
  if (lslCount > 0) return 0;
  const result = await prisma.vehicle.updateMany({
    where: { plate: { in: [...OPERATOR_HIDDEN_PLATES] } },
    data: { owner: 'LSL' },
  });
  if (result.count > 0) {
    console.log(`Frota LSL gravada em ${result.count} placas conhecidas`);
  }
  return result.count;
}

/** Uma vez: UEV4A13 passa a ser frota LSL (não reverte se o Admin mudar depois). */
export async function applyUev4a13LslOwner(prisma: PrismaClient): Promise<boolean> {
  const already = await prisma.vehicleHistory.findFirst({
    where: { action: UEV4A13_HISTORY_ACTION },
    select: { id: true },
  });
  if (already) return false;

  const vehicles = await prisma.vehicle.findMany({
    select: { id: true, plate: true, owner: true },
  });
  const target = vehicles.find((v) => normalizePlate(v.plate) === UEV4A13);
  if (!target) return false;

  if (target.owner !== 'LSL') {
    await prisma.vehicle.update({
      where: { id: target.id },
      data: { owner: 'LSL' },
    });
  }

  await prisma.vehicleHistory.create({
    data: {
      vehicleId: target.id,
      action: UEV4A13_HISTORY_ACTION,
      details: 'Placa UEV4A13 marcada como frota LSL',
    },
  });
  console.log('Placa UEV4A13 ajustada para frota LSL');
  return true;
}

export async function ensureVehicleOwners(prisma: PrismaClient): Promise<void> {
  await backfillKnownLslOwners(prisma);
  await applyUev4a13LslOwner(prisma);
}
