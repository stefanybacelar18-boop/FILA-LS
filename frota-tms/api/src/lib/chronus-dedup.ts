import { RouteStatus } from '../types/enums';

export type ChronusExistingRouteMatch = {
  id: string;
  name: string;
  status: string;
  date: string;
};

/**
 * Número do manifesto Chronus.
 * "384094", "384094 21/10/2026" e "384094.0" viram "384094".
 * Roteiro manual sem número no início não entra na deduplicação.
 */
export function chronusManifestoKey(value: string): string | null {
  const token = value.trim().split(/\s+/)[0] ?? '';
  if (!token) return null;
  const match = token.match(/^(\d+)(?:\.0+)?$/);
  return match?.[1] ?? null;
}

/** Roteiro existente pode ter carga Chronus reaplicada sem criar duplicata. */
export function canRefreshChronusRoute(status: string): boolean {
  return (
    status === RouteStatus.AGUARDANDO_PLACAS ||
    status === RouteStatus.RASCUNHO ||
    status === RouteStatus.EM_ANDAMENTO
  );
}

/** Import não cria outro roteiro com o mesmo número de manifesto. */
export function blocksChronusRouteCreate(status: string): boolean {
  return canRefreshChronusRoute(status) || status === RouteStatus.CONCLUIDO;
}

/** Viagem em andamento ganha da cópia ainda sem placa; concluído só bloqueia duplicata. */
function routeStatusRankForChronusDup(status: string): number {
  if (status === RouteStatus.EM_ANDAMENTO) return 0;
  if (status === RouteStatus.AGUARDANDO_PLACAS) return 1;
  if (status === RouteStatus.RASCUNHO) return 2;
  if (status === RouteStatus.CONCLUIDO) return 3;
  return 4;
}

function preferChronusRoute(
  candidate: { status: string; date: string },
  current: { status: string; date: string },
): boolean {
  const rankDiff =
    routeStatusRankForChronusDup(candidate.status) - routeStatusRankForChronusDup(current.status);
  if (rankDiff !== 0) return rankDiff < 0;
  return candidate.date < current.date;
}

export function registerChronusExistingRoute(
  map: Map<string, ChronusExistingRouteMatch>,
  route: { id: string; name: string; date: Date; status: string },
): void {
  const key = chronusManifestoKey(route.name);
  if (!key) return;
  const day = route.date.toISOString().slice(0, 10);
  const candidate = { id: route.id, name: route.name, status: route.status, date: day };
  const current = map.get(key);
  if (!current || preferChronusRoute(candidate, current)) {
    map.set(key, candidate);
  }
}
