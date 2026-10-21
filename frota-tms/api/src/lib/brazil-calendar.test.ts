import { describe, expect, it } from 'vitest';
import { calendarHits, easterSunday, federalOptionalDays, nationalHolidays } from './brazil-calendar';

describe('brazil-calendar', () => {
  it('calcula a Páscoa de 2026 em 5 de abril', () => {
    expect(easterSunday(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
  });

  it('carrega feriados nacionais de 2026, inclusive a Paixão e a Consciência Negra', () => {
    const dates = nationalHolidays(2026).map((hit) => hit.date);
    expect(dates).toContain('2026-01-01');
    expect(dates).toContain('2026-04-03');
    expect(dates).toContain('2026-04-21');
    expect(dates).toContain('2026-11-20');
    expect(dates).toContain('2026-12-25');
    expect(dates).not.toContain('2026-02-16');
  });

  it('trata Carnaval e Corpus Christi como ponto facultativo, não como feriado', () => {
    const optional = federalOptionalDays(2026).map((hit) => hit.date);
    expect(optional).toEqual(expect.arrayContaining(['2026-02-16', '2026-02-17', '2026-02-18', '2026-06-04']));
    expect(calendarHits('2026-02-17', 'BA').every((hit) => hit.kind === 'PONTO_FACULTATIVO_FEDERAL')).toBe(
      true,
    );
  });

  it('aplica 2 de julho só na Bahia e 8 de julho só em Sergipe', () => {
    expect(calendarHits('2026-07-02', 'BA').map((hit) => hit.name)).toContain('Independência da Bahia');
    expect(calendarHits('2026-07-02', 'SE')).toHaveLength(0);
    expect(calendarHits('2026-07-08', 'SE').map((hit) => hit.name)).toContain('Independência de Sergipe');
    expect(calendarHits('2026-07-08', 'BA')).toHaveLength(0);
  });
});
