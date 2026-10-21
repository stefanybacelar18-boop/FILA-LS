import { describe, expect, it } from 'vitest';
import { assessRouteCalendar, type StoreHour } from './store-calendar';

const weekdayHours = (): StoreHour[] =>
  [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    closed: false,
    openTime: '08:00',
    closeTime: '18:00',
  }));

describe('store-calendar', () => {
  it('bloqueia carga em feriado nacional', () => {
    const result = assessRouteCalendar({
      routeDate: '2026-01-01',
      stops: [],
    });
    expect(result.blocked).toBe(true);
    expect(result.summary).toContain('Confraternização Universal');
  });

  it('bloqueia chegada na Bahia em 2 de julho e não bloqueia o mesmo dia em São Paulo', () => {
    const bahia = assessRouteCalendar({
      routeDate: '2026-07-02',
      stops: [
        {
          id: 'loja',
          name: 'Moto Feira',
          city: 'FEIRA DE SANTANA',
          state: 'BA',
          avgTravelDays: 0,
        },
      ],
    });
    const saoPaulo = assessRouteCalendar({
      routeDate: '2026-07-01',
      stops: [
        {
          id: 'loja-sp',
          name: 'Moto SP',
          city: 'SAO PAULO',
          state: 'SP',
          avgTravelDays: 3,
        },
      ],
    });
    expect(bahia.blocked).toBe(true);
    expect(bahia.summary).toContain('Independência da Bahia');
    expect(saoPaulo.stops[0]?.reasons.join(' ')).not.toContain('Independência da Bahia');
  });

  it('avisa Carnaval sem bloquear', () => {
    const result = assessRouteCalendar({
      routeDate: '2026-02-17',
      stops: [
        {
          id: 'loja',
          name: 'Moto Salvador',
          city: 'SALVADOR',
          state: 'BA',
          avgTravelDays: 0,
        },
      ],
      hoursByDealership: new Map([['loja', weekdayHours()]]),
    });
    expect(result.blocked).toBe(false);
    expect(result.status).toBe('ATENCAO');
    expect(result.summary).toContain('Carnaval');
  });

  it('fecha a loja quando o município foi lançado manualmente', () => {
    const result = assessRouteCalendar({
      routeDate: '2026-06-24',
      stops: [
        {
          id: 'loja',
          name: 'Moto Feira',
          city: 'FEIRA DE SANTANA',
          state: 'BA',
          avgTravelDays: 0,
        },
      ],
      hoursByDealership: new Map([['loja', weekdayHours()]]),
      closuresByDealership: new Map([
        ['loja', [{ date: '2026-06-24', kind: 'FECHADO', note: 'São João' }]],
      ]),
    });
    expect(result.blocked).toBe(true);
    expect(result.summary).toContain('São João');
  });

  it('deixa de bloquear o feriado quando a loja informa que abre', () => {
    const result = assessRouteCalendar({
      routeDate: '2026-04-21',
      stops: [
        {
          id: 'loja',
          name: 'Moto Salvador',
          city: 'SALVADOR',
          state: 'BA',
          avgTravelDays: 0,
        },
      ],
      hoursByDealership: new Map([['loja', weekdayHours()]]),
      closuresByDealership: new Map([['loja', [{ date: '2026-04-21', kind: 'ABRE' }]]]),
    });
    expect(result.stops[0]?.status).toBe('ATENCAO');
    expect(result.blocked).toBe(true);
    expect(result.loadReasons.join(' ')).toContain('Tiradentes');
  });

  it('não trata expediente em branco como loja aberta', () => {
    const result = assessRouteCalendar({
      routeDate: '2026-03-10',
      stops: [
        {
          id: 'loja',
          name: 'Moto Salvador',
          city: 'SALVADOR',
          state: 'BA',
          avgTravelDays: 0,
        },
      ],
    });
    expect(result.blocked).toBe(false);
    expect(result.stops[0]?.status).toBe('PENDENTE');
  });

  it('bloqueia domingo quando o expediente semanal diz que fecha', () => {
    const result = assessRouteCalendar({
      routeDate: '2026-03-15',
      stops: [
        {
          id: 'loja',
          name: 'Moto Salvador',
          city: 'SALVADOR',
          state: 'BA',
          avgTravelDays: 0,
        },
      ],
      hoursByDealership: new Map([['loja', weekdayHours()]]),
    });
    expect(result.blocked).toBe(true);
    expect(result.summary).toContain('domingo');
  });
});
