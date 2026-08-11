import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VehicleStatus } from '../types/enums';
import { isOverdue, priorityColor, vehicleColor } from './status';
import { parseOperationalDateTime } from './timezone';

describe('vehicleColor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(parseOperationalDateTime('2026-08-11', '12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna preto para manutenção ou bloqueado', () => {
    expect(vehicleColor(VehicleStatus.EM_MANUTENCAO)).toBe('black');
    expect(vehicleColor(VehicleStatus.BLOQUEADO)).toBe('black');
  });

  it('retorna amarelo para carregamento', () => {
    expect(vehicleColor(VehicleStatus.EM_CARREGAMENTO)).toBe('yellow');
  });

  it('retorna verde para disponível', () => {
    expect(vehicleColor(VehicleStatus.DISPONIVEL)).toBe('green');
  });

  it('retorna vermelho em viagem sem previsão de retorno', () => {
    expect(vehicleColor(VehicleStatus.EM_VIAGEM)).toBe('red');
  });

  it('usa previsão de retorno para viagem em andamento', () => {
    const today = parseOperationalDateTime('2026-08-11', '12:00:00');
    const tomorrow = parseOperationalDateTime('2026-08-12', '12:00:00');
    const yesterday = parseOperationalDateTime('2026-08-10', '12:00:00');
    const later = parseOperationalDateTime('2026-08-14', '12:00:00');

    expect(vehicleColor(VehicleStatus.EM_VIAGEM, today)).toBe('blue');
    expect(vehicleColor(VehicleStatus.EM_VIAGEM, tomorrow)).toBe('orange');
    expect(vehicleColor(VehicleStatus.EM_VIAGEM, yesterday)).toBe('red');
    expect(vehicleColor(VehicleStatus.EM_VIAGEM, later)).toBe('green');
  });
});

describe('priorityColor', () => {
  it('classifica dias até o vencimento', () => {
    expect(priorityColor(-1)).toBe('expired');
    expect(priorityColor(3)).toBe('red');
    expect(priorityColor(10)).toBe('orange');
    expect(priorityColor(20)).toBe('yellow');
    expect(priorityColor(45)).toBe('green');
  });
});

describe('isOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(parseOperationalDateTime('2026-08-11', '12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marca atraso quando a previsão já passou', () => {
    const expected = parseOperationalDateTime('2026-08-10', '12:00:00');
    expect(isOverdue(expected)).toBe(true);
  });

  it('não marca atraso no dia da previsão ou após retorno', () => {
    const today = parseOperationalDateTime('2026-08-11', '12:00:00');
    const returnedAt = parseOperationalDateTime('2026-08-12', '08:00:00');
    expect(isOverdue(today)).toBe(false);
    expect(isOverdue(parseOperationalDateTime('2026-08-09', '12:00:00'), returnedAt)).toBe(false);
  });
});
