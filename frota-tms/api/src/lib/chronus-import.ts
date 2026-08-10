import * as XLSX from 'xlsx';
import { addDays, format } from 'date-fns';
import { operationalDateKey, parseOperationalDateTime } from '../utils/timezone';
import {
  chronusPlateNotes,
  resolveManifestPlateHint,
  type ChronusPlateHint,
} from './chronus-plate-hint';
import { hasActivePriority } from './route-priority.js';
import { orderStopsNearestFromPad } from './route-stop-order.js';

export type ChronusRow = {
  manifesto: string;
  dealerCode: string;
  dealerName: string;
  city: string;
  expiryRaw: string;
  plate: string;
};

export type ChronusManifestPreview = {
  manifesto: string;
  name: string;
  date: string;
  motoCount: number;
  plateHint: string | null;
  requiredFleetOwner: 'LSL' | 'AG' | null;
  requiredCapacityMotos: number | null;
  plateHintIsFictional: boolean;
  hasPriority: boolean;
  priorityExpiryDate: string | null;
  destinations: {
    dealerCode: string;
    dealerName: string;
    city: string;
    dealershipId: string | null;
    matched: boolean;
    motoCount: number;
    minExpiryDate: string | null;
    expiryExcluded: boolean;
    /** Ordem da parada no manifesto (1ª aparição no arquivo Chronus). */
    order: number;
  }[];
  unmatchedDealerCodes: string[];
  duplicateRouteId: string | null;
  duplicateRouteName: string | null;
  /** Roteiro duplicado aguardando placa — reimport atualiza motos/vencimento. */
  canRefreshLoad: boolean;
};

export type ChronusImportPreview = {
  routeDate: string;
  routeDateLabel: string;
  totalRows: number;
  rowsWithoutManifesto: number;
  manifestCount: number;
  routes: ChronusManifestPreview[];
};

const HEADER_ALIASES: Record<keyof Omit<ChronusRow, never>, string[]> = {
  manifesto: ['manifesto'],
  dealerCode: ['cód. concessionária', 'cod. concessionaria', 'codigo concessionaria', 'cód concessionária'],
  dealerName: ['concessionária', 'concessionaria'],
  city: ['cidade'],
  expiryRaw: ['vencimento n.f.', 'vencimento nf', 'vencimento n.f', 'vencimento'],
  plate: ['placa do caminhão', 'placa do caminhao', 'placa'],
};

function normHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function pickColumn(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normHeader);
  for (const alias of aliases) {
    const idx = normalized.findIndex((h) => h === normHeader(alias));
    if (idx >= 0) return idx;
  }
  for (const alias of aliases) {
    const key = normHeader(alias);
    const idx = normalized.findIndex((h) => h.includes(key) || key.includes(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Layout fixo do export Entregas do Chronus (43 colunas). */
const CHRONUS_ENTREGAS_LAYOUT = {
  manifesto: 26,
  dealerCode: 14,
  dealerName: 15,
  city: 17,
  expiryRaw: 20,
  plate: 25,
} as const;

function isChronusEntregasExport(headers: string[]): boolean {
  if (headers.length < 27) return false;
  const h0 = normHeader(headers[0] ?? '');
  const h26 = normHeader(headers[26] ?? '');
  return h0 === 'minuta' && h26 === 'manifesto';
}

function resolveColumns(headers: string[]) {
  if (isChronusEntregasExport(headers)) {
    return { ...CHRONUS_ENTREGAS_LAYOUT };
  }
  const manifesto = pickColumn(headers, HEADER_ALIASES.manifesto);
  const dealerCode = pickColumn(headers, HEADER_ALIASES.dealerCode);
  const dealerName = pickColumn(headers, HEADER_ALIASES.dealerName);
  const city = pickColumn(headers, HEADER_ALIASES.city);
  const expiryRaw = pickColumn(headers, HEADER_ALIASES.expiryRaw);
  const plate = pickColumn(headers, HEADER_ALIASES.plate);
  return { manifesto, dealerCode, dealerName, city, expiryRaw, plate };
}

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return format(value, 'dd/MM/yyyy');
  return String(value).trim();
}

function parseCsvRows(buffer: Buffer): string[][] {
  const text = buffer.toString('latin1').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  return lines.map((line) => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ';' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

export function isExpiryCityExcluded(city: string): boolean {
  const c = city.trim().toUpperCase();
  return c.includes('POMBAL') || c.startsWith('EUCLIDES');
}

export function routeDateFromImport(baseDate = new Date()): Date {
  let d = addDays(parseOperationalDateTime(operationalDateKey(baseDate), '12:00:00'), 1);
  while (new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bahia', weekday: 'short' }).format(d) === 'Sun') {
    d = addDays(d, 1);
  }
  return d;
}

export function formatRouteDateLabel(date: Date): string {
  return format(date, 'dd/MM/yyyy');
}

export function buildRouteName(manifesto: string, date: Date): string {
  return `${manifesto} ${formatRouteDateLabel(date)}`;
}

export function parseChronusDate(value: string): Date | null {
  const raw = value.trim();
  if (!raw) return null;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const [, dd, mm, yyyy] = br;
    return new Date(`${yyyy}-${mm}-${dd}T12:00:00.000Z`);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Lê .xls (Excel 97-2003), .xlsx e .xlsm via SheetJS. */
function parseSpreadsheetRows(buffer: Buffer): string[][] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });

  return rows
    .map((row) => (Array.isArray(row) ? row.map(cellToString) : []))
    .filter((row) => row.some((cell) => cell.length > 0));
}

function isExcelFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith('.xls') || lower.endsWith('.xlsx') || lower.endsWith('.xlsm');
}

export async function parseChronusFile(
  buffer: Buffer,
  filename: string,
): Promise<{ rows: ChronusRow[]; skippedWithoutManifesto: number; totalRows: number }> {
  const table = isExcelFilename(filename) ? parseSpreadsheetRows(buffer) : parseCsvRows(buffer);

  if (table.length < 2) {
    throw new Error('Arquivo vazio ou sem cabeçalho.');
  }

  const header = table[0];
  const col = resolveColumns(header);

  if (col.manifesto < 0) {
    throw new Error(
      'Coluna Manifesto não encontrada no arquivo. Use o export Entregas do Chronus (.xls, .xlsx ou CSV).',
    );
  }
  if (col.dealerCode < 0) throw new Error('Coluna Cód. Concessionária não encontrada no arquivo.');

  const parsed: ChronusRow[] = [];
  let skippedWithoutManifesto = 0;

  for (const line of table.slice(1)) {
    const manifesto = line[col.manifesto]?.trim() ?? '';
    if (!manifesto) {
      skippedWithoutManifesto += 1;
      continue;
    }
    parsed.push({
      manifesto,
      dealerCode: line[col.dealerCode]?.trim() ?? '',
      dealerName: col.dealerName >= 0 ? line[col.dealerName]?.trim() ?? '' : '',
      city: col.city >= 0 ? line[col.city]?.trim() ?? '' : '',
      expiryRaw: col.expiryRaw >= 0 ? line[col.expiryRaw]?.trim() ?? '' : '',
      plate: col.plate >= 0 ? line[col.plate]?.trim() ?? '' : '',
    });
  }

  return {
    rows: parsed,
    skippedWithoutManifesto,
    totalRows: table.length - 1,
  };
}

type DealerRow = {
  id: string;
  code: string | null;
  name: string;
  city: string;
  region: string;
  active: boolean;
};

export async function buildChronusPreview(
  rows: ChronusRow[],
  dealers: DealerRow[],
  options?: {
    importDate?: Date;
    existingRouteNames?: { id: string; name: string; date: Date; status: string }[];
  },
): Promise<ChronusImportPreview> {
  const routeDate = routeDateFromImport(options?.importDate ?? new Date());
  const routeDateIso = routeDate.toISOString().slice(0, 10);
  const dealerByCode = new Map<string, DealerRow>();
  for (const d of dealers) {
    if (d.code) dealerByCode.set(d.code.trim(), d);
  }

  const manifestOrder: string[] = [];
  const byManifesto = new Map<string, ChronusRow[]>();
  for (const row of rows) {
    if (!byManifesto.has(row.manifesto)) manifestOrder.push(row.manifesto);
    const list = byManifesto.get(row.manifesto) ?? [];
    list.push(row);
    byManifesto.set(row.manifesto, list);
  }

  const existingNames = new Map<string, { id: string; name: string; status: string }>();
  for (const route of options?.existingRouteNames ?? []) {
    const day = route.date.toISOString().slice(0, 10);
    existingNames.set(`${route.name.trim().toLowerCase()}|${day}`, {
      id: route.id,
      name: route.name,
      status: route.status,
    });
  }

  const routes: ChronusManifestPreview[] = [];

  for (const manifesto of manifestOrder) {
    const items = byManifesto.get(manifesto)!;
    const name = buildRouteName(manifesto, routeDate);
    const dupKey = `${name.trim().toLowerCase()}|${routeDateIso}`;
    const duplicate = existingNames.get(dupKey) ?? null;

    const dealerGroups = new Map<string, ChronusRow[]>();
    const dealerOrder: string[] = [];
    for (const item of items) {
      const key = item.dealerCode || `${item.dealerName}|${item.city}`;
      if (!dealerGroups.has(key)) dealerOrder.push(key);
      const group = dealerGroups.get(key) ?? [];
      group.push(item);
      dealerGroups.set(key, group);
    }

    const destinations = orderStopsNearestFromPad(
      dealerOrder.map((key, orderIndex) => {
        const group = dealerGroups.get(key)!;
        const sample = group[0];
        const dealer = sample.dealerCode ? dealerByCode.get(sample.dealerCode) : undefined;
        const city = dealer?.city ?? sample.city;
        const expiryExcluded = isExpiryCityExcluded(city);
        const expiryDates = group
          .filter((row) => !isExpiryCityExcluded(row.city))
          .map((row) => parseChronusDate(row.expiryRaw))
          .filter((d): d is Date => !!d);
        const minExpiry =
          !expiryExcluded && expiryDates.length > 0
            ? expiryDates.sort((a, b) => a.getTime() - b.getTime())[0]!
            : null;
        return {
          dealerCode: sample.dealerCode,
          dealerName: dealer?.name ?? sample.dealerName,
          city,
          dealershipId: dealer?.id ?? null,
          matched: !!dealer,
          motoCount: group.length,
          minExpiryDate: minExpiry ? minExpiry.toISOString().slice(0, 10) : null,
          expiryExcluded,
          order: orderIndex,
        };
      }),
    );

    const expiryCandidates = items
      .filter((row) => !isExpiryCityExcluded(row.city))
      .map((row) => parseChronusDate(row.expiryRaw))
      .filter((d): d is Date => !!d);

    const priorityExpiryDate =
      expiryCandidates.length > 0
        ? expiryCandidates.sort((a, b) => a.getTime() - b.getTime())[0]!.toISOString().slice(0, 10)
        : null;
    const hasPriority = hasActivePriority({ priorityExpiryDate });

    const plates = [...new Set(items.map((i) => i.plate).filter(Boolean))];
    const plateResolved = resolveManifestPlateHint(plates);

    routes.push({
      manifesto,
      name,
      date: routeDateIso,
      motoCount: items.length,
      plateHint: plateResolved?.raw ?? (plates.length === 1 ? plates[0]! : plates.length > 1 ? plates.join(', ') : null),
      requiredFleetOwner: plateResolved?.fleetOwner ?? null,
      requiredCapacityMotos: plateResolved?.capacityMotos ?? null,
      plateHintIsFictional: plateResolved?.isFictional ?? false,
      hasPriority,
      priorityExpiryDate,
      destinations,
      unmatchedDealerCodes: destinations.filter((d) => !d.matched).map((d) => d.dealerCode),
      duplicateRouteId: duplicate?.id ?? null,
      duplicateRouteName: duplicate?.name ?? null,
      canRefreshLoad: duplicate?.status === 'AGUARDANDO_PLACAS',
    });
  }

  return {
    routeDate: routeDateIso,
    routeDateLabel: formatRouteDateLabel(routeDate),
    totalRows: rows.length,
    rowsWithoutManifesto: 0,
    manifestCount: routes.length,
    routes,
  };
}

export type ChronusDestinationInput = ChronusManifestPreview['destinations'][number];

export function chronusDestinationsByDealershipId(destinations: ChronusDestinationInput[]) {
  return new Map(
    destinations
      .filter((d) => d.dealershipId)
      .map((d) => [d.dealershipId!, d]),
  );
}

export function chronusDealershipLoadRow(
  dealershipId: string,
  order: number,
  dest: ChronusDestinationInput | undefined,
) {
  const excluded = dest ? isExpiryCityExcluded(dest.city) : false;
  return {
    dealershipId,
    order,
    motoCount: dest?.motoCount ?? null,
    minExpiryDate:
      !excluded && dest?.minExpiryDate != null
        ? new Date(`${dest.minExpiryDate}T12:00:00.000Z`)
        : null,
  };
}

export function chronusRouteLoadData(item: ChronusManifestPreview) {
  const plateHint: ChronusPlateHint | null = item.plateHint
    ? {
        raw: item.plateHint,
        isFictional: item.plateHintIsFictional,
        fleetOwner: item.requiredFleetOwner,
        capacityMotos: item.requiredCapacityMotos,
      }
    : null;

  return {
    totalMotoCount: item.motoCount,
    hasPriority: item.hasPriority,
    priorityExpiryDate: item.priorityExpiryDate
      ? new Date(`${item.priorityExpiryDate}T12:00:00.000Z`)
      : null,
    notes: chronusPlateNotes(plateHint),
    requiredFleetOwner: item.requiredFleetOwner,
    requiredCapacityMotos: item.requiredCapacityMotos,
  };
}
