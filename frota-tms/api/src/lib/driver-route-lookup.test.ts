import { describe, expect, it } from 'vitest';
import {
  destinationsAsStored,
  manifestNumberFromRouteName,
  matchDriverByMatricula,
  matriculaForLslPlate,
  matriculaOfDefaultDriver,
  nextWorkDateKey,
  normalizeMatricula,
  planDriverMatriculaSave,
  tripBelongsToDriver,
} from './driver-route-lookup';

function bahiaNoon(isoDay: string): Date {
  return new Date(`${isoDay}T15:00:00.000Z`);
}

const drivers = [
  { id: 'd1', name: 'Ricardo de Jesus', matricula: '150' },
  { id: 'd2', name: 'Ana Souza', matricula: '152' },
  { id: 'd3', name: 'JOÃO SILVA', matricula: '152' },
  { id: 'd4', name: 'Sem Matrícula', matricula: null },
];

describe('matrícula do motorista', () => {
  it('normaliza espaços e letras', () => {
    expect(normalizeMatricula(' 15-0 ')).toBe('150');
    expect(normalizeMatricula('')).toBeNull();
  });

  it('acha o motorista pela matrícula', () => {
    expect(matchDriverByMatricula('150', drivers)).toEqual({
      ok: true,
      driverName: 'Ricardo de Jesus',
    });
    expect(matchDriverByMatricula('999', drivers)).toEqual({ ok: false, reason: 'not_found' });
    expect(matchDriverByMatricula('152', drivers)).toEqual({ ok: false, reason: 'ambiguous' });
  });

  it('exige matrícula só ao salvar placa LSL', () => {
    expect(matriculaForLslPlate({ owner: 'LSL', matricula: '150', defaultDriver: 'Ricardo' })).toEqual({
      ok: true,
      matricula: '150',
      driverName: 'Ricardo',
    });
    expect(matriculaForLslPlate({ owner: 'LSL', matricula: '', defaultDriver: 'Ricardo' }).ok).toBe(false);
    expect(matriculaForLslPlate({ owner: 'LSL', matricula: '150', defaultDriver: '  ' }).ok).toBe(false);
    expect(matriculaForLslPlate({ owner: 'AG', matricula: '150', defaultDriver: 'Ricardo' })).toEqual({
      ok: true,
      matricula: null,
      driverName: null,
    });
  });

  it('grava a matrícula no motorista e recusa número de outra pessoa', () => {
    expect(planDriverMatriculaSave('ricardo de jesus', '150', drivers)).toEqual({
      ok: true,
      action: 'update',
      driverId: 'd1',
      matricula: '150',
    });
    expect(planDriverMatriculaSave('Novo Motorista', '160', drivers)).toEqual({
      ok: true,
      action: 'create',
      name: 'Novo Motorista',
      matricula: '160',
    });
    expect(planDriverMatriculaSave('Outro Motorista', '150', drivers)).toEqual({
      ok: false,
      error: 'Esta matrícula já é de outro motorista.',
    });
  });

  it('mostra na placa LSL a matrícula do motorista padrão', () => {
    expect(matriculaOfDefaultDriver('RICARDO DE JESUS', drivers)).toBe('150');
    expect(matriculaOfDefaultDriver('Sem Motorista', drivers)).toBeNull();
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
