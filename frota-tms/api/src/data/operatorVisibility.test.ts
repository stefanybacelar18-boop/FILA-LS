import { describe, expect, it } from 'vitest';
import {
  OPERATOR_HIDDEN_PLATES,
  filterPlatesForRole,
  isVehicleHiddenFromOperator,
  parsePlateOwner,
  plateOwner,
} from '../data/operatorVisibility';

describe('plateOwner', () => {
  it('usa o campo cadastrado quando existe', () => {
    expect(plateOwner('ABC1D23', 'LSL')).toBe('LSL');
    expect(plateOwner('EZU2D86', 'AG')).toBe('AG');
  });

  it('cai na lista histórica quando o cadastro não tem owner', () => {
    expect(plateOwner('EZU2D86')).toBe('LSL');
    expect(plateOwner('UEV4A13')).toBe('LSL');
    expect(plateOwner('ABC1D23')).toBe('AG');
  });

  it('inclui UEV4A13 no fallback LSL', () => {
    expect(OPERATOR_HIDDEN_PLATES).toContain('UEV4A13');
  });
});

describe('isVehicleHiddenFromOperator', () => {
  it('esconde LSL da Operação mesmo fora da lista antiga', () => {
    expect(isVehicleHiddenFromOperator({ plate: 'XYZ9A99', owner: 'LSL' })).toBe(true);
    expect(isVehicleHiddenFromOperator({ plate: 'XYZ9A99', owner: 'AG' })).toBe(false);
  });
});

describe('filterPlatesForRole', () => {
  const items = [
    { plate: 'UEV4A13', owner: 'LSL' as const },
    { plate: 'RDO2D80', owner: 'AG' as const },
  ];

  it('Admin vê as duas frotas', () => {
    expect(filterPlatesForRole('ADMIN', items)).toHaveLength(2);
  });

  it('Operação não vê placa LSL', () => {
    expect(filterPlatesForRole('OPERACAO', items).map((v) => v.plate)).toEqual(['RDO2D80']);
  });
});

describe('parsePlateOwner', () => {
  it('aceita só LSL e AG', () => {
    expect(parsePlateOwner('LSL')).toBe('LSL');
    expect(parsePlateOwner('AG')).toBe('AG');
    expect(parsePlateOwner('x')).toBeNull();
    expect(parsePlateOwner(null)).toBeNull();
  });
});
