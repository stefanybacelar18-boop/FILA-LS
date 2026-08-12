import { differenceInCalendarDays, format } from 'date-fns';
import { plateOwner, type PlateOwner } from '../data/operatorVisibility';

export type MaintenanceHistoryEvent = {
  action: string;
  createdAt: Date;
  details: string | null;
  plate: string;
  userName: string | null;
};

export type MaintenanceCycleRow = {
  plate: string;
  owner: PlateOwner;
  category: string;
  reason: string;
  entryAt: Date;
  exitAt: Date | null;
  daysStopped: number;
  status: 'Em aberto' | 'Encerrado';
  blockedBy: string;
  releasedBy: string;
  releaseNotes: string;
};

export function parseBlockDetails(details: string | null | undefined): {
  category: string;
  reason: string;
} {
  const raw = (details ?? '').trim();
  if (!raw) return { category: '—', reason: '—' };
  const sep = raw.indexOf(':');
  if (sep === -1) return { category: '—', reason: raw };
  return {
    category: raw.slice(0, sep).trim() || '—',
    reason: raw.slice(sep + 1).trim() || '—',
  };
}

export function parseReleaseDetails(details: string | null | undefined): string {
  const raw = (details ?? '').trim();
  if (!raw) return '—';
  const prefix = 'Veículo OK — ';
  if (raw.startsWith(prefix)) return raw.slice(prefix.length).trim() || '—';
  if (raw === 'Veículo liberado (OK) para novo carregamento') return '—';
  return raw;
}

export function buildMaintenanceCycles(
  events: MaintenanceHistoryEvent[],
  openVehicles: Array<{
    plate: string;
    blockCategory: string | null;
    blockReason: string | null;
    blockedAt: Date | null;
    blockedByName: string | null;
  }> = [],
): MaintenanceCycleRow[] {
  const byPlate = new Map<string, MaintenanceHistoryEvent[]>();
  for (const event of events) {
    const list = byPlate.get(event.plate) ?? [];
    list.push(event);
    byPlate.set(event.plate, list);
  }

  const cycles: MaintenanceCycleRow[] = [];

  for (const [plate, plateEvents] of byPlate) {
    plateEvents.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let open: Omit<MaintenanceCycleRow, 'daysStopped' | 'status'> | null = null;

    for (const event of plateEvents) {
      if (event.action === 'BLOQUEIO_MANUTENCAO') {
        if (open) {
          cycles.push(toCycleRow(open));
        }
        const parsed = parseBlockDetails(event.details);
        open = {
          plate,
          owner: plateOwner(plate),
          category: parsed.category,
          reason: parsed.reason,
          entryAt: event.createdAt,
          exitAt: null,
          blockedBy: event.userName ?? '—',
          releasedBy: '—',
          releaseNotes: '—',
        };
        continue;
      }

      if (event.action === 'LIBERACAO_MANUTENCAO' && open) {
        open.exitAt = event.createdAt;
        open.releasedBy = event.userName ?? '—';
        open.releaseNotes = parseReleaseDetails(event.details);
        cycles.push(toCycleRow(open));
        open = null;
      }
    }

    if (open) cycles.push(toCycleRow(open));
  }

  const openPlates = new Set(
    cycles.filter((cycle) => cycle.status === 'Em aberto').map((cycle) => cycle.plate),
  );

  for (const vehicle of openVehicles) {
    if (openPlates.has(vehicle.plate)) continue;
    const category =
      vehicle.blockCategory === 'OUTRO'
        ? 'Outro motivo'
        : vehicle.blockCategory === 'MANUTENCAO'
          ? 'Manutenção'
          : vehicle.blockCategory ?? 'Manutenção';
    cycles.push(
      toCycleRow({
        plate: vehicle.plate,
        owner: plateOwner(vehicle.plate),
        category,
        reason: vehicle.blockReason?.trim() || '—',
        entryAt: vehicle.blockedAt ?? new Date(),
        exitAt: null,
        blockedBy: vehicle.blockedByName ?? '—',
        releasedBy: '—',
        releaseNotes: '—',
      }),
    );
  }

  return cycles.sort((a, b) => b.entryAt.getTime() - a.entryAt.getTime());
}

function toCycleRow(
  cycle: Omit<MaintenanceCycleRow, 'daysStopped' | 'status'>,
): MaintenanceCycleRow {
  const end = cycle.exitAt ?? new Date();
  return {
    ...cycle,
    daysStopped: Math.max(0, differenceInCalendarDays(end, cycle.entryAt)),
    status: cycle.exitAt ? 'Encerrado' : 'Em aberto',
  };
}

export function filterCyclesByPeriod(
  cycles: MaintenanceCycleRow[],
  from?: Date,
  to?: Date,
): MaintenanceCycleRow[] {
  if (!from && !to) return cycles;
  return cycles.filter((cycle) => {
    const entry = cycle.entryAt.getTime();
    const exit = cycle.exitAt?.getTime() ?? Date.now();
    const start = from?.getTime() ?? Number.NEGATIVE_INFINITY;
    const end = to?.getTime() ?? Number.POSITIVE_INFINITY;
    return entry <= end && exit >= start;
  });
}

export function formatCycleDate(date: Date | null): string {
  if (!date) return 'Em aberto';
  return format(date, 'dd/MM/yyyy HH:mm');
}
