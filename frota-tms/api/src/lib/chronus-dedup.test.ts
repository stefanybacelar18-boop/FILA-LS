import { describe, expect, it } from 'vitest';
import {
  blocksChronusRouteCreate,
  canRefreshChronusRoute,
  chronusManifestoKey,
  registerChronusExistingRoute,
  type ChronusExistingRouteMatch,
} from './chronus-dedup';
import { RouteStatus } from '../types/enums';

describe('chronus-dedup', () => {
  it('identifica o manifesto pelo número, ignorando a data do nome', () => {
    expect(chronusManifestoKey('384094')).toBe('384094');
    expect(chronusManifestoKey('384094 21/10/2026')).toBe('384094');
    expect(chronusManifestoKey('384094.0')).toBe('384094');
    expect(chronusManifestoKey('Salvador 21/10/2026')).toBeNull();
    expect(chronusManifestoKey('384095')).not.toBe('384094');
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

  it('prefere roteiro atualizável quando há mais de um com o mesmo manifesto', () => {
    const map = new Map<string, ChronusExistingRouteMatch>();
    registerChronusExistingRoute(map, {
      id: 'concluido',
      name: '375168 12/08/2026',
      date: new Date('2026-08-12T12:00:00.000Z'),
      status: RouteStatus.CONCLUIDO,
    });
    registerChronusExistingRoute(map, {
      id: 'ativo',
      name: '375168 13/08/2026',
      date: new Date('2026-08-13T12:00:00.000Z'),
      status: RouteStatus.AGUARDANDO_PLACAS,
    });
    expect(map.get('375168')?.id).toBe('ativo');
  });

  it('atualiza a viagem em andamento em vez da cópia ainda sem placa', () => {
    const map = new Map<string, ChronusExistingRouteMatch>();
    registerChronusExistingRoute(map, {
      id: 'aguardando',
      name: '384094 21/10/2026',
      date: new Date('2026-10-21T12:00:00.000Z'),
      status: RouteStatus.AGUARDANDO_PLACAS,
    });
    registerChronusExistingRoute(map, {
      id: 'viagem',
      name: '384094 22/10/2026',
      date: new Date('2026-10-22T12:00:00.000Z'),
      status: RouteStatus.EM_ANDAMENTO,
    });
    expect(map.get('384094')?.id).toBe('viagem');
  });

  it('entre duas viagens iguais, fica com a importada primeiro', () => {
    const map = new Map<string, ChronusExistingRouteMatch>();
    registerChronusExistingRoute(map, {
      id: 'depois',
      name: '384094 22/10/2026',
      date: new Date('2026-10-22T12:00:00.000Z'),
      status: RouteStatus.AGUARDANDO_PLACAS,
    });
    registerChronusExistingRoute(map, {
      id: 'antes',
      name: '384094 21/10/2026',
      date: new Date('2026-10-21T12:00:00.000Z'),
      status: RouteStatus.AGUARDANDO_PLACAS,
    });
    expect(map.get('384094')?.id).toBe('antes');
  });

  it('ignora roteiro manual sem número de manifesto', () => {
    const map = new Map<string, ChronusExistingRouteMatch>();
    registerChronusExistingRoute(map, {
      id: 'manual',
      name: 'Interior BA 21/10/2026',
      date: new Date('2026-10-21T12:00:00.000Z'),
      status: RouteStatus.AGUARDANDO_PLACAS,
    });
    expect(map.size).toBe(0);
  });
});
