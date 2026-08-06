import type { PlateOwner } from '../data/operatorVisibility';
import { plateOwner } from '../data/operatorVisibility';

/** Placas fictícias do Chronus: LSL40, LSL50, AG50, AG70 (operação + capacidade). */
const FICTITIOUS_PLATE = /^(LSL|AG)(\d{2,3})$/i;

export type ChronusPlateHint = {
  raw: string;
  isFictional: boolean;
  fleetOwner: PlateOwner | null;
  capacityMotos: number | null;
};

export function parseChronusPlateHint(value: string | null | undefined): ChronusPlateHint | null {
  const raw = value?.trim();
  if (!raw) return null;

  const token = raw.split(',')[0]?.trim() ?? raw;
  const match = token.match(FICTITIOUS_PLATE);
  if (!match) {
    return {
      raw,
      isFictional: false,
      fleetOwner: null,
      capacityMotos: null,
    };
  }

  const fleetOwner = match[1]!.toUpperCase() as PlateOwner;
  const capacityMotos = Number(match[2]);
  if (!Number.isFinite(capacityMotos) || capacityMotos <= 0) {
    return {
      raw,
      isFictional: false,
      fleetOwner: null,
      capacityMotos: null,
    };
  }

  return {
    raw: token.toUpperCase(),
    isFictional: true,
    fleetOwner,
    capacityMotos,
  };
}

export function resolveManifestPlateHint(plates: string[]): ChronusPlateHint | null {
  const unique = [...new Set(plates.map((p) => p.trim()).filter(Boolean))];
  if (unique.length === 0) return null;

  const parsed = unique.map((p) => parseChronusPlateHint(p)!);
  const fictional = parsed.filter((p) => p.isFictional);
  if (fictional.length === unique.length && fictional.length > 0) {
    const first = fictional[0]!;
    const same = fictional.every(
      (p) => p.fleetOwner === first.fleetOwner && p.capacityMotos === first.capacityMotos,
    );
    if (same) return first;
  }

  if (unique.length === 1) return parsed[0] ?? null;
  return parseChronusPlateHint(unique.join(', '));
}

export function chronusPlateNotes(hint: ChronusPlateHint | null): string | null {
  if (!hint) return null;
  return `Placa Chronus: ${hint.raw}`;
}

export function fleetRequirementFromNotes(notes?: string | null): ChronusPlateHint | null {
  if (!notes) return null;
  const match = notes.match(/Placa Chronus:\s*(.+)/i);
  if (!match) return null;
  return parseChronusPlateHint(match[1]);
}

export function vehicleMatchesRouteLoad(
  vehicle: { plate: string; capacityMotos: number },
  route: {
    requiredFleetOwner?: string | null;
    requiredCapacityMotos?: number | null;
    notes?: string | null;
  },
): boolean {
  const owner = route.requiredFleetOwner as PlateOwner | null | undefined;
  const capacity = route.requiredCapacityMotos;

  if (owner && plateOwner(vehicle.plate) !== owner) return false;
  if (capacity != null && vehicle.capacityMotos < capacity) return false;
  return true;
}

export function routeFleetRequirement(route: {
  requiredFleetOwner?: string | null;
  requiredCapacityMotos?: number | null;
  notes?: string | null;
}): { fleetOwner: PlateOwner | null; capacityMotos: number | null; label: string | null } {
  if (route.requiredFleetOwner || route.requiredCapacityMotos != null) {
    const fleetOwner = (route.requiredFleetOwner as PlateOwner | null) ?? null;
    const capacityMotos = route.requiredCapacityMotos ?? null;
    return {
      fleetOwner,
      capacityMotos,
      label: formatFleetRequirementLabel(fleetOwner, capacityMotos),
    };
  }

  const hint = fleetRequirementFromNotes(route.notes);
  if (hint?.isFictional) {
    return {
      fleetOwner: hint.fleetOwner,
      capacityMotos: hint.capacityMotos,
      label: formatFleetRequirementLabel(hint.fleetOwner, hint.capacityMotos),
    };
  }

  return { fleetOwner: null, capacityMotos: null, label: hint?.raw ?? null };
}

/** Roteiro destinado à frota LSL (só Admin define placa na Operação AG). */
export function isRouteForLslFleet(route: {
  requiredFleetOwner?: string | null;
  requiredCapacityMotos?: number | null;
  notes?: string | null;
  name?: string;
}): boolean {
  if (route.requiredFleetOwner === 'AG') return false;
  if (route.requiredFleetOwner === 'LSL') return true;
  const req = routeFleetRequirement(route);
  if (req.fleetOwner === 'LSL') return true;
  if (req.fleetOwner === 'AG') return false;
  return !!(route.name && /\bLSL\b/i.test(route.name));
}

export function formatFleetRequirementLabel(
  fleetOwner: PlateOwner | null,
  capacityMotos: number | null,
): string | null {
  if (!fleetOwner && capacityMotos == null) return null;
  if (fleetOwner && capacityMotos != null) return `${fleetOwner} · ${capacityMotos} motos`;
  if (fleetOwner) return fleetOwner;
  return capacityMotos != null ? `${capacityMotos} motos` : null;
}
