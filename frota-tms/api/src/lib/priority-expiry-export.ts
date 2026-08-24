import ExcelJS from 'exceljs';
import { isExpiryCityExcluded } from './chronus-import';
import { operationalTodayKey } from '../utils/timezone';

const OPEN_STATUSES = new Set(['RASCUNHO', 'AGUARDANDO_PLACAS', 'EM_ANDAMENTO']);

const ROUTE_STATUS_LABELS: Record<string, string> = {
  RASCUNHO: 'Montando',
  AGUARDANDO_PLACAS: 'Com Operação',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
};

export type ExpiryTone = 'expired' | 'today' | 'tomorrow' | 'later' | 'none';

export type PriorityExpiryInputRoute = {
  name: string;
  date: Date | string;
  status: string;
  hasPriority?: boolean;
  priorityExpiryDate?: Date | string | null;
  dealership?: {
    id: string;
    code?: string | null;
    name: string;
    city: string;
    state: string;
  } | null;
  dealerships?: {
    motoCount?: number | null;
    minExpiryDate?: Date | string | null;
    dealership: {
      id: string;
      code?: string | null;
      name: string;
      city: string;
      state: string;
    };
  }[];
  vehicles?: { vehicle?: { plate?: string | null; defaultDriver?: string | null } | null }[];
  trips?: {
    status: string;
    driverName?: string | null;
    vehicle?: { plate?: string | null; defaultDriver?: string | null } | null;
  }[];
};

export type PriorityExpiryDetailRow = {
  vencimento: string;
  vencimentoLabel: string;
  situacao: string;
  situacaoTone: ExpiryTone;
  concessionaria: string;
  codigo: string;
  cidade: string;
  uf: string;
  motos: number | null;
  roteiro: string;
  dataCarregamento: string;
  statusRoteiro: string;
  placa: string;
  motorista: string;
  dealershipId: string;
};

export type PriorityExpiryDealerRow = {
  dealershipId: string;
  concessionaria: string;
  codigo: string;
  cidade: string;
  uf: string;
  vencimento: string;
  vencimentoLabel: string;
  situacao: string;
  situacaoTone: ExpiryTone;
  placa: string;
  roteiro: string;
};

export type PriorityExpiryRouteRow = {
  placa: string;
  motorista: string;
  roteiro: string;
  dataCarregamento: string;
  statusRoteiro: string;
  vencimento: string;
  vencimentoLabel: string;
  situacao: string;
  situacaoTone: ExpiryTone;
  motos: number | null;
  destinos: string;
};

export function calendarKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

export function formatBrDay(value: Date | string | null | undefined): string {
  const key = calendarKey(value);
  if (!key) return '—';
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year}`;
}

export function diffCalendarDays(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T12:00:00.000Z`);
  const to = Date.parse(`${toKey}T12:00:00.000Z`);
  return Math.round((to - from) / 86_400_000);
}

export function expirySituation(
  expiry: Date | string | null | undefined,
  todayKey = operationalTodayKey(),
): { situacao: string; tone: ExpiryTone; vencimento: string } {
  const key = calendarKey(expiry);
  if (!key) return { situacao: 'Sem vencimento', tone: 'none', vencimento: '' };
  const days = diffCalendarDays(todayKey, key);
  if (days < 0) return { situacao: 'Vencido', tone: 'expired', vencimento: key };
  if (days === 0) return { situacao: 'Vence hoje', tone: 'today', vencimento: key };
  if (days === 1) return { situacao: 'Vence amanhã', tone: 'tomorrow', vencimento: key };
  return { situacao: `Em ${days} dias`, tone: 'later', vencimento: key };
}

function isOpenPriorityRoute(route: PriorityExpiryInputRoute, todayKey: string): boolean {
  if (!OPEN_STATUSES.has(route.status)) return false;
  const expiryKey = calendarKey(route.priorityExpiryDate);
  if (expiryKey) return diffCalendarDays(todayKey, expiryKey) <= 1;
  return !!route.hasPriority;
}

function openTrip(route: PriorityExpiryInputRoute) {
  return (
    route.trips?.find((t) => t.status === 'EM_ANDAMENTO' || t.status === 'ATRASADO') ??
    route.trips?.[0]
  );
}

function plateAndDriver(route: PriorityExpiryInputRoute): { plate: string; driver: string } {
  const trip = openTrip(route);
  const plate =
    trip?.vehicle?.plate ||
    route.vehicles?.[0]?.vehicle?.plate ||
    '';
  const driver =
    trip?.driverName?.trim() ||
    trip?.vehicle?.defaultDriver?.trim() ||
    route.vehicles?.[0]?.vehicle?.defaultDriver?.trim() ||
    '';
  return { plate, driver };
}

function stopsOf(route: PriorityExpiryInputRoute) {
  if (route.dealerships && route.dealerships.length > 0) return route.dealerships;
  if (route.dealership) {
    return [{ motoCount: null, minExpiryDate: route.priorityExpiryDate ?? null, dealership: route.dealership }];
  }
  return [];
}

export function buildPriorityExpiryDetailRows(
  routes: PriorityExpiryInputRoute[],
  todayKey = operationalTodayKey(),
): PriorityExpiryDetailRow[] {
  const rows: PriorityExpiryDetailRow[] = [];
  for (const route of routes) {
    if (!isOpenPriorityRoute(route, todayKey)) continue;
    const { plate, driver } = plateAndDriver(route);
    for (const stop of stopsOf(route)) {
      if (isExpiryCityExcluded(stop.dealership.city)) continue;
      const sit = expirySituation(stop.minExpiryDate, todayKey);
      rows.push({
        vencimento: sit.vencimento,
        vencimentoLabel: sit.vencimento ? formatBrDay(sit.vencimento) : '—',
        situacao: sit.situacao,
        situacaoTone: sit.tone,
        concessionaria: stop.dealership.name,
        codigo: stop.dealership.code?.trim() || '',
        cidade: stop.dealership.city,
        uf: stop.dealership.state,
        motos: stop.motoCount ?? null,
        roteiro: route.name,
        dataCarregamento: formatBrDay(route.date),
        statusRoteiro: ROUTE_STATUS_LABELS[route.status] ?? route.status,
        placa: plate || '—',
        motorista: driver || '—',
        dealershipId: stop.dealership.id,
      });
    }
  }
  rows.sort((a, b) => {
    const plate = a.placa.localeCompare(b.placa, 'pt-BR');
    if (plate !== 0) return plate;
    const route = a.roteiro.localeCompare(b.roteiro, 'pt-BR');
    if (route !== 0) return route;
    if (a.vencimento && b.vencimento && a.vencimento !== b.vencimento) {
      return a.vencimento.localeCompare(b.vencimento);
    }
    if (a.vencimento && !b.vencimento) return -1;
    if (!a.vencimento && b.vencimento) return 1;
    return a.concessionaria.localeCompare(b.concessionaria, 'pt-BR');
  });
  return rows;
}

export function groupPriorityExpiryByPlateRoute(
  rows: PriorityExpiryDetailRow[],
): PriorityExpiryRouteRow[] {
  const byRoute = new Map<string, PriorityExpiryDetailRow[]>();
  for (const row of rows) {
    const key = `${row.roteiro}||${row.placa}`;
    const list = byRoute.get(key) ?? [];
    list.push(row);
    byRoute.set(key, list);
  }
  const grouped: PriorityExpiryRouteRow[] = [];
  for (const list of byRoute.values()) {
    const first = list[0];
    const withDate = [...list].filter((r) => r.vencimento).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const earliest = withDate[0] ?? first;
    const motos = list.reduce<number | null>((sum, r) => {
      if (r.motos == null) return sum;
      return (sum ?? 0) + r.motos;
    }, null);
    const destinos = [...list]
      .sort((a, b) => {
        if (a.vencimento && b.vencimento && a.vencimento !== b.vencimento) {
          return a.vencimento.localeCompare(b.vencimento);
        }
        if (a.vencimento && !b.vencimento) return -1;
        if (!a.vencimento && b.vencimento) return 1;
        return a.concessionaria.localeCompare(b.concessionaria, 'pt-BR');
      })
      .map((r) => `${r.concessionaria} (${r.vencimentoLabel === '—' ? 's/ venc.' : r.vencimentoLabel})`)
      .join(' · ');
    grouped.push({
      placa: first.placa,
      motorista: first.motorista,
      roteiro: first.roteiro,
      dataCarregamento: first.dataCarregamento,
      statusRoteiro: first.statusRoteiro,
      vencimento: earliest.vencimento,
      vencimentoLabel: earliest.vencimentoLabel,
      situacao: earliest.situacao,
      situacaoTone: earliest.situacaoTone,
      motos,
      destinos,
    });
  }
  grouped.sort((a, b) => {
    if (a.vencimento && b.vencimento && a.vencimento !== b.vencimento) {
      return a.vencimento.localeCompare(b.vencimento);
    }
    if (a.vencimento && !b.vencimento) return -1;
    if (!a.vencimento && b.vencimento) return 1;
    const plateCmp = a.placa.localeCompare(b.placa, 'pt-BR');
    if (plateCmp !== 0) return plateCmp;
    return a.roteiro.localeCompare(b.roteiro, 'pt-BR');
  });
  return grouped;
}

export function groupPriorityExpiryByDealership(
  rows: PriorityExpiryDetailRow[],
): PriorityExpiryDealerRow[] {
  const byId = new Map<string, PriorityExpiryDetailRow[]>();
  for (const row of rows) {
    const list = byId.get(row.dealershipId) ?? [];
    list.push(row);
    byId.set(row.dealershipId, list);
  }
  const grouped: PriorityExpiryDealerRow[] = [];
  for (const [dealershipId, list] of byId) {
    const first = list[0];
    const withDate = list.filter((r) => r.vencimento).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const earliest = withDate[0] ?? first;
    grouped.push({
      dealershipId,
      concessionaria: first.concessionaria,
      codigo: first.codigo,
      cidade: first.cidade,
      uf: first.uf,
      vencimento: earliest.vencimento,
      vencimentoLabel: earliest.vencimentoLabel,
      situacao: earliest.situacao,
      situacaoTone: earliest.situacaoTone,
      placa: earliest.placa,
      roteiro: earliest.roteiro,
    });
  }
  grouped.sort((a, b) => {
    if (a.vencimento && b.vencimento && a.vencimento !== b.vencimento) {
      return a.vencimento.localeCompare(b.vencimento);
    }
    if (a.vencimento && !b.vencimento) return -1;
    if (!a.vencimento && b.vencimento) return 1;
    return a.concessionaria.localeCompare(b.concessionaria, 'pt-BR');
  });
  return grouped;
}

const TONE_FILL: Record<ExpiryTone, string | null> = {
  expired: 'FECACA',
  today: 'FED7AA',
  tomorrow: 'FDE68A',
  later: null,
  none: null,
};

function applyTone(row: ExcelJS.Row, tone: ExpiryTone, situacaoCell: number) {
  const fill = TONE_FILL[tone];
  if (!fill) return;
  const cell = row.getCell(situacaoCell);
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${fill}` } };
  cell.font = { bold: true };
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 22;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };
}

export async function buildPriorityExpiryWorkbook(
  routes: PriorityExpiryInputRoute[],
  todayKey = operationalTodayKey(),
): Promise<ExcelJS.Workbook> {
  const detail = buildPriorityExpiryDetailRows(routes, todayKey);
  const byPlateRoute = groupPriorityExpiryByPlateRoute(detail);
  const byDealer = groupPriorityExpiryByDealership(detail);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'FrotaTMS';
  wb.created = new Date();

  const plateSheet = wb.addWorksheet('Por placa e roteiro');
  plateSheet.columns = [
    { header: 'Placa', key: 'placa', width: 14 },
    { header: 'Motorista', key: 'motorista', width: 28 },
    { header: 'Roteiro', key: 'roteiro', width: 28 },
    { header: 'Carga', key: 'dataCarregamento', width: 14 },
    { header: 'Status', key: 'statusRoteiro', width: 16 },
    { header: 'Menor vencimento', key: 'vencimentoLabel', width: 18 },
    { header: 'Situação', key: 'situacao', width: 16 },
    { header: 'Motos', key: 'motos', width: 10 },
    { header: 'Concessionárias (vencimento)', key: 'destinos', width: 56 },
  ];
  if (byPlateRoute.length === 0) {
    plateSheet.addRow({
      placa: '—',
      situacao: 'Sem prioridades abertas',
      destinos: 'Nenhum roteiro com vencimento nesta lista',
    });
  } else {
    for (const row of byPlateRoute) {
      const excelRow = plateSheet.addRow({
        placa: row.placa,
        motorista: row.motorista,
        roteiro: row.roteiro,
        dataCarregamento: row.dataCarregamento,
        statusRoteiro: row.statusRoteiro,
        vencimentoLabel: row.vencimentoLabel,
        situacao: row.situacao,
        motos: row.motos ?? '',
        destinos: row.destinos,
      });
      applyTone(excelRow, row.situacaoTone, 7);
    }
  }
  styleHeader(plateSheet);

  const summary = wb.addWorksheet('Resumo concessionária');
  summary.columns = [
    { header: 'Menor vencimento', key: 'vencimentoLabel', width: 18 },
    { header: 'Situação', key: 'situacao', width: 16 },
    { header: 'Concessionária', key: 'concessionaria', width: 32 },
    { header: 'Código', key: 'codigo', width: 12 },
    { header: 'Cidade', key: 'cidade', width: 22 },
    { header: 'UF', key: 'uf', width: 6 },
    { header: 'Placa', key: 'placa', width: 14 },
    { header: 'Roteiro', key: 'roteiro', width: 28 },
  ];
  if (byDealer.length === 0) {
    summary.addRow({
      vencimentoLabel: '—',
      situacao: 'Sem prioridades abertas',
      concessionaria: 'Nenhuma concessionária com vencimento nesta lista',
    });
  } else {
    for (const row of byDealer) {
      const excelRow = summary.addRow({
        vencimentoLabel: row.vencimentoLabel,
        situacao: row.situacao,
        concessionaria: row.concessionaria,
        codigo: row.codigo,
        cidade: row.cidade,
        uf: row.uf,
        placa: row.placa,
        roteiro: row.roteiro,
      });
      applyTone(excelRow, row.situacaoTone, 2);
    }
  }
  styleHeader(summary);

  return wb;
}

export function priorityExpiryFilename(todayKey = operationalTodayKey()): string {
  return `vencimentos-prioridades-${todayKey}.xlsx`;
}
