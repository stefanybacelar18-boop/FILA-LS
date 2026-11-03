import { describe, expect, it } from 'vitest';
import {
  destinationsAsStored,
  manifestNumberFromRouteName,
  matchDriverByName,
  nextWorkDateKey,
  tripBelongsToDriver,
} from './driver-route-lookup';

function bahiaNoon(isoDay: string): Date {
  return new Date(`${isoDay}T15:00:00.000Z`);
}

describe('matchDriverByName', () => {
  const drivers = [
    { id: '1', name: 'Ricardo de Jesus', active: true },
    { id: '2', name: 'JOÃO SILVA', active: true },
    { id: '3', name: 'Joao Silva', active: false },
    { id: '4', name: 'ANA SOUZA', active: true },
    { id: '5', name: 'Ana Souza', active: true },
  ];

  it('aceita o nome cadastrado ignorando acento e maiúsculas', () => {
    const match = matchDriverByName('  ricardo   de jesus ', drivers);
    expect(match.ok).toBe(true);
    if (match.ok) expect(match.driver.id).toBe('1');
  });

  it('prefere o cadastro ativo quando o inativo só difere no acento', () => {
    const match = matchDriverByName('João Silva', drivers);
    expect(match.ok).toBe(true);
    if (match.ok) expect(match.driver.id).toBe('2');
  });

  it('não escolhe um motorista quando dois ativos coincidem', () => {
    expect(matchDriverByName('ana souza', drivers)).toEqual({ ok: false, reason: 'ambiguous' });
  });

  it('não encontra nome parcial nem motorista só inativo', () => {
    expect(matchDriverByName('Ricardo', drivers).ok).toBe(false);
    expect(matchDriverByName('Motorista Fantasma', drivers)).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});

describe('tripBelongsToDriver', () => {
  it('fica no motorista da viagem LSL e recusa outro nome ou frota AG', () => {
    const trip = { driverName: 'RICARDO DE JESUS', plate: 'ABC1D23', owner: 'LSL' };
    expect(tripBelongsToDriver(trip, 'Ricardo de Jesus')).toBe(true);
    expect(tripBelongsToDriver(trip, 'Outro Motorista')).toBe(false);
    expect(tripBelongsToDriver({ ...trip, owner: 'AG' }, 'Ricardo de Jesus')).toBe(false);
    expect(tripBelongsToDriver({ ...trip, driverName: null }, 'Ricardo de Jesus')).toBe(false);
  });
});

describe('destinationsAsStored', () => {
  it('mantém a ordem gravada e não reordena por cidade', () => {
    const stops = destinationsAsStored([
      { order: 2, name: 'Loja C', city: 'SALVADOR', state: 'BA', motoCount: 4 },
      { order: 0, name: 'Loja A', city: 'ILHEUS', state: 'BA', motoCount: null },
      { order: 1, name: 'Loja B', city: 'FEIRA DE SANTANA', state: 'BA', motoCount: 2 },
    ]);
    expect(stops.map((stop) => stop.name)).toEqual(['Loja A', 'Loja B', 'Loja C']);
    expect(stops[0]).not.toHaveProperty('order');
  });
});

describe('manifesto e dia de trabalho', () => {
  it('lê o número do manifesto no nome do roteiro', () => {
    expect(manifestNumberFromRouteName('384094 21/10/2026')).toBe('384094');
    expect(manifestNumberFromRouteName('Salvador 21/10/2026')).toBeNull();
  });

  it('sexta sem expediente aponta para segunda', () => {
    expect(nextWorkDateKey(bahiaNoon('2026-08-21'))).toBe('2026-08-24');
  });
});
