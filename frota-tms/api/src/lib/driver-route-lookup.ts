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

export type DriverIdentity = {
  id: string;
  name: string;
  active: boolean;
};

export type DriverMatch =
  | { ok: true; driver: DriverIdentity }
  | { ok: false; reason: 'empty' | 'not_found' | 'ambiguous' };

/** Próximo dia de carregamento: dia seguinte, pulando sábado e domingo. */
export function nextWorkDateKey(now = new Date()): string {
  return operationalDateKey(routeDateFromImport(now));
}

/**
 * O cadastro não tem código. O nome único do motorista é a identificação.
 * A comparação ignora acento, maiúsculas e espaços repetidos.
 * Mais de um cadastro ativo com o mesmo nome não libera a consulta.
 */
export function matchDriverByName(input: string, drivers: DriverIdentity[]): DriverMatch {
  const folded = normalizeDriverName(input);
  if (folded.length < 2) return { ok: false, reason: 'empty' };
  const hits = drivers.filter((driver) => normalizeDriverName(driver.name) === folded);
  const active = hits.filter((driver) => driver.active);
  if (active.length === 1) return { ok: true, driver: active[0]! };
  if (active.length > 1) return { ok: false, reason: 'ambiguous' };
  return { ok: false, reason: 'not_found' };
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
