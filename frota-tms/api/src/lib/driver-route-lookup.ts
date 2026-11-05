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

/**
 * A consulta pela matrícula mostra a viagem enquanto ela está aberta.
 * Não filtra pela data do roteiro: no meio do dia o carregamento de hoje
 * já saiu às 06:00, e o de amanhã pode ainda não ter placa.
 */
export function isOpenDriverTripStatus(status: string): boolean {
  return status === 'EM_ANDAMENTO' || status === 'ATRASADO';
}

/** Matrícula do motorista: sem espaço, só letras e números. */
export function normalizeMatricula(value: string | null | undefined): string | null {
  if (value == null) return null;
  const cleaned = value.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length < 1 || cleaned.length > 20) return null;
  return cleaned;
}

export type DriverMatriculaRow = {
  id: string;
  name: string;
  matricula: string | null;
};

export type MatriculaMatch =
  | { ok: true; driverName: string }
  | { ok: false; reason: 'empty' | 'not_found' | 'ambiguous' };

/** A matrícula identifica o motorista. A consulta segue o nome dele em qualquer placa LSL. */
export function matchDriverByMatricula(input: string, drivers: DriverMatriculaRow[]): MatriculaMatch {
  const matricula = normalizeMatricula(input);
  if (!matricula) return { ok: false, reason: 'empty' };
  const hits = drivers.filter((driver) => normalizeMatricula(driver.matricula) === matricula);
  if (hits.length === 0) return { ok: false, reason: 'not_found' };
  const names = [...new Set(hits.map((driver) => normalizeDriverName(driver.name)))];
  if (names.length > 1) return { ok: false, reason: 'ambiguous' };
  return { ok: true, driverName: hits[0]!.name.trim() };
}

export type LslPlateMatriculaInput =
  | { ok: true; matricula: string | null; driverName: string | null }
  | { ok: false; error: string };

/**
 * Placa AG não pede matrícula e não altera a do motorista.
 * Placa LSL exige a matrícula do motorista padrão. O valor é gravado no motorista.
 */
export function matriculaForLslPlate(input: {
  owner: 'LSL' | 'AG';
  matricula: string | null | undefined;
  defaultDriver: string | null | undefined;
}): LslPlateMatriculaInput {
  if (input.owner !== 'LSL') return { ok: true, matricula: null, driverName: null };
  const matricula = normalizeMatricula(input.matricula);
  const driverName = input.defaultDriver?.trim().replace(/\s+/g, ' ') ?? '';
  if (!matricula) {
    return { ok: false, error: 'Informe a matrícula do motorista na placa LSL.' };
  }
  if (driverName.length < 2) {
    return { ok: false, error: 'Informe o motorista padrão junto com a matrícula.' };
  }
  return { ok: true, matricula, driverName };
}

export type DriverMatriculaPlan =
  | { ok: true; action: 'update'; driverId: string; matricula: string }
  | { ok: true; action: 'create'; name: string; matricula: string }
  | { ok: false; error: string };

/** Grava a matrícula no motorista. Outro motorista não pode usar o mesmo número. */
export function planDriverMatriculaSave(
  driverName: string,
  matricula: string,
  drivers: DriverMatriculaRow[],
): DriverMatriculaPlan {
  const normalizedMatricula = normalizeMatricula(matricula);
  const name = driverName.trim().replace(/\s+/g, ' ');
  if (!normalizedMatricula || name.length < 2) {
    return { ok: false, error: 'Informe o motorista e a matrícula.' };
  }
  const folded = normalizeDriverName(name);
  const samePerson = drivers.filter((driver) => normalizeDriverName(driver.name) === folded);
  if (samePerson.length > 1) {
    return { ok: false, error: 'Há mais de um motorista com esse nome. Ajuste o cadastro de motoristas.' };
  }
  const taken = drivers.find(
    (driver) =>
      normalizeMatricula(driver.matricula) === normalizedMatricula &&
      normalizeDriverName(driver.name) !== folded,
  );
  if (taken) return { ok: false, error: 'Esta matrícula já é de outro motorista.' };
  if (samePerson.length === 1) {
    return { ok: true, action: 'update', driverId: samePerson[0]!.id, matricula: normalizedMatricula };
  }
  return { ok: true, action: 'create', name, matricula: normalizedMatricula };
}

/** Matrícula exibida na placa LSL: é a do motorista padrão, não um dado do veículo. */
export function matriculaOfDefaultDriver(
  defaultDriver: string | null | undefined,
  drivers: DriverMatriculaRow[],
): string | null {
  const name = defaultDriver?.trim();
  if (!name) return null;
  const folded = normalizeDriverName(name);
  const hit = drivers.find((driver) => normalizeDriverName(driver.name) === folded);
  return hit ? normalizeMatricula(hit.matricula) : null;
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
