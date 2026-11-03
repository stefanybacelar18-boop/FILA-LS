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

  it('bloqueia a loja no feriado municipal da cidade, sem horário cadastrado', () => {
    const feira = assessRouteCalendar({
      routeDate: '2026-09-18',
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
    const salvador = assessRouteCalendar({
      routeDate: '2026-09-18',
      stops: [
        {
          id: 'loja-ssa',
          name: 'Moto Salvador',
          city: 'SALVADOR',
          state: 'BA',
          avgTravelDays: 0,
        },
      ],
    });
    expect(feira.blocked).toBe(true);
    expect(feira.summary).toContain('Aniversário de Feira de Santana');
    expect(feira.summary).not.toContain('Expediente');
    expect(salvador.stops[0]?.status).toBe('APTO');
    expect(salvador.blocked).toBe(false);
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

  it('trata dia comum sem horário como loja aberta', () => {
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
    expect(result.stops[0]?.status).toBe('APTO');
    expect(result.summary).not.toContain('Expediente');
  });

  it('não avisa feriado no dia anterior nem no seguinte quando a entrega é no mesmo dia', () => {
    const before = assessRouteCalendar({
      routeDate: '2026-04-30',
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
    const after = assessRouteCalendar({
      routeDate: '2026-05-02',
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
    expect(before.blocked).toBe(false);
    expect(before.status).toBe('APTO');
    expect(before.summary).not.toContain('Dia do Trabalho');
    expect(after.blocked).toBe(false);
    expect(after.status).toBe('APTO');
    expect(after.summary).not.toContain('Dia do Trabalho');
  });

  it('avisa o feriado do dia seguinte quando o roteiro é pernoite', () => {
    const result = assessRouteCalendar({
      routeDate: '2026-04-30',
      stops: [
        {
          id: 'loja',
          name: 'Moto Ilhéus',
          city: 'ILHEUS',
          state: 'BA',
          avgTravelDays: 1,
        },
      ],
    });
    expect(result.blocked).toBe(true);
    expect(result.summary).toContain('Dia do Trabalho');
    expect(result.summary).toContain('Entrega do pernoite pode cair neste dia');
  });

  it('não avisa feriado dois dias à frente, mesmo com viagem longa', () => {
    const result = assessRouteCalendar({
      routeDate: '2026-04-29',
      stops: [
        {
          id: 'loja',
          name: 'Moto Eunápolis',
          city: 'EUNAPOLIS',
          state: 'BA',
          avgTravelDays: 2,
        },
      ],
    });
    expect(result.blocked).toBe(false);
    expect(result.summary).not.toContain('Dia do Trabalho');
  });

  it('avisa feriado municipal do dia seguinte só no pernoite daquela cidade', () => {
    const overnight = assessRouteCalendar({
      routeDate: '2026-04-22',
      stops: [
        {
          id: 'loja',
          name: 'Moto Ilhéus',
          city: 'ILHEUS',
          state: 'BA',
          avgTravelDays: 1,
        },
      ],
    });
    const sameDay = assessRouteCalendar({
      routeDate: '2026-04-22',
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
    const dayAfter = assessRouteCalendar({
      routeDate: '2026-04-24',
      stops: [
        {
          id: 'loja',
          name: 'Moto Ilhéus',
          city: 'ILHEUS',
          state: 'BA',
          avgTravelDays: 1,
        },
      ],
    });
    expect(overnight.blocked).toBe(true);
    expect(overnight.summary).toContain('São Jorge');
    expect(sameDay.blocked).toBe(false);
    expect(sameDay.summary).not.toContain('São Jorge');
    expect(dayAfter.blocked).toBe(false);
    expect(dayAfter.summary).not.toContain('São Jorge');
  });

  it('trata Aracaju da LSL como pernoite e olha o feriado do dia seguinte', () => {
    const lsl = assessRouteCalendar({
      routeDate: '2026-04-30',
      owner: 'LSL',
      stops: [
        {
          id: 'loja',
          name: 'Moto Aracaju',
          city: 'ARACAJU',
          state: 'SE',
          avgTravelDays: 0,
        },
      ],
    });
    const ag = assessRouteCalendar({
      routeDate: '2026-04-30',
      owner: 'AG',
      stops: [
        {
          id: 'loja',
          name: 'Moto Aracaju',
          city: 'ARACAJU',
          state: 'SE',
          avgTravelDays: 0,
        },
      ],
    });
    expect(lsl.blocked).toBe(true);
    expect(lsl.summary).toContain('Dia do Trabalho');
    expect(ag.blocked).toBe(false);
    expect(ag.summary).not.toContain('Dia do Trabalho');
  });

  it('mantém o fechamento manual mesmo quando o feriado da viagem longa não avisa', () => {
    const result = assessRouteCalendar({
      routeDate: '2026-06-22',
      stops: [
        {
          id: 'loja',
          name: 'Moto Eunápolis',
          city: 'EUNAPOLIS',
          state: 'BA',
          avgTravelDays: 2,
        },
      ],
      closuresByDealership: new Map([
        ['loja', [{ date: '2026-06-24', kind: 'FECHADO', note: 'Inventário' }]],
      ]),
    });
    expect(result.blocked).toBe(true);
    expect(result.summary).toContain('Inventário');
  });

  it('não bloqueia domingo só porque o horário antigo fechava o dia', () => {
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
    expect(result.blocked).toBe(false);
    expect(result.stops[0]?.status).toBe('APTO');
    expect(result.summary).not.toContain('domingo');
  });
});
