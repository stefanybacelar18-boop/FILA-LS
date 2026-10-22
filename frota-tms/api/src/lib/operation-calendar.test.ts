import { describe, expect, it } from 'vitest';
import { buildOperationCalendar } from './operation-calendar';

describe('operation calendar', () => {
  it('marca feriado nacional como dia que segura a carga', () => {
    const days = buildOperationCalendar({ from: '2026-11-01', to: '2026-11-30', closures: [] });
    const finados = days.find((day) => day.date === '2026-11-02');
    const consciencia = days.find((day) => day.date === '2026-11-20');
    expect(finados?.tone).toBe('risk');
    expect(finados?.items[0]?.label).toContain('Feriado nacional');
    expect(finados?.items[0]?.label).toContain('Segura a carga');
    expect(consciencia?.tone).toBe('risk');
    expect(days.some((day) => day.date === '2026-11-21')).toBe(false);
  });

  it('mostra Carnaval como aviso e o 2 de julho como feriado da Bahia', () => {
    const carnival = buildOperationCalendar({ from: '2026-02-01', to: '2026-02-28', closures: [] });
    const tuesday = carnival.find((day) => day.date === '2026-02-17');
    expect(tuesday?.tone).toBe('warn');
    expect(tuesday?.items[0]?.label).toContain('Ponto facultativo');
    expect(tuesday?.items[0]?.label).toContain('A viagem segue');

    const july = buildOperationCalendar({ from: '2026-07-01', to: '2026-07-10', closures: [] });
    expect(july.find((day) => day.date === '2026-07-02')?.items[0]?.label).toContain('Bahia');
    expect(july.find((day) => day.date === '2026-07-08')?.items[0]?.label).toContain('Sergipe');
  });

  it('junta o fechamento lançado no expediente com o feriado do dia', () => {
    const days = buildOperationCalendar({
      from: '2026-06-01',
      to: '2026-06-30',
      closures: [
        {
          date: '2026-06-24T12:00:00.000Z',
          closure: {
            name: 'MOTOPEL',
            city: 'Alagoinhas',
            state: 'BA',
            kind: 'FECHADO',
            note: 'São João',
          },
        },
      ],
    });
    const saoJoao = days.find((day) => day.date === '2026-06-24');
    expect(saoJoao?.tone).toBe('risk');
    expect(saoJoao?.items.map((item) => item.label).join(' ')).toContain('MOTOPEL (Alagoinhas/BA)');
    expect(saoJoao?.items.map((item) => item.label).join(' ')).toContain('São João');
  });

  it('mostra o feriado municipal das lojas ativas sem cadastro manual', () => {
    const days = buildOperationCalendar({
      from: '2026-09-01',
      to: '2026-09-30',
      closures: [],
      cities: [
        { city: 'Feira de Santana', state: 'BA' },
        { city: 'FEIRA DE SANTANA', state: 'BA' },
        { city: 'Salvador', state: 'BA' },
      ],
    });
    const aniversario = days.find((day) => day.date === '2026-09-18');
    expect(aniversario?.tone).toBe('risk');
    expect(aniversario?.items).toHaveLength(1);
    expect(aniversario?.items[0]?.label).toContain('Aniversário de Feira de Santana');
    expect(aniversario?.items[0]?.label).toContain('Feira de Santana/BA');
    expect(aniversario?.items[0]?.label).not.toContain('Salvador');
  });
});
