import { describe, expect, it } from 'vitest';
import {
  blocksChronusRouteCreate,
  canRefreshChronusRoute,
  chronusRouteDuplicateKey,
  registerChronusExistingRoute,
} from './chronus-dedup';
import { RouteStatus } from '../types/enums';

describe('chronus-dedup', () => {
  it('gera chave por nome e data', () => {
    expect(chronusRouteDuplicateKey('375168 12/08/2026', '2026-08-12')).toBe(
      '375168 12/08/2026|2026-08-12',
    );
  });

  it('permite atualizar carga em roteiros ativos', () => {
    expect(canRefreshChronusRoute(RouteStatus.AGUARDANDO_PLACAS)).toBe(true);
    expect(canRefreshChronusRoute(RouteStatus.EM_ANDAMENTO)).toBe(true);
    expect(canRefreshChronusRoute(RouteStatus.CONCLUIDO)).toBe(false);
  });

  it('bloqueia criar duplicata quando roteiro já concluiu', () => {
    expect(blocksChronusRouteCreate(RouteStatus.CONCLUIDO)).toBe(true);
    expect(blocksChronusRouteCreate(RouteStatus.CANCELADO)).toBe(false);
  });

  it('prefere roteiro atualizável quando há mais de um com mesma chave', () => {
    const map = new Map<string, { id: string; name: string; status: string }>();
    registerChronusExistingRoute(map, {
      id: 'concluido',
      name: '375168 12/08/2026',
      date: new Date('2026-08-12T12:00:00.000Z'),
      status: RouteStatus.CONCLUIDO,
    });
    registerChronusExistingRoute(map, {
      id: 'ativo',
      name: '375168 12/08/2026',
      date: new Date('2026-08-12T12:00:00.000Z'),
      status: RouteStatus.AGUARDANDO_PLACAS,
    });
    expect(map.get('375168 12/08/2026|2026-08-12')?.id).toBe('ativo');
  });
});
