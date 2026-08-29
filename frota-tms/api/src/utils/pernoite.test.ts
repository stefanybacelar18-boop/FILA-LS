import { describe, expect, it } from 'vitest';
import {
  defaultPernoiteNights,
  isPernoite,
  payrollPeriodForDate,
  pernoiteNights,
  pernoiteOverrideToStore,
  resolvedPernoiteNights,
} from './pernoite';
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

  it('calendário de 2 noites (19→21) permanece 2 sem teto', () => {
    expect(
      pernoiteNights({
        departureAt: parseOperationalDateTime('2026-08-19', '06:00:00'),
        expectedReturn: parseOperationalDateTime('2026-08-21', '12:00:00'),
        returnedAt: parseOperationalDateTime('2026-08-21', '08:00:00'),
      }),
    ).toBe(2);
  });
});

describe('resolvedPernoiteNights', () => {
  const spanTwoNights = {
    departureAt: parseOperationalDateTime('2026-08-19', '06:00:00'),
    expectedReturn: parseOperationalDateTime('2026-08-21', '12:00:00'),
    returnedAt: parseOperationalDateTime('2026-08-21', '08:00:00'),
  };

  it('limita a 1 pernoite por roteiro quando não há ajuste manual', () => {
    expect(defaultPernoiteNights(spanTwoNights)).toBe(1);
    expect(resolvedPernoiteNights(spanTwoNights)).toBe(1);
    expect(isPernoite(spanTwoNights)).toBe(true);
  });

  it('respeita override do admin (2 ou 3 noites)', () => {
    expect(resolvedPernoiteNights({ ...spanTwoNights, pernoiteNightsOverride: 2 })).toBe(2);
    expect(resolvedPernoiteNights({ ...spanTwoNights, pernoiteNightsOverride: 3 })).toBe(3);
  });

  it('não grava override quando o valor é o padrão (teto 1)', () => {
    expect(pernoiteOverrideToStore(spanTwoNights, 1)).toBeNull();
    expect(pernoiteOverrideToStore(spanTwoNights, 2)).toBe(2);
  });

  it('mesmo dia continua sem pernoite', () => {
    const sameDay = {
      departureAt: parseOperationalDateTime('2026-08-01', '06:00:00'),
      expectedReturn: parseOperationalDateTime('2026-08-01', '18:00:00'),
    };
    expect(resolvedPernoiteNights(sameDay)).toBe(0);
    expect(isPernoite(sameDay)).toBe(false);
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
