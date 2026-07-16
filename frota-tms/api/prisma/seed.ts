import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { addDays, subDays } from 'date-fns';
import {
  VehicleType,
  VehicleStatus,
  AllowedVehicleType,
  Role,
} from '../src/types/enums';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding FrotaTMS...');

  await prisma.auditLog.deleteMany();
  await prisma.vehicleHistory.deleteMany();
  await prisma.routeProduct.deleteMany();
  await prisma.routeVehicle.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.route.deleteMany();
  await prisma.priorityProduct.deleteMany();
  await prisma.dealership.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.create({
    data: {
      name: 'Administrador',
      email: 'admin@frotatms.com',
      passwordHash,
      role: Role.ADMIN,
    },
  });
  const operacao = await prisma.user.create({
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

  const dealerships = await Promise.all([
    prisma.dealership.create({
      data: {
        name: 'Concessionária Salvador',
        city: 'Salvador',
        state: 'BA',
        region: 'Recôncavo',
        distanceKm: 120,
        avgTravelDays: 3,
        allowedVehicle: AllowedVehicleType.AMBOS,
      },
    }),
    prisma.dealership.create({
      data: {
        name: 'Concessionária Vitória da Conquista',
        city: 'Vitória da Conquista',
        state: 'BA',
        region: 'Sudoeste',
        distanceKm: 510,
        avgTravelDays: 4,
        allowedVehicle: AllowedVehicleType.CARRETA,
      },
    }),
    prisma.dealership.create({
      data: {
        name: 'Concessionária Feira de Santana',
        city: 'Feira de Santana',
        state: 'BA',
        region: 'Portal do Sertão',
        distanceKm: 110,
        avgTravelDays: 2,
        allowedVehicle: AllowedVehicleType.AMBOS,
      },
    }),
    prisma.dealership.create({
      data: {
        name: 'Concessionária Recife',
        city: 'Recife',
        state: 'PE',
        region: 'Metropolitana',
        distanceKm: 840,
        avgTravelDays: 5,
        allowedVehicle: AllowedVehicleType.CARRETA,
      },
    }),
    prisma.dealership.create({
      data: {
        name: 'Concessionária Aracaju',
        city: 'Aracaju',
        state: 'SE',
        region: 'Litoral',
        distanceKm: 320,
        avgTravelDays: 3,
        allowedVehicle: AllowedVehicleType.TRUCK,
      },
    }),
  ]);

  const plates = [
    { plate: 'ABC1D23', type: VehicleType.TRUCK, brand: 'Volkswagen', model: 'Delivery', year: 2022, capacityKg: 8000 },
    { plate: 'DEF4G56', type: VehicleType.TRUCK, brand: 'Mercedes', model: 'Accelo', year: 2021, capacityKg: 9000 },
    { plate: 'GHI7J89', type: VehicleType.CARRETA, brand: 'Volvo', model: 'FH 460', year: 2023, capacityKg: 28000 },
    { plate: 'JKL0M12', type: VehicleType.CARRETA, brand: 'Scania', model: 'R450', year: 2022, capacityKg: 30000 },
    { plate: 'MNO3P45', type: VehicleType.TRUCK, brand: 'Ford', model: 'Cargo', year: 2020, capacityKg: 7500 },
    { plate: 'PQR6S78', type: VehicleType.CARRETA, brand: 'DAF', model: 'XF', year: 2024, capacityKg: 32000 },
    { plate: 'STU9V01', type: VehicleType.TRUCK, brand: 'Iveco', model: 'Tector', year: 2019, capacityKg: 8500, status: VehicleStatus.EM_MANUTENCAO },
    { plate: 'VWX2Y34', type: VehicleType.CARRETA, brand: 'Volvo', model: 'VM', year: 2021, capacityKg: 26000 },
  ];

  const vehicles = [];
  for (const p of plates) {
    vehicles.push(
      await prisma.vehicle.create({
        data: {
          plate: p.plate,
          type: p.type,
          brand: p.brand,
          model: p.model,
          year: p.year,
          capacityKg: p.capacityKg,
          status: p.status ?? VehicleStatus.DISPONIVEL,
          notes: null,
        },
      })
    );
  }

  await prisma.priorityProduct.createMany({
    data: [
      {
        product: 'Ração Premium Canina 15kg',
        code: 'RAC-001',
        lot: 'L2026A',
        quantity: 120,
        expiryDate: addDays(new Date(), 5),
        notes: 'Prioridade máxima',
      },
      {
        product: 'Ração Gatos Adulto 10kg',
        code: 'RAC-014',
        lot: 'L2026B',
        quantity: 80,
        expiryDate: addDays(new Date(), 12),
      },
      {
        product: 'Petisco Dental',
        code: 'PET-088',
        lot: 'L2025Z',
        quantity: 200,
        expiryDate: addDays(new Date(), 25),
      },
      {
        product: 'Areia Sanitária',
        code: 'ARE-003',
        lot: 'L2026C',
        quantity: 150,
        expiryDate: addDays(new Date(), 45),
      },
      {
        product: 'Shampoo Pet',
        code: 'HIG-022',
        lot: 'L2025X',
        quantity: 40,
        expiryDate: subDays(new Date(), 2),
        notes: 'Já vencido — retirar',
      },
      {
        product: 'Vermífugo Oral',
        code: 'MED-010',
        lot: 'L2026D',
        quantity: 60,
        expiryDate: new Date(),
      },
    ],
  });

  const route = await prisma.route.create({
    data: {
      name: 'Roteiro Salvador — Prioritário',
      date: new Date(),
      dealershipId: dealerships[0].id,
      region: dealerships[0].region,
      notes: 'Incluir cargas com vencimento próximo',
      hasPriority: true,
      createdById: admin.id,
    },
  });

  await prisma.route.create({
    data: {
      name: 'Roteiro Feira de Santana',
      date: addDays(new Date(), 1),
      dealershipId: dealerships[2].id,
      region: dealerships[2].region,
      createdById: admin.id,
      hasPriority: false,
    },
  });

  // Active trip returning today
  const tripVehicle = vehicles[2];
  await prisma.vehicle.update({
    where: { id: tripVehicle.id },
    data: { status: VehicleStatus.EM_VIAGEM },
  });
  await prisma.trip.create({
    data: {
      vehicleId: tripVehicle.id,
      dealershipId: dealerships[2].id,
      routeId: route.id,
      driverName: 'Carlos Souza',
      departureAt: subDays(new Date(), 2),
      expectedReturn: new Date(),
      assignedById: operacao.id,
      status: 'EM_ANDAMENTO',
    },
  });
  await prisma.routeVehicle.create({
    data: { routeId: route.id, vehicleId: tripVehicle.id },
  });

  // Overdue trip
  const overdueVehicle = vehicles[3];
  await prisma.vehicle.update({
    where: { id: overdueVehicle.id },
    data: { status: VehicleStatus.EM_VIAGEM },
  });
  await prisma.trip.create({
    data: {
      vehicleId: overdueVehicle.id,
      dealershipId: dealerships[1].id,
      driverName: 'João Lima',
      departureAt: subDays(new Date(), 6),
      expectedReturn: subDays(new Date(), 2),
      assignedById: operacao.id,
      status: 'ATRASADO',
    },
  });

  // Historical trips for plate ABC1D23
  const histVehicle = vehicles[0];
  for (const [i, d] of [
    { dest: dealerships[0], out: 20, ret: 17 },
    { dest: dealerships[1], out: 12, ret: 8 },
    { dest: dealerships[2], out: 5, ret: 3 },
  ].entries()) {
    await prisma.trip.create({
      data: {
        vehicleId: histVehicle.id,
        dealershipId: d.dest.id,
        departureAt: subDays(new Date(), d.out),
        expectedReturn: subDays(new Date(), d.ret + 1),
        returnedAt: subDays(new Date(), d.ret),
        assignedById: admin.id,
        returnedById: operacao.id,
        status: 'RETORNOU',
      },
    });
    await prisma.vehicleHistory.create({
      data: {
        vehicleId: histVehicle.id,
        userId: admin.id,
        action: 'SAIDA',
        toStatus: 'EM_VIAGEM',
        details: `Histórico ${i + 1} → ${d.dest.name}`,
        createdAt: subDays(new Date(), d.out),
      },
    });
    await prisma.vehicleHistory.create({
      data: {
        vehicleId: histVehicle.id,
        userId: operacao.id,
        action: 'RETORNO',
        toStatus: 'DISPONIVEL',
        details: `Retornou de ${d.dest.name}`,
        createdAt: subDays(new Date(), d.ret),
      },
    });
  }

  console.log('Seed OK');
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
