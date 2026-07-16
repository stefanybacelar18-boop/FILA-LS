import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { Role, VehicleType, VehicleStatus, AllowedVehicleType } from '../src/types/enums';
import {
  CITY_COORDS,
  normalizeCityKey,
  distanceFromBase,
  avgTravelDaysFromDistance,
  inferState,
} from '../src/utils/geo';

const prisma = new PrismaClient();

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

function loadJson<T>(filename: string): T {
  const path = join(__dirname, 'data', filename);
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

async function main() {
  console.log('Seeding FrotaTMS (real ops data)...');

  await prisma.auditLog.deleteMany();
  await prisma.vehicleHistory.deleteMany();
  await prisma.routeProduct.deleteMany();
  await prisma.routeVehicle.deleteMany();
  await prisma.routeDealership.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.route.deleteMany();
  await prisma.priorityProduct.deleteMany();
  await prisma.dealership.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.create({
    data: {
      name: 'Administrador',
      email: 'admin@frotatms.com',
      passwordHash: await bcrypt.hash('admin123', 10),
      role: Role.ADMIN,
    },
  });
  await prisma.user.create({
    data: {
      name: 'Operação Placas',
      email: 'operacao@frotatms.com',
      passwordHash: await bcrypt.hash('operacao123', 10),
      role: Role.OPERACAO,
    },
  });
  await prisma.user.create({
    data: {
      name: 'Consulta',
      email: 'consulta@frotatms.com',
      passwordHash: await bcrypt.hash('consulta123', 10),
      role: Role.CONSULTA,
    },
  });

  const dealershipRows = loadJson<DealershipSeed[]>('dealerships.json');
  for (const d of dealershipRows) {
    const cityKey = normalizeCityKey(d.city);
    const coords = CITY_COORDS[cityKey];
    if (!coords) {
      throw new Error(`Missing coordinates for city: ${d.city}`);
    }
    const distanceKm = Math.round(distanceFromBase(coords.lat, coords.lng) * 10) / 10;
    const avgTravelDays = avgTravelDaysFromDistance(distanceKm);
    const region =
      d.regionCode !== undefined && d.regionCode !== ''
        ? `Região ${d.regionCode}`
        : d.city;
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

  const vehicleCount = await prisma.vehicle.count();
  const dealershipCount = await prisma.dealership.count();
  console.log('Seed OK');
  console.log(`  Vehicles: ${vehicleCount}`);
  console.log(`  Dealerships: ${dealershipCount}`);
  console.log('Users:');
  console.log('  admin@frotatms.com / admin123');
  console.log('  operacao@frotatms.com / operacao123');
  console.log('  consulta@frotatms.com / consulta123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
