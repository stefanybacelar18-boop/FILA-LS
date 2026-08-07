import { prisma } from './prisma';
import { normalizePlate } from '../data/operatorVisibility';
import { TripStatus } from '../types/enums';
import {
  emptyChecklistState,
  LOGBOOK_FORM_CODE,
  LOGBOOK_STATUS_LABELS,
  logbookWorkflowStatus,
  parseChecklistJson,
  parseFuelingJson,
  type ChecklistState,
  type FuelingEntry,
  type LogbookWorkflowStatus,
} from './logbook-checklist';
import {
  buildInitialStops,
  emptyReportExtras,
  LOGBOOK_REPORT_FORM_CODE,
  parseReportExtrasJson,
  parseStopsJson,
  type LogbookReportExtras,
  type LogbookStopEntry,
  validateStopsForSubmit,
} from './logbook-report';

const tripInclude = {
  vehicle: { select: { id: true, plate: true, brand: true, model: true, defaultDriver: true } },
  dealership: { select: { id: true, name: true, city: true, state: true } },
  route: {
    select: {
      id: true,
      name: true,
      date: true,
      dealerships: {
        orderBy: { order: 'asc' as const },
        select: {
          order: true,
          motoCount: true,
          dealershipId: true,
          dealership: { select: { id: true, name: true, city: true, state: true } },
        },
      },
    },
  },
} as const;

export async function suggestedKmInitial(vehicleId: string): Promise<number | null> {
  const last = await prisma.tripLogbook.findFirst({
    where: { vehicleId, kmFinal: { not: null } },
    orderBy: { updatedAt: 'desc' },
    select: { kmFinal: true },
  });
  return last?.kmFinal ?? null;
}

export async function getOrCreateLogbook(tripId: string) {
  const existing = await prisma.tripLogbook.findUnique({ where: { tripId } });
  if (existing) return existing;

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      vehicleId: true,
      dealership: { select: { name: true, city: true } },
      route: {
        select: {
          dealerships: {
            orderBy: { order: 'asc' },
            select: {
              order: true,
              motoCount: true,
              dealershipId: true,
              dealership: { select: { name: true, city: true } },
            },
          },
        },
      },
    },
  });
  if (!trip) throw new Error('Viagem não encontrada');

  const initialStops = buildInitialStops({
    routeDealerships: trip.route?.dealerships,
    tripDealership: trip.dealership,
  });

  return prisma.tripLogbook.create({
    data: {
      tripId,
      vehicleId: trip.vehicleId,
      formCode: LOGBOOK_FORM_CODE,
      reportFormCode: LOGBOOK_REPORT_FORM_CODE,
      checklistDeparture: JSON.stringify(emptyChecklistState()),
      checklistReturn: JSON.stringify(emptyChecklistState()),
      stopsJson: JSON.stringify(initialStops),
      reportExtrasJson: JSON.stringify(emptyReportExtras()),
    },
  });
}

export function serializeLogbook(row: Awaited<ReturnType<typeof getOrCreateLogbook>>) {
  const status = logbookWorkflowStatus(row);
  return {
    id: row.id,
    tripId: row.tripId,
    vehicleId: row.vehicleId,
    formCode: row.formCode,
    driverMatricula: row.driverMatricula,
    helperName: row.helperName,
    helperMatricula: row.helperMatricula,
    kmInitial: row.kmInitial,
    kmFinal: row.kmFinal,
    fuelDieselDeparture: row.fuelDieselDeparture,
    fuelOilDeparture: row.fuelOilDeparture,
    fuelDieselReturn: row.fuelDieselReturn,
    fuelOilReturn: row.fuelOilReturn,
    checklistDeparture: parseChecklistJson(row.checklistDeparture),
    checklistReturn: parseChecklistJson(row.checklistReturn),
    fuelingDeparture: parseFuelingJson(row.fuelingDepartureJson),
    fuelingReturn: parseFuelingJson(row.fuelingReturnJson),
    damageDescription: row.damageDescription,
    damageMarks: row.damageMarksJson ? JSON.parse(row.damageMarksJson) : [],
    maintenanceDescription: row.maintenanceDescription,
    departureSignedAt: row.departureSignedAt?.toISOString() ?? null,
    returnSignedAt: row.returnSignedAt?.toISOString() ?? null,
    coordinatorSignedAt: row.coordinatorSignedAt?.toISOString() ?? null,
    hasDepartureSignature: !!row.departureSignaturePng,
    hasReturnSignature: !!row.returnSignaturePng,
    hasCoordinatorSignature: !!row.coordinatorSignaturePng,
    departureComplete: !!row.departureSignedAt,
    returnComplete: !!row.returnSignedAt,
    coordinatorComplete: !!row.coordinatorSignedAt,
    status,
    statusLabel: LOGBOOK_STATUS_LABELS[status],
    reportFormCode: row.reportFormCode,
    stops: parseStopsJson(row.stopsJson),
    reportExtras: parseReportExtrasJson(row.reportExtrasJson),
    tripObservations: row.tripObservations,
    reportStopsComplete: validateStopsForSubmit(parseStopsJson(row.stopsJson)) === null,
  };
}

export type { LogbookWorkflowStatus };

export function buildPrefilledTrip(trip: {
  id: string;
  driverName: string | null;
  departureAt: Date;
  expectedReturn: Date;
  returnedAt: Date | null;
  status: string;
  vehicle: { plate: string; brand: string; model: string; defaultDriver: string | null };
  dealership: { name: string; city: string; state: string };
  route: {
    name: string;
    date: Date;
    dealerships: {
      order: number;
      motoCount: number | null;
      dealershipId: string;
      dealership: { id: string; name: string; city: string; state: string };
    }[];
  } | null;
}) {
  const destinations =
    trip.route?.dealerships.map((d) => ({
      id: d.dealership.id,
      name: d.dealership.name,
      city: d.dealership.city,
      state: d.dealership.state,
      order: d.order,
      plannedMotoCount: d.motoCount,
    })) ?? [
      {
        id: null,
        name: trip.dealership.name,
        city: trip.dealership.city,
        state: trip.dealership.state,
        order: 0,
        plannedMotoCount: null,
      },
    ];
  return {
    tripId: trip.id,
    plate: trip.vehicle.plate,
    vehicleLabel: `${trip.vehicle.brand} ${trip.vehicle.model}`,
    driverName: trip.driverName ?? trip.vehicle.defaultDriver ?? null,
    routeName: trip.route?.name ?? null,
    routeDate: trip.route?.date ?? trip.departureAt,
    departureAt: trip.departureAt,
    expectedReturn: trip.expectedReturn,
    returnedAt: trip.returnedAt,
    tripStatus: trip.status,
    destinations,
    company: 'LSL TRANSPORTES LTDA',
  };
}

export async function findOpenLslTripByPlate(plateNorm: string) {
  const vehicles = await prisma.vehicle.findMany({ select: { id: true, plate: true } });
  const vehicle = vehicles.find((v) => normalizePlate(v.plate) === plateNorm);
  if (!vehicle) return null;

  return prisma.trip.findFirst({
    where: {
      vehicleId: vehicle.id,
      status: { in: [TripStatus.EM_ANDAMENTO, TripStatus.ATRASADO, TripStatus.RETORNOU] },
    },
    orderBy: { departureAt: 'desc' },
    include: tripInclude,
  });
}

export async function ensureLogbookStops(logbookId: string, trip: Parameters<typeof buildInitialStops>[0]) {
  const row = await prisma.tripLogbook.findUnique({ where: { id: logbookId }, select: { stopsJson: true } });
  if (!row || row.stopsJson) return;
  const initialStops = buildInitialStops(trip);
  await prisma.tripLogbook.update({
    where: { id: logbookId },
    data: {
      stopsJson: JSON.stringify(initialStops),
      reportExtrasJson: JSON.stringify(emptyReportExtras()),
    },
  });
}

export type DeparturePayload = {
  driverMatricula?: string;
  helperName?: string;
  helperMatricula?: string;
  kmInitial?: number;
  fuelDieselDeparture?: string;
  fuelOilDeparture?: string;
  checklistDeparture?: ChecklistState;
  fuelingDeparture?: FuelingEntry[];
  signaturePng: string;
};

export type ReturnPayload = {
  kmFinal?: number;
  fuelDieselReturn?: string;
  fuelOilReturn?: string;
  checklistReturn?: ChecklistState;
  fuelingReturn?: FuelingEntry[];
  damageDescription?: string;
  damageMarks?: { x: number; y: number }[];
  maintenanceDescription?: string;
  signaturePng: string;
};

export type ReportPayload = {
  stops: LogbookStopEntry[];
  reportExtras: LogbookReportExtras;
  tripObservations?: string;
};
