import type { Prisma, PrismaClient } from '@prisma/client';
import { RouteStatus, TripStatus, VehicleStatus } from '../types/enums';
import { normalizePlate, plateOwner } from '../data/operatorVisibility';
import { resolveTravelFromPad, type FleetOwner } from '../utils/geo';
import { expectedReturnDate, isOverdue, routeDepartureAt } from '../utils/status';
import { parseChronusPlateHint } from './chronus-plate-hint';
import {
  applyChronusRouteRefresh,
  chronusDealershipLoadRow,
  chronusDestinationsByDealershipId,
  chronusRouteLoadData,
  type ChronusImportPreview,
  type ChronusManifestPreview,
  type ChronusRow,
} from './chronus-import';

export const CHRONUS_IN_TRANSIT_NOTE = 'Recuperado do Chronus (saídas em trânsito)';

export type ChronusInTransitSkipReason =
  | 'NO_REAL_PLATE'
  | 'FICTIONAL_PLATE'
  | 'NOT_DEPARTED'
  | 'ALREADY_ARRIVED'
  | 'PLATE_NOT_IN_FLEET'
  | 'PLATE_UNAVAILABLE'
  | 'DUPLICATE_PLATE'
  | 'NO_DRIVER'
  | 'ALREADY_IN_TRANSIT'
  | 'ALREADY_DONE';

export const IN_TRANSIT_SKIP_LABEL: Record<ChronusInTransitSkipReason, string> = {
  NO_REAL_PLATE: 'Sem placa real no Chronus',
  FICTIONAL_PLATE: 'Placa fictícia (LSL/AG capacidade) — use o import de carga',
  NOT_DEPARTED: 'Ainda em estoque (não saiu para entrega)',
  ALREADY_ARRIVED: 'Já tem data de chegada — não está em trânsito',
  PLATE_NOT_IN_FLEET: 'Placa não cadastrada na frota',
  PLATE_UNAVAILABLE: 'Placa indisponível (em viagem, manutenção ou bloqueada)',
  DUPLICATE_PLATE: 'Mesma placa em outro manifesto deste arquivo',
  NO_DRIVER: 'Motorista do Chronus/placa não está cadastrado',
  ALREADY_IN_TRANSIT: 'Roteiro já está em andamento',
  ALREADY_DONE: 'Roteiro já concluído',
};

export type FleetVehicleForTransit = {
  id: string;
  plate: string;
  status: string;
  type: string;
  capacityMotos: number;
  defaultDriver: string | null;
  owner: string | null;
  maintenanceHold?: boolean | null;
};

export type CatalogDriver = { id: string; name: string };

export function normalizePersonName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function matchDriverName(
  raw: string | null | undefined,
  drivers: CatalogDriver[],
): CatalogDriver | null {
  const key = normalizePersonName(raw ?? '');
  if (!key) return null;
  return drivers.find((d) => normalizePersonName(d.name) === key) ?? null;
}

export function mostCommonNonEmpty(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export function pickManifestRealPlate(plates: string[]): {
  plate: string | null;
  fictionalOnly: boolean;
} {
  const unique = [...new Set(plates.map((p) => p.trim()).filter(Boolean))];
  if (unique.length === 0) return { plate: null, fictionalOnly: false };

  const real = unique.filter((p) => !parseChronusPlateHint(p)?.isFictional);
  if (real.length === 0) return { plate: null, fictionalOnly: true };

  const counts = new Map<string, number>();
  for (const plate of plates) {
    const trimmed = plate.trim();
    if (!trimmed || parseChronusPlateHint(trimmed)?.isFictional) continue;
    const key = normalizePlate(trimmed);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let bestKey: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  const original = real.find((p) => normalizePlate(p) === bestKey) ?? real[0] ?? null;
  return { plate: original, fictionalOnly: false };
}

function normStatus(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Uma linha ainda está na rua (saiu e não chegou). */
export function chronusRowInTransitKind(
  row: Pick<ChronusRow, 'plate' | 'status' | 'sentAt' | 'arrivedAt'>,
): 'in_transit' | 'not_departed' | 'arrived' | 'fictional' | 'no_plate' {
  const plate = row.plate.trim();
  if (!plate) return 'no_plate';
  if (parseChronusPlateHint(plate)?.isFictional) return 'fictional';

  const status = normStatus(row.status);
  const arrived = !!row.arrivedAt.trim();
  const sent = !!row.sentAt.trim();

  if (
    status.includes('entregue') ||
    status.includes('devolvid') ||
    status.includes('cancel')
  ) {
    return 'arrived';
  }
  if (arrived) return 'arrived';
  if (status.includes('estoque') && !sent) return 'not_departed';
  return 'in_transit';
}

export type InTransitAssignment = {
  skipReason: ChronusInTransitSkipReason | null;
  plate: string | null;
  vehicle: FleetVehicleForTransit | null;
  driverName: string | null;
};

export function resolveManifestInTransit(
  items: ChronusRow[],
  opts: {
    fleet: FleetVehicleForTransit[];
    drivers: CatalogDriver[];
    busyVehicleIds: Set<string>;
    claimedVehicleIds: Set<string>;
  },
): InTransitAssignment {
  const kinds = items.map((row) => chronusRowInTransitKind(row));
  if (kinds.every((k) => k === 'no_plate')) {
    return { skipReason: 'NO_REAL_PLATE', plate: null, vehicle: null, driverName: null };
  }
  if (kinds.every((k) => k === 'fictional' || k === 'no_plate')) {
    return { skipReason: 'FICTIONAL_PLATE', plate: null, vehicle: null, driverName: null };
  }
  if (kinds.every((k) => k === 'arrived' || k === 'fictional' || k === 'no_plate')) {
    return { skipReason: 'ALREADY_ARRIVED', plate: null, vehicle: null, driverName: null };
  }
  if (kinds.every((k) => k === 'not_departed' || k === 'fictional' || k === 'no_plate')) {
    return { skipReason: 'NOT_DEPARTED', plate: null, vehicle: null, driverName: null };
  }

  const inTransitRows = items.filter((row) => chronusRowInTransitKind(row) === 'in_transit');
  const { plate, fictionalOnly } = pickManifestRealPlate(inTransitRows.map((r) => r.plate));
  if (!plate) {
    return {
      skipReason: fictionalOnly ? 'FICTIONAL_PLATE' : 'NO_REAL_PLATE',
      plate: null,
      vehicle: null,
      driverName: null,
    };
  }

  const plateKey = normalizePlate(plate);
  const vehicle = opts.fleet.find((v) => normalizePlate(v.plate) === plateKey) ?? null;
  if (!vehicle) {
    return { skipReason: 'PLATE_NOT_IN_FLEET', plate, vehicle: null, driverName: null };
  }
  if (opts.claimedVehicleIds.has(vehicle.id)) {
    return { skipReason: 'DUPLICATE_PLATE', plate, vehicle, driverName: null };
  }
  if (
    vehicle.status !== VehicleStatus.DISPONIVEL ||
    vehicle.maintenanceHold ||
    opts.busyVehicleIds.has(vehicle.id)
  ) {
    return { skipReason: 'PLATE_UNAVAILABLE', plate, vehicle, driverName: null };
  }

  const chronusDriver = mostCommonNonEmpty(inTransitRows.map((r) => r.driverName));
  const driver =
    matchDriverName(chronusDriver, opts.drivers) ??
    matchDriverName(vehicle.defaultDriver, opts.drivers);
  if (!driver) {
    return { skipReason: 'NO_DRIVER', plate, vehicle, driverName: chronusDriver };
  }

  return { skipReason: null, plate, vehicle, driverName: driver.name };
}

export function isChronusInTransitStartable(route: ChronusManifestPreview): boolean {
  return !!(
    route.inTransitEligible &&
    route.vehicleId &&
    route.assignedDriverName &&
    !route.skipReason &&
    route.unmatchedDealerCodes.length === 0 &&
    route.destinations.some((d) => d.matched)
  );
}

export function enrichChronusInTransitPreview(
  preview: ChronusImportPreview,
  rows: ChronusRow[],
  opts: {
    fleet: FleetVehicleForTransit[];
    drivers: CatalogDriver[];
    busyVehicleIds: Set<string>;
  },
): ChronusImportPreview {
  const byManifesto = new Map<string, ChronusRow[]>();
  for (const row of rows) {
    const list = byManifesto.get(row.manifesto) ?? [];
    list.push(row);
    byManifesto.set(row.manifesto, list);
  }

  const claimedVehicleIds = new Set<string>();
  const routes = preview.routes.map((route) => {
    const items = byManifesto.get(route.manifesto) ?? [];
    const assignment = resolveManifestInTransit(items, {
      fleet: opts.fleet,
      drivers: opts.drivers,
      busyVehicleIds: opts.busyVehicleIds,
      claimedVehicleIds,
    });

    let skipReason = assignment.skipReason;
    let canRefreshLoad = false;
    const dupStatus = route.duplicateRouteStatus ?? null;
    if (!skipReason && dupStatus === RouteStatus.EM_ANDAMENTO) {
      skipReason = 'ALREADY_IN_TRANSIT';
    } else if (!skipReason && dupStatus === RouteStatus.CONCLUIDO) {
      skipReason = 'ALREADY_DONE';
    } else if (
      !skipReason &&
      (dupStatus === RouteStatus.AGUARDANDO_PLACAS || dupStatus === RouteStatus.RASCUNHO)
    ) {
      canRefreshLoad = true;
    }

    const vehicle = assignment.vehicle;
    const eligible =
      !skipReason &&
      !!vehicle &&
      !!assignment.driverName &&
      route.unmatchedDealerCodes.length === 0;
    if (eligible && vehicle) claimedVehicleIds.add(vehicle.id);
    const owner = vehicle ? plateOwner(vehicle.plate, vehicle.owner) : null;

    return {
      ...route,
      plateHint: assignment.plate ?? route.plateHint,
      plateHintIsFictional: false,
      requiredFleetOwner: owner,
      requiredCapacityMotos: vehicle?.capacityMotos ?? route.requiredCapacityMotos,
      canRefreshLoad,
      inTransitEligible: eligible,
      assignedPlate: assignment.plate,
      vehicleId: vehicle?.id ?? null,
      vehicleAvailable: eligible,
      assignedDriverName: assignment.driverName,
      skipReason,
      skipLabel: skipReason ? IN_TRANSIT_SKIP_LABEL[skipReason] : null,
    } satisfies ChronusManifestPreview;
  });

  return { ...preview, inTransit: true, routes };
}

type DealershipForPad = {
  id: string;
  name: string;
  city: string;
  distanceKm: number;
  avgTravelDays: number;
  allowedVehicle: string;
};

function farthestDealershipFromPad(
  dealerships: DealershipForPad[],
  owner?: FleetOwner | null,
) {
  const enriched = dealerships.map((d) => {
    const travel = resolveTravelFromPad({
      city: d.city,
      distanceKm: d.distanceKm,
      avgTravelDays: d.avgTravelDays,
      owner,
    });
    return {
      ...d,
      padDistanceKm: travel.distanceKm,
      padAvgTravelDays: travel.avgTravelDays,
      padSource: travel.source,
    };
  });
  return [...enriched].sort((a, b) => {
    if (b.padDistanceKm !== a.padDistanceKm) return b.padDistanceKm - a.padDistanceKm;
    return b.padAvgTravelDays - a.padAvgTravelDays;
  })[0]!;
}

function vehicleBlockedAtStop(
  vehicleType: string,
  dealerships: DealershipForPad[],
): DealershipForPad | null {
  for (const d of dealerships) {
    if (d.allowedVehicle !== 'AMBOS' && d.allowedVehicle !== vehicleType) return d;
  }
  return null;
}

export async function startChronusInTransitTrip(
  tx: Prisma.TransactionClient,
  args: {
    routeId: string;
    routeName: string;
    vehicleId: string;
    driverName: string;
    assignedById: string;
    dealerships: DealershipForPad[];
    departureAt: Date;
  },
) {
  const vehicle = await tx.vehicle.findUnique({ where: { id: args.vehicleId } });
  if (!vehicle) {
    throw Object.assign(new Error('Veículo não encontrado'), { status: 404 });
  }

  const blockedBy = vehicleBlockedAtStop(vehicle.type, args.dealerships);
  if (blockedBy) {
    throw Object.assign(
      new Error(
        `Placa ${vehicle.plate} (${vehicle.type}) não permitida em ${blockedBy.name}`,
      ),
      { status: 400 },
    );
  }

  const claimed = await tx.vehicle.updateMany({
    where: { id: vehicle.id, status: VehicleStatus.DISPONIVEL },
    data: { status: VehicleStatus.EM_VIAGEM },
  });
  if (claimed.count !== 1) {
    throw Object.assign(new Error(`Placa ${vehicle.plate} não está disponível`), { status: 400 });
  }

  const openTrip = await tx.trip.findFirst({
    where: {
      vehicleId: vehicle.id,
      status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] },
    },
  });
  if (openTrip) {
    throw Object.assign(new Error(`Placa ${vehicle.plate} já está em outro roteiro/viagem`), {
      status: 409,
    });
  }

  const owner = plateOwner(vehicle.plate, vehicle.owner);
  const farthest = farthestDealershipFromPad(args.dealerships, owner);
  const expectedReturn = expectedReturnDate(args.departureAt, farthest.padAvgTravelDays);
  const destNames = args.dealerships.map((d) => d.name).join(', ');

  await tx.routeVehicle.upsert({
    where: { routeId_vehicleId: { routeId: args.routeId, vehicleId: vehicle.id } },
    create: { routeId: args.routeId, vehicleId: vehicle.id },
    update: { assignedAt: new Date() },
  });

  const trip = await tx.trip.create({
    data: {
      vehicleId: vehicle.id,
      dealershipId: farthest.id,
      routeId: args.routeId,
      driverName: args.driverName,
      departureAt: args.departureAt,
      expectedReturn,
      assignedById: args.assignedById,
      status: isOverdue(expectedReturn, null) ? TripStatus.ATRASADO : TripStatus.EM_ANDAMENTO,
      notes: CHRONUS_IN_TRANSIT_NOTE,
    },
  });

  await tx.vehicleHistory.create({
    data: {
      vehicleId: vehicle.id,
      userId: args.assignedById,
      tripId: trip.id,
      action: 'SAIDA',
      fromStatus: VehicleStatus.DISPONIVEL,
      toStatus: VehicleStatus.EM_VIAGEM,
      details: `Roteiro ${args.routeName} → ${destNames} (retorno: ${farthest.name}, ${farthest.padDistanceKm} km do PAD, ${farthest.padAvgTravelDays} dias · ${owner}) · ${CHRONUS_IN_TRANSIT_NOTE}`,
    },
  });

  return { trip, farthest, owner, expectedReturn, plate: vehicle.plate };
}

export type ChronusInTransitCommitResult = {
  started: number;
  created: number;
  attached: number;
  skipped: { manifesto: string; name: string; reason: string }[];
  plates: string[];
};

export async function commitChronusInTransitRoutes(
  prisma: PrismaClient,
  preview: ChronusImportPreview,
  userId: string,
): Promise<ChronusInTransitCommitResult> {
  const toStart = preview.routes.filter(isChronusInTransitStartable);
  const skipped: ChronusInTransitCommitResult['skipped'] = preview.routes
    .filter((r) => !isChronusInTransitStartable(r))
    .map((r) => ({
      manifesto: r.manifesto,
      name: r.name,
      reason: r.skipLabel ?? IN_TRANSIT_SKIP_LABEL[r.skipReason ?? 'NO_REAL_PLATE'],
    }));

  const plates: string[] = [];
  let created = 0;
  let attached = 0;

  for (const item of toStart) {
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const uniqueIds: string[] = [];
        const seen = new Set<string>();
        for (const dest of item.destinations) {
          if (!dest.dealershipId || seen.has(dest.dealershipId)) continue;
          seen.add(dest.dealershipId);
          uniqueIds.push(dest.dealershipId);
        }
        const dealers = await tx.dealership.findMany({ where: { id: { in: uniqueIds } } });
        const dealerById = new Map(dealers.map((d) => [d.id, d]));
        const ordered = uniqueIds
          .map((id) => dealerById.get(id))
          .filter((d): d is (typeof dealers)[number] => !!d);
        if (ordered.length === 0) {
          throw Object.assign(new Error('Roteiro sem concessionárias'), { status: 400 });
        }

        const region = [...new Set(ordered.map((d) => d.region))].join(' / ');
        const destByDealerId = chronusDestinationsByDealershipId(item.destinations);
        let routeId = item.duplicateRouteId;
        let kind: 'created' | 'attached' = 'created';

        if (routeId) {
          const claim = await tx.route.updateMany({
            where: {
              id: routeId,
              status: { in: [RouteStatus.AGUARDANDO_PLACAS, RouteStatus.RASCUNHO] },
              vehicles: { none: {} },
              trips: {
                none: { status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO] } },
              },
            },
            data: { status: RouteStatus.EM_ANDAMENTO, plannedVehicleCount: 1 },
          });
          if (claim.count !== 1) {
            throw Object.assign(new Error('Roteiro já tem placa ou não está aguardando'), {
              status: 409,
            });
          }
          await applyChronusRouteRefresh(tx, routeId, item);
          kind = 'attached';
        } else {
          const route = await tx.route.create({
            data: {
              name: item.name,
              date: new Date(`${item.date}T12:00:00.000Z`),
              dealershipId: ordered[0]?.id,
              region,
              ...chronusRouteLoadData(item),
              plannedVehicleCount: 1,
              status: RouteStatus.EM_ANDAMENTO,
              readyForOperation: true,
              sentToOperationAt: new Date(),
              sentToOperationById: userId,
              createdById: userId,
              dealerships: {
                create: ordered.map((d) => {
                  const dest = destByDealerId.get(d.id);
                  return chronusDealershipLoadRow(d.id, dest?.order ?? 0, dest);
                }),
              },
            },
            select: { id: true },
          });
          routeId = route.id;
        }

        const started = await startChronusInTransitTrip(tx, {
          routeId,
          routeName: item.name,
          vehicleId: item.vehicleId!,
          driverName: item.assignedDriverName!,
          assignedById: userId,
          dealerships: ordered,
          departureAt: routeDepartureAt(item.date),
        });
        return { kind, plate: started.plate };
      });
      if (outcome.kind === 'attached') attached += 1;
      else created += 1;
      plates.push(outcome.plate);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao iniciar viagem';
      skipped.push({ manifesto: item.manifesto, name: item.name, reason: message });
    }
  }

  return {
    started: plates.length,
    created,
    attached,
    skipped,
    plates,
  };
}
