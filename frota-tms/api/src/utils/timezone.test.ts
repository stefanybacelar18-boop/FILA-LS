import { describe, expect, it } from 'vitest';
import {
  normalizeRouteDateInput,
  operationalDateKey,
  parseOperationalDateTime,
} from './timezone';

describe('timezone operacional', () => {
  it('formata chave de data em America/Bahia', () => {
    expect(operationalDateKey(new Date('2026-08-11T03:00:00.000Z'))).toBe('2026-08-11');
    expect(operationalDateKey(new Date('2026-08-11T02:59:59.000Z'))).toBe('2026-08-10');
  });

  it('monta data/hora com offset operacional', () => {
    const dt = parseOperationalDateTime('2026-08-11', '06:00:00');
    expect(dt.toISOString()).toBe('2026-08-11T09:00:00.000Z');
  });

  it('normaliza data de roteiro ao meio-dia UTC', () => {
    expect(normalizeRouteDateInput('2026-08-11').toISOString()).toBe('2026-08-11T12:00:00.000Z');
  });
});
