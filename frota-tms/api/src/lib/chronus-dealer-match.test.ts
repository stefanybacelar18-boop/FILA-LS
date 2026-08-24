import { describe, expect, it } from 'vitest';
import {
  buildChronusDealerIndexes,
  dealerNameCityKey,
  matchChronusDealership,
  normalizeDealershipRegion,
} from './chronus-dealer-match';

const dealers = [
  { id: 'gloria-old', code: '1011103', name: 'GLORIA MOTOS N S GLORIA', city: 'NOSSA SENHORA DA GLORIA' },
  {
    id: 'maravilha',
    code: null,
    name: 'MARAVILHA MOTOS N.S.GLORIA',
    city: 'NOSSA SENHORA DA GLORIA',
  },
  { id: 'brasmoto', code: '1016571', name: 'BRASMOTO', city: 'EUNAPOLIS' },
];

describe('chronus-dealer-match', () => {
  const indexes = buildChronusDealerIndexes(dealers);

  it('casa por código Chronus', () => {
    const hit = matchChronusDealership(
      { dealerCode: '1016571', dealerName: 'BRASMOTO', city: 'EUNAPOLIS' },
      indexes,
    );
    expect(hit?.id).toBe('brasmoto');
  });

  it('casa cadastro sem código pelo nome e cidade', () => {
    const hit = matchChronusDealership(
      {
        dealerCode: '9999999',
        dealerName: 'MARAVILHA MOTOS N.S.GLORIA',
        city: 'NOSSA SENHORA DA GLORIA',
      },
      indexes,
    );
    expect(hit?.id).toBe('maravilha');
  });

  it('não mistura Gloria Motos com Maravilha Motos na mesma cidade', () => {
    expect(dealerNameCityKey('GLORIA MOTOS N S GLORIA', 'NOSSA SENHORA DA GLORIA')).not.toBe(
      dealerNameCityKey('MARAVILHA MOTOS N.S.GLORIA', 'NOSSA SENHORA DA GLORIA'),
    );
    const hit = matchChronusDealership(
      { dealerCode: '', dealerName: 'GLORIA MOTOS N S GLORIA', city: 'NOSSA SENHORA DA GLORIA' },
      indexes,
    );
    expect(hit?.id).toBe('gloria-old');
  });

  it('normaliza região digitada só com número', () => {
    expect(normalizeDealershipRegion('4')).toBe('Região 4');
    expect(normalizeDealershipRegion('região 4')).toBe('Região 4');
    expect(normalizeDealershipRegion('Região 4')).toBe('Região 4');
  });
});
