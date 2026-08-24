import { describe, expect, it } from 'vitest';
import { fridayLoadChoices, routeDateFromImport } from './chronus-route-date';

/** Meio-dia na Bahia (UTC-3). */
function bahiaNoon(isoDay: string): Date {
  return new Date(`${isoDay}T15:00:00.000Z`);
}

describe('routeDateFromImport', () => {
  it('quinta → sexta', () => {
    const d = routeDateFromImport(bahiaNoon('2026-08-20'));
    expect(d.toISOString().slice(0, 10)).toBe('2026-08-21');
  });

  it('sexta sem expediente → segunda', () => {
    const d = routeDateFromImport(bahiaNoon('2026-08-21'));
    expect(d.toISOString().slice(0, 10)).toBe('2026-08-24');
  });

  it('sexta com expediente no sábado → sábado', () => {
    const d = routeDateFromImport(bahiaNoon('2026-08-21'), { saturdayWork: true });
    expect(d.toISOString().slice(0, 10)).toBe('2026-08-22');
  });

  it('sábado → segunda', () => {
    const d = routeDateFromImport(bahiaNoon('2026-08-22'));
    expect(d.toISOString().slice(0, 10)).toBe('2026-08-24');
  });

  it('domingo → segunda', () => {
    const d = routeDateFromImport(bahiaNoon('2026-08-23'));
    expect(d.toISOString().slice(0, 10)).toBe('2026-08-24');
  });
});

describe('fridayLoadChoices', () => {
  it('na sexta oferece sábado e segunda', () => {
    const c = fridayLoadChoices(bahiaNoon('2026-08-21'));
    expect(c.isFriday).toBe(true);
    expect(c.saturday).toBe('2026-08-22');
    expect(c.monday).toBe('2026-08-24');
  });

  it('na quinta não é sexta', () => {
    expect(fridayLoadChoices(bahiaNoon('2026-08-20')).isFriday).toBe(false);
  });
});
