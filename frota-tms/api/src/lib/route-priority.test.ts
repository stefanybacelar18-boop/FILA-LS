import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasActivePriority, isUrgentExpiry } from './route-priority';
import { parseOperationalDateTime } from '../utils/timezone';

describe('route-priority', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(parseOperationalDateTime('2026-08-11', '12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('detecta vencimento urgente (hoje, amanhã ou vencido)', () => {
    expect(isUrgentExpiry('2026-08-11')).toBe(true);
    expect(isUrgentExpiry('2026-08-12')).toBe(true);
    expect(isUrgentExpiry('2026-08-10')).toBe(true);
    expect(isUrgentExpiry('2026-08-14')).toBe(false);
    expect(isUrgentExpiry(null)).toBe(false);
  });

  it('considera prioridade ativa por flag ou vencimento urgente', () => {
    expect(hasActivePriority({ hasPriority: true })).toBe(true);
    expect(hasActivePriority({ hasPriority: false, priorityExpiryDate: '2026-08-12' })).toBe(true);
    expect(hasActivePriority({ hasPriority: false, priorityExpiryDate: '2026-08-20' })).toBe(false);
    expect(hasActivePriority({ hasPriority: false })).toBe(false);
  });
});
