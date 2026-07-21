import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { Role, VehicleType, VehicleStatus, AllowedVehicleType } from '../types/enums';
import {
  CITY_COORDS,
  normalizeCityKey,
  distanceFromBase,
  avgTravelDaysFromDistance,
  inferState,
} from '../utils/geo';

interface VehicleSeed {
  plate: string;
  plateDisplay?: string;
  capacityMotos: number;
  defaultDriver: string | null;
}

interface DealershipSeed {
  code: string;
  name: string;
  city: string;
  phone?: string;
  regionCode?: string;
}

function dataPath(filename: string): string {
  const candidates = [
    join(process.cwd(), 'prisma', 'data', filename),
    join(process.cwd(), 'api', 'prisma', 'data', filename),
    join(__dirname, '..', '..', 'prisma', 'data', filename),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Arquivo de dados não encontrado: ${filename}`);
  return found;
}

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(dataPath(filename), 'utf-8')) as T;
}

/**
 * Garante usuários de produção (upsert).
 * Padrão: lsl@.com (Admin) e ag@.com (Operação).
 */
export async function ensureBootstrapUsers(prisma: PrismaClient): Promise<void> {
  const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'lsl@.com').trim().toLowerCase();
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'lsl123';
  const adminName = process.env.BOOTSTRAP_ADMIN_NAME || 'LSL Admin';

  const opsEmail = (process.env.BOOTSTRAP_OPS_EMAIL || 'ag@.com').trim().toLowerCase();
  const opsPassword = process.env.BOOTSTRAP_OPS_PASSWORD || 'ag123';
  const opsName = process.env.BOOTSTRAP_OPS_NAME || 'AG Operação';

  const adminHash = await bcrypt.hash(adminPassword, 10);
  const opsHash = await bcrypt.hash(opsPassword, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      name: adminName,
      email: adminEmail,
      passwordHash: adminHash,
      role: Role.ADMIN,
      active: true,
    },
    update: {
      name: adminName,
      passwordHash: adminHash,
      role: Role.ADMIN,
      active: true,
    },
  });

  await prisma.user.upsert({
    where: { email: opsEmail },
    create: {
      name: opsName,
      email: opsEmail,
      passwordHash: opsHash,
      role: Role.OPERACAO,
      active: true,
    },
    update: {
      name: opsName,
      passwordHash: opsHash,
      role: Role.OPERACAO,
      active: true,
    },
  });

  // Desativa logins antigos de bootstrap/demo (se existirem)
  const legacy = [
    'admin@frotatms.app',
    'operacao@frotatms.app',
    'a@a.com',
    'o@o.com',
    'c@c.com',
    'admin@frotatms.com',
    'operacao@frotatms.com',
  ].filter((e) => e !== adminEmail && e !== opsEmail);

  if (legacy.length > 0) {
    await prisma.user.updateMany({
      where: { email: { in: legacy } },
      data: { active: false },
    });
  }

  console.log(`Usuários de acesso: Admin ${adminEmail} · Operação ${opsEmail}`);
}

/** @deprecated use ensureBootstrapUsers */
export async function bootstrapAdminIfEmpty(prisma: PrismaClient): Promise<void> {
  await ensureBootstrapUsers(prisma);
}

/**
 * Restaura frota + concessionárias (+ mesa) se estiverem vazios.
 * NÃO apaga usuários. Pode limpar roteiros/viagens ao restaurar.
 */
export async function bootstrapReferenceDataIfEmpty(prisma: PrismaClient): Promise<void> {
  const force = process.env.RESTORE_OPS_DATA === 'true';
  const vehicleCount = await prisma.vehicle.count();
  const dealershipCount = await prisma.dealership.count();

  if (!force && vehicleCount > 0 && dealershipCount > 0) {
    return;
  }

  console.log(
    force
      ? 'RESTORE_OPS_DATA=true — reimportando frota/concessionárias (usuários preservados)...'
      : 'Dados operacionais vazios — importando frota/concessionárias...',
  );

  // Limpa só o operacional transitório (roteiros podem ser apagados)
  await prisma.auditLog.deleteMany();
  await prisma.vehicleHistory.deleteMany();
  await prisma.plateUnavailability.deleteMany();
  await prisma.planningCity.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.routeProduct.deleteMany();
  await prisma.routeVehicle.deleteMany();
  await prisma.routeDealership.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.route.deleteMany();
  await prisma.priorityProduct.deleteMany();
  await prisma.dealership.deleteMany();
  await prisma.vehicle.deleteMany();
  // Driver pode existir — limpa para re-sincronizar das placas
  try {
    await prisma.driver.deleteMany();
  } catch {
    /* modelo pode não existir em schema antigo */
  }

  const dealershipRows = loadJson<DealershipSeed[]>('dealerships.json');
  for (const d of dealershipRows) {
    const cityKey = normalizeCityKey(d.city);
    const coords = CITY_COORDS[cityKey];
    if (!coords) {
      console.warn(`Sem coordenadas para cidade: ${d.city} — pulando`);
      continue;
    }
    const distanceKm = Math.round(distanceFromBase(coords.lat, coords.lng) * 10) / 10;
    const avgTravelDays = avgTravelDaysFromDistance(distanceKm);
    const region =
      d.regionCode !== undefined && d.regionCode !== '' ? `Região ${d.regionCode}` : d.city;
    await prisma.dealership.create({
      data: {
        code: d.code,
        name: d.name,
        city: d.city,
        state: inferState(d.city),
        region,
        phone: d.phone || null,
        distanceKm,
        avgTravelDays,
        allowedVehicle: AllowedVehicleType.AMBOS,
        active: true,
      },
    });
  }

  const vehicleRows = loadJson<VehicleSeed[]>('vehicles.json');
  for (const v of vehicleRows) {
    const plate = v.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    await prisma.vehicle.create({
      data: {
        plate,
        type: VehicleType.TRUCK,
        brand: '—',
        model: '—',
        year: 2020,
        capacityMotos: v.capacityMotos,
        defaultDriver: v.defaultDriver,
        status: VehicleStatus.DISPONIVEL,
        notes: v.plateDisplay && v.plateDisplay !== plate ? `Placa original: ${v.plateDisplay}` : null,
      },
    });
  }

  const sampleCities = await prisma.dealership.findMany({
    where: { active: true },
    orderBy: { city: 'asc' },
    take: 12,
  });
  const seen = new Set<string>();
  for (const d of sampleCities) {
    const key = d.city.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    await prisma.planningCity.create({
      data: {
        city: d.city.trim(),
        state: d.state,
        noteCount: 4 + Math.floor(Math.random() * 15),
        dealershipId: d.id,
        source: 'OPS',
        status: 'PENDENTE',
      },
    });
  }

  const vehicles = await prisma.vehicle.count();
  const dealerships = await prisma.dealership.count();
  console.log(`Dados restaurados: ${vehicles} veículos, ${dealerships} concessionárias.`);
}
