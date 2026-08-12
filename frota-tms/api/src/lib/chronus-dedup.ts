import { RouteStatus } from '../types/enums';

export function chronusRouteDuplicateKey(name: string, dateIso: string): string {
  return `${name.trim().toLowerCase()}|${dateIso}`;
}

/** Roteiro existente pode ter carga Chronus reaplicada sem criar duplicata. */
export function canRefreshChronusRoute(status: string): boolean {
  return (
    status === RouteStatus.AGUARDANDO_PLACAS ||
    status === RouteStatus.RASCUNHO ||
    status === RouteStatus.EM_ANDAMENTO
  );
}

/** Import não cria outro roteiro com o mesmo nome/data. */
export function blocksChronusRouteCreate(status: string): boolean {
  return canRefreshChronusRoute(status) || status === RouteStatus.CONCLUIDO;
}

function routeStatusRankForChronusDup(status: string): number {
  if (status === RouteStatus.AGUARDANDO_PLACAS) return 0;
  if (status === RouteStatus.EM_ANDAMENTO) return 1;
  if (status === RouteStatus.RASCUNHO) return 2;
  if (status === RouteStatus.CONCLUIDO) return 3;
  return 4;
}

export function registerChronusExistingRoute(
  map: Map<string, { id: string; name: string; status: string }>,
  route: { id: string; name: string; date: Date; status: string },
): void {
  const day = route.date.toISOString().slice(0, 10);
  const key = chronusRouteDuplicateKey(route.name, day);
  const current = map.get(key);
  if (
    !current ||
    routeStatusRankForChronusDup(route.status) < routeStatusRankForChronusDup(current.status)
  ) {
    map.set(key, { id: route.id, name: route.name, status: route.status });
  }
}
