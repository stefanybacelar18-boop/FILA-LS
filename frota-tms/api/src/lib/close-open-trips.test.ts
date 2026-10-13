import { describe, expect, it } from 'vitest';
import { parseOperationalDateTime, operationalDateKey } from '../utils/timezone';
import {
  AUTO_RETURN_NOTE,
  mergeTripNotes,
  returnedAtFromForecast,
} from './close-open-trips';

describe('returnedAtFromForecast', () => {
  it('usa o dia da previsão de retorno', () => {
    const departureAt = parseOperationalDateTime('2026-10-06', '06:00:00');
    const expectedReturn = parseOperationalDateTime('2026-10-07', '06:00:00');
    expect(operationalDateKey(returnedAtFromForecast({ departureAt, expectedReturn }))).toBe(
      '2026-10-07',
    );
  });

  it('não marca chegada antes da saída se a previsão estiver inconsistente', () => {
    const departureAt = parseOperationalDateTime('2026-10-08', '06:00:00');
    const expectedReturn = parseOperationalDateTime('2026-10-07', '06:00:00');
    expect(operationalDateKey(returnedAtFromForecast({ departureAt, expectedReturn }))).toBe(
      '2026-10-08',
    );
  });
});

describe('mergeTripNotes', () => {
  it('grava a nota automática sozinha', () => {
    expect(mergeTripNotes(null, AUTO_RETURN_NOTE)).toBe(AUTO_RETURN_NOTE);
  });

  it('preserva observação existente', () => {
    expect(mergeTripNotes('Prioridade Fortaleza', AUTO_RETURN_NOTE)).toBe(
      `Prioridade Fortaleza · ${AUTO_RETURN_NOTE}`,
    );
  });

  it('não duplica a nota', () => {
    expect(mergeTripNotes(AUTO_RETURN_NOTE, AUTO_RETURN_NOTE)).toBe(AUTO_RETURN_NOTE);
  });
});
