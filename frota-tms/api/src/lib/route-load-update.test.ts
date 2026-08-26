import { describe, expect, it } from 'vitest';
import {
  calendarDateUtc,
  destinationRowsForWrite,
  summarizeRouteLoad,
  uniqueDealershipIds,
} from './route-load-update';

describe('summarizeRouteLoad', () => {
  it('soma motos e pega o menor vencimento válido', () => {
    const summary = summarizeRouteLoad([
      { city: 'ALAGOINHAS', motoCount: 7, minExpiryDate: '2026-08-18' },
      { city: 'ENTRE RIOS', motoCount: 4, minExpiryDate: '2026-08-26' },
      { city: 'ESTANCIA', motoCount: 34, minExpiryDate: '2026-08-27' },
    ]);
    expect(summary.totalMotoCount).toBe(45);
    expect(summary.priorityExpiryDate).toBe('2026-08-18');
    expect(summary.hasPriority).toBe(true);
  });

  it('ignora vencimento de Pombal / Euclides', () => {
    const summary = summarizeRouteLoad([
      { city: 'POMBAL', motoCount: 2, minExpiryDate: '2026-08-10' },
      { city: 'ARACAJU', motoCount: 3, minExpiryDate: '2026-09-01' },
    ]);
    expect(summary.priorityExpiryDate).toBe('2026-09-01');
    expect(summary.totalMotoCount).toBe(5);
  });
});

describe('destinationRowsForWrite', () => {
  it('normaliza ordem e data UTC de calendário', () => {
    const rows = destinationRowsForWrite([
      { dealershipId: 'a', motoCount: 7, minExpiryDate: '2026-08-18' },
      { dealershipId: 'b', order: 3, motoCount: null, minExpiryDate: '' },
    ]);
    expect(rows[0]).toMatchObject({
      dealershipId: 'a',
      order: 0,
      motoCount: 7,
      minExpiryDate: calendarDateUtc('2026-08-18'),
    });
    expect(rows[1]).toMatchObject({
      dealershipId: 'b',
      order: 3,
      motoCount: null,
      minExpiryDate: null,
    });
  });
});

describe('uniqueDealershipIds', () => {
  it('rejeita repetida', () => {
    expect(uniqueDealershipIds(['a', 'a'])).toEqual({ error: 'Concessionária repetida no roteiro' });
    expect(uniqueDealershipIds(['a', 'b'])).toEqual(['a', 'b']);
  });
});
