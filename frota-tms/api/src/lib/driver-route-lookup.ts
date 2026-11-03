import { normalizeDriverName, plateOwner, type PlateOwner } from '../data/operatorVisibility';
import { chronusManifestoKey } from './chronus-dedup';
import { routeDateFromImport } from './chronus-route-date';
import { operationalDateKey } from '../utils/timezone';

/**
 * Aviso fixo da consulta do motorista.
 * A ordem gravada no roteiro pode ter sido rearranjada na operação;
 * o manifesto de carga continua sendo a sequência que o motorista deve seguir.
 */
export const DELIVERY_ORDER_WARNING =
  'A sequência de entrega deve ser seguida conforme a ordem dos clientes no Manifesto de Carga. O FrotaTMS não realiza a otimização automática da rota.';

export const NO_DELIVERY_ORDER_NOTE =
  'Sem ordem de entrega definida no FrotaTMS. A lista abaixo não é uma sequência. Siga a ordem dos clientes no Manifesto de Carga.';

/** Próximo dia de carregamento: dia seguinte, pulando sábado e domingo. */
export function nextWorkDateKey(now = new Date()): string {
  return operationalDateKey(routeDateFromImport(now));
}

/** Matrícula da placa LSL: sem espaço, só letras e números. */
export function normalizeMatricula(value: string | null | undefined): string | null {
  if (value == null) return null;
  const cleaned = value.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length < 1 || cleaned.length > 20) return null;
  return cleaned;
}

export type LslPlateMatricula = {
  plate: string;
  owner: string | null;
  driverMatricula: string | null;
  defaultDriver: string | null;
};

export type MatriculaMatch =
  | { ok: true; driverName: string; plate: string }
  | { ok: false; reason: 'empty' | 'not_found' | 'ambiguous' | 'no_driver' };

/**
 * A matrícula fica na placa LSL e aponta para o motorista padrão.
 * A consulta segue esse nome em qualquer placa do dia.
 */
export function matchLslPlateByMatricula(input: string, plates: LslPlateMatricula[]): MatriculaMatch {
  const matricula = normalizeMatricula(input);
  if (!matricula) return { ok: false, reason: 'empty' };
  const hits = plates.filter(
    (plate) =>
      plateOwner(plate.plate, plate.owner) === 'LSL' &&
      normalizeMatricula(plate.driverMatricula) === matricula,
  );
  if (hits.length === 0) return { ok: false, reason: 'not_found' };
  const names = [
    ...new Set(
      hits
        .map((plate) => plate.defaultDriver?.trim())
        .filter((name): name is string => !!name)
        .map((name) => normalizeDriverName(name)),
    ),
  ];
  if (names.length === 0) return { ok: false, reason: 'no_driver' };
  if (names.length > 1) return { ok: false, reason: 'ambiguous' };
  const driverName = hits.find((plate) => plate.defaultDriver?.trim())!.defaultDriver!.trim();
  return { ok: true, driverName, plate: hits[0]!.plate };
}

export type PlateMatriculaSave =
  | { ok: true; driverMatricula: string | null }
  | { ok: false; error: string };

/** Placa AG não guarda matrícula. Placa LSL exige matrícula e motorista padrão. */
export function matriculaForPlateSave(input: {
  owner: 'LSL' | 'AG';
  driverMatricula: string | null | undefined;
  defaultDriver: string | null | undefined;
}): PlateMatriculaSave {
  if (input.owner !== 'LSL') return { ok: true, driverMatricula: null };
  const driverMatricula = normalizeMatricula(input.driverMatricula);
  if (!driverMatricula) {
    return { ok: false, error: 'Informe a matrícula do motorista na placa LSL.' };
  }
  if (!input.defaultDriver?.trim()) {
    return { ok: false, error: 'Informe o motorista padrão junto com a matrícula da placa LSL.' };
  }
  return { ok: true, driverMatricula };
}

export function sameDriver(tripDriverName: string | null | undefined, driverName: string): boolean {
  if (!tripDriverName?.trim()) return false;
  return normalizeDriverName(tripDriverName) === normalizeDriverName(driverName);
}

export type DriverTripCandidate = {
  driverName: string | null;
  plate: string;
  owner: string | null;
};

/** Só a frota LSL e só viagens cujo motorista é o identificado. */
export function tripBelongsToDriver(trip: DriverTripCandidate, driverName: string): boolean {
  const owner: PlateOwner = plateOwner(trip.plate, trip.owner);
  return owner === 'LSL' && sameDriver(trip.driverName, driverName);
}

export type StoredStop = {
  order: number;
  name: string;
  city: string;
  state: string;
  motoCount: number | null;
};

export type DriverDestination = {
  name: string;
  city: string;
  state: string;
  motoCount: number | null;
};

/**
 * Mantém a ordem já gravada em RouteDealership.order.
 * Não recalcula proximidade nem numera uma sequência nova.
 * A ordem original do arquivo do manifesto não fica salva à parte.
 */
export function destinationsAsStored(stops: StoredStop[]): DriverDestination[] {
  return [...stops]
    .sort((a, b) => a.order - b.order)
    .map(({ name, city, state, motoCount }) => ({ name, city, state, motoCount }));
}

export function manifestNumberFromRouteName(name: string): string | null {
  return chronusManifestoKey(name);
}
