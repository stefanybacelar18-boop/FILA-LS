import { describe, expect, it } from 'vitest';
import { isPernoite, payrollPeriodForDate, pernoiteNights } from './pernoite';
import { parseOperationalDateTime } from './timezone';

describe('pernoiteNights', () => {
  it('conta zero pernoites no mesmo dia', () => {
    const day = parseOperationalDateTime('2026-08-01', '06:00:00');
    expect(
      pernoiteNights({
        departureAt: day,
        expectedReturn: parseOperationalDateTime('2026-08-01', '18:00:00'),
      }),
    ).toBe(0);
    expect(
      isPernoite({
        departureAt: day,
        expectedReturn: parseOperationalDateTime('2026-08-01', '18:00:00'),
      }),
    ).toBe(false);
  });

  it('conta uma pernoite quando retorno é no dia seguinte', () => {
    const departure = parseOperationalDateTime('2026-08-01', '06:00:00');
    const expectedReturn = parseOperationalDateTime('2026-08-02', '12:00:00');
    expect(
      pernoiteNights({
        departureAt: departure,
        expectedReturn,
      }),
    ).toBe(1);
    expect(isPernoite({ departureAt: departure, expectedReturn })).toBe(true);
  });

  it('usa retorno real quando informado', () => {
    const departure = parseOperationalDateTime('2026-08-01', '06:00:00');
    expect(
      pernoiteNights({
        departureAt: departure,
        expectedReturn: parseOperationalDateTime('2026-08-04', '12:00:00'),
        returnedAt: parseOperationalDateTime('2026-08-02', '08:00:00'),
      }),
    ).toBe(1);
  });
});

describe('payrollPeriodForDate', () => {
  it('usa 16 do mês anterior até 15 do mês vigente antes do dia 16', () => {
    const period = payrollPeriodForDate(new Date(2026, 7, 11));
    expect(period.start.getDate()).toBe(16);
    expect(period.start.getMonth()).toBe(6);
    expect(period.end.getDate()).toBe(15);
    expect(period.end.getMonth()).toBe(7);
  });

  it('usa 16 do mês vigente até 15 do mês seguinte a partir do dia 16', () => {
    const period = payrollPeriodForDate(new Date(2026, 7, 20));
    expect(period.start.getDate()).toBe(16);
    expect(period.start.getMonth()).toBe(7);
    expect(period.end.getDate()).toBe(15);
    expect(period.end.getMonth()).toBe(8);
  });
});
