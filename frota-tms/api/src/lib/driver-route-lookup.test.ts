import { describe, expect, it } from 'vitest';
import {
  destinationsAsStored,
  manifestNumberFromRouteName,
  matchLslPlateByMatricula,
  matriculaForPlateSave,
  nextWorkDateKey,
  normalizeMatricula,
  tripBelongsToDriver,
} from './driver-route-lookup';

function bahiaNoon(isoDay: string): Date {
  return new Date(`${isoDay}T15:00:00.000Z`);
}

describe('matrícula da placa LSL', () => {
  const plates = [
    { plate: 'EZU2D86', owner: 'LSL', driverMatricula: '150', defaultDriver: 'Ricardo de Jesus' },
    { plate: 'ABC1D23', owner: 'AG', driverMatricula: '150', defaultDriver: 'Outro Motorista' },
    { plate: 'TST1002', owner: 'LSL', driverMatricula: '151', defaultDriver: null },
    { plate: 'TST1003', owner: 'LSL', driverMatricula: '152', defaultDriver: 'Ana Souza' },
    { plate: 'TST1004', owner: 'LSL', driverMatricula: '152', defaultDriver: 'JOÃO SILVA' },
  ];

  it('normaliza espaços e letras', () => {
    expect(normalizeMatricula(' 15-0 ')).toBe('150');
    expect(normalizeMatricula('')).toBeNull();
  });

  it('acha o motorista padrão da placa LSL e ignora a mesma matrícula na AG', () => {
    const match = matchLslPlateByMatricula('150', plates);
    expect(match).toEqual({ ok: true, driverName: 'Ricardo de Jesus', plate: 'EZU2D86' });
  });

  it('recusa matrícula sem motorista ou ligada a dois motoristas', () => {
    expect(matchLslPlateByMatricula('151', plates)).toEqual({ ok: false, reason: 'no_driver' });
    expect(matchLslPlateByMatricula('152', plates)).toEqual({ ok: false, reason: 'ambiguous' });
    expect(matchLslPlateByMatricula('999', plates)).toEqual({ ok: false, reason: 'not_found' });
  });

  it('exige matrícula só na placa LSL e apaga na AG', () => {
    expect(
      matriculaForPlateSave({ owner: 'LSL', driverMatricula: '150', defaultDriver: 'Ricardo' }),
    ).toEqual({ ok: true, driverMatricula: '150' });
    expect(matriculaForPlateSave({ owner: 'LSL', driverMatricula: '', defaultDriver: 'Ricardo' }).ok).toBe(
      false,
    );
    expect(
      matriculaForPlateSave({ owner: 'LSL', driverMatricula: '150', defaultDriver: '  ' }).ok,
    ).toBe(false);
    expect(
      matriculaForPlateSave({ owner: 'AG', driverMatricula: '150', defaultDriver: 'Ricardo' }),
    ).toEqual({ ok: true, driverMatricula: null });
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
