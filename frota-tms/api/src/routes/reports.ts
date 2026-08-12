import { Router } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '../lib/prisma';
import { authenticate, type AuthRequest } from '../middleware/auth';
import { Role } from '../types/enums';
import { daysUntilExpiry } from '../utils/status';
import { format } from 'date-fns';
import { fetchLslPernoitesForPeriod } from '../lib/pernoite-service';
import { payrollPeriodOffset } from '../utils/pernoite';
import { filterPlatesForRole, plateOwner } from '../data/operatorVisibility';
import { VehicleStatus } from '../types/enums';

const router = Router();
router.use(authenticate);

async function fleetRows() {
  return prisma.vehicle.findMany({ orderBy: { plate: 'asc' } });
}

async function tripRows(from?: string, to?: string) {
  const where: Record<string, unknown> = {};
  if (from || to) {
    where.departureAt = {};
    if (from) (where.departureAt as Record<string, Date>).gte = new Date(from);
    if (to) (where.departureAt as Record<string, Date>).lte = new Date(to);
  }
  return prisma.trip.findMany({
    where,
    include: { vehicle: true, dealership: true, assignedBy: true },
    orderBy: { departureAt: 'desc' },
  });
}

const SENSITIVE_REPORT_TYPES = new Set(['pernoites-lsl']);
const OPERATION_REPORT_TYPES = new Set(['manutencao']);

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  TRUCK: 'Truck',
  CARRETA: 'Carreta',
};

const BLOCK_CATEGORY_LABELS: Record<string, string> = {
  MANUTENCAO: 'Manutenção',
  OUTRO: 'Outro motivo',
};

function denySensitiveReport(req: AuthRequest, type: string): boolean {
  return (
    SENSITIVE_REPORT_TYPES.has(type) &&
    req.user?.role !== Role.ADMIN &&
    req.user?.role !== Role.CONSULTA
  );
}

function denyOperationReport(req: AuthRequest, type: string): boolean {
  return (
    OPERATION_REPORT_TYPES.has(type) &&
    req.user?.role !== Role.ADMIN &&
    req.user?.role !== Role.OPERACAO
  );
}

router.get('/excel/:type', async (req: AuthRequest, res) => {
  const type = String(req.params.type);
  if (denySensitiveReport(req, type)) {
    return res.status(403).json({ error: 'Acesso negado a este relatório' });
  }
  if (denyOperationReport(req, type)) {
    return res.status(403).json({ error: 'Acesso negado a este relatório' });
  }
  const { from, to, vehicleId } = req.query;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FrotaTMS';
  const ws = wb.addWorksheet('Relatório');

  if (type === 'frota' || type === 'disponiveis') {
    let vehicles = await fleetRows();
    if (type === 'disponiveis') vehicles = vehicles.filter((v) => v.status === 'DISPONIVEL');
    ws.columns = [
      { header: 'Placa', key: 'plate', width: 12 },
      { header: 'Tipo', key: 'type', width: 10 },
      { header: 'Marca', key: 'brand', width: 14 },
      { header: 'Modelo', key: 'model', width: 14 },
      { header: 'Ano', key: 'year', width: 8 },
      { header: 'Capacidade (motos)', key: 'capacityMotos', width: 18 },
      { header: 'Motorista padrão', key: 'defaultDriver', width: 18 },
      { header: 'Situação', key: 'status', width: 16 },
    ];
    vehicles.forEach((v) => ws.addRow(v));
  } else if (type === 'viagens' || type === 'diario' || type === 'periodo') {
    const trips = await tripRows(
      type === 'diario' ? format(new Date(), 'yyyy-MM-dd') : (from as string | undefined),
      type === 'diario' ? format(new Date(), 'yyyy-MM-dd') + 'T23:59:59' : (to as string | undefined)
    );
    ws.columns = [
      { header: 'Placa', key: 'plate', width: 12 },
      { header: 'Concessionária', key: 'dealership', width: 24 },
      { header: 'Saída', key: 'departure', width: 18 },
      { header: 'Previsão', key: 'expected', width: 18 },
      { header: 'Retorno', key: 'returned', width: 18 },
      { header: 'Situação', key: 'status', width: 14 },
      { header: 'Responsável', key: 'user', width: 18 },
    ];
    trips.forEach((t) =>
      ws.addRow({
        plate: t.vehicle.plate,
        dealership: t.dealership.name,
        departure: format(t.departureAt, 'dd/MM/yyyy HH:mm'),
        expected: format(t.expectedReturn, 'dd/MM/yyyy'),
        returned: t.returnedAt ? format(t.returnedAt, 'dd/MM/yyyy HH:mm') : '—',
        status: t.status,
        user: t.assignedBy.name,
      })
    );
  } else if (type === 'produtos') {
    const products = await prisma.priorityProduct.findMany({
      where: { active: true },
      orderBy: { expiryDate: 'asc' },
    });
    ws.columns = [
      { header: 'Produto', key: 'product', width: 24 },
      { header: 'Código', key: 'code', width: 12 },
      { header: 'Lote', key: 'lot', width: 12 },
      { header: 'Qtd', key: 'quantity', width: 10 },
      { header: 'Validade', key: 'expiry', width: 14 },
      { header: 'Dias', key: 'days', width: 8 },
    ];
    products.forEach((p) =>
      ws.addRow({
        product: p.product,
        code: p.code,
        lot: p.lot,
        quantity: p.quantity,
        expiry: format(p.expiryDate, 'dd/MM/yyyy'),
        days: daysUntilExpiry(p.expiryDate),
      })
    );
  } else if (type === 'concessionarias') {
    const items = await prisma.dealership.findMany({ orderBy: { name: 'asc' } });
    ws.columns = [
      { header: 'Nome', key: 'name', width: 24 },
      { header: 'Cidade', key: 'city', width: 18 },
      { header: 'UF', key: 'state', width: 6 },
      { header: 'Região', key: 'region', width: 16 },
      { header: 'Distância', key: 'distanceKm', width: 12 },
      { header: 'Tempo médio (dias)', key: 'avgTravelDays', width: 18 },
      { header: 'Veículo', key: 'allowedVehicle', width: 12 },
    ];
    items.forEach((d) => ws.addRow(d));
  } else if (type === 'pernoites-lsl') {
    wb.removeWorksheet(ws.id);
    const offset = Number(req.query.offset ?? 0);
    const safeOffset = Number.isFinite(offset) ? Math.trunc(offset) : 0;
    const period = payrollPeriodOffset(new Date(), safeOffset);
    const data = await fetchLslPernoitesForPeriod(period);

    const wsRanking = wb.addWorksheet('Ranking motoristas');
    wsRanking.columns = [
      { header: 'Motorista', key: 'driver', width: 28 },
      { header: 'Pernoites', key: 'nights', width: 12 },
      { header: 'Viagens', key: 'trips', width: 10 },
      { header: 'Placas no período', key: 'plates', width: 36 },
    ];
    data.ranking.forEach((r) =>
      wsRanking.addRow({
        driver: r.driverName,
        nights: r.pernoites,
        trips: r.trips,
        plates: r.plates.join(', '),
      }),
    );
    wsRanking.addRow([]);
    wsRanking.addRow({ driver: `Período: ${period.label}` });
    wsRanking.addRow({ driver: `Total de pernoites: ${data.totalPernoites}` });

    const wsTrips = wb.addWorksheet('Viagens');
    wsTrips.columns = [
      { header: 'Motorista', key: 'driver', width: 22 },
      { header: 'Placa', key: 'plate', width: 12 },
      { header: 'Saída', key: 'departure', width: 12 },
      { header: 'Previsão retorno', key: 'expected', width: 14 },
      { header: 'Retorno real', key: 'returned', width: 14 },
      { header: 'Destino', key: 'dealership', width: 24 },
      { header: 'Cidade', key: 'city', width: 16 },
      { header: 'Pernoites', key: 'nights', width: 10 },
      { header: 'Confirmado', key: 'confirmed', width: 12 },
      { header: 'Situação', key: 'status', width: 14 },
    ];
    data.trips.forEach((t) =>
      wsTrips.addRow({
        driver: t.driverName ?? '—',
        plate: t.plate,
        departure: format(t.departureAt, 'dd/MM/yyyy'),
        expected: format(t.expectedReturn, 'dd/MM/yyyy'),
        returned: t.returnedAt ? format(t.returnedAt, 'dd/MM/yyyy') : '—',
        dealership: t.dealershipName,
        city: t.dealershipCity,
        nights: t.nights,
        confirmed: t.confirmed ? 'Sim' : 'Previsto',
        status: t.status,
      }),
    );

    const summary = wsTrips.addRow([]);
    summary.getCell(1).value = `Período: ${period.label}`;
    const totalRow = wsTrips.addRow([]);
    totalRow.getCell(1).value = `Total de pernoites: ${data.totalPernoites}`;
  } else if (type === 'manutencao') {
    wb.removeWorksheet(ws.id);

    const vehiclesRaw = await prisma.vehicle.findMany({
      where: {
        OR: [{ maintenanceHold: true }, { status: VehicleStatus.EM_MANUTENCAO }],
      },
      include: { blockedBy: { select: { name: true } } },
      orderBy: [{ blockedAt: 'desc' }, { plate: 'asc' }],
    });
    const vehicles = filterPlatesForRole(req.user?.role, vehiclesRaw);

    const wsCurrent = wb.addWorksheet('Placas bloqueadas');
    wsCurrent.columns = [
      { header: 'Placa', key: 'plate', width: 12 },
      { header: 'Proprietário', key: 'owner', width: 12 },
      { header: 'Tipo', key: 'type', width: 10 },
      { header: 'Marca', key: 'brand', width: 14 },
      { header: 'Modelo', key: 'model', width: 14 },
      { header: 'Capacidade (motos)', key: 'capacityMotos', width: 18 },
      { header: 'Motorista padrão', key: 'defaultDriver', width: 22 },
      { header: 'Categoria', key: 'blockCategory', width: 16 },
      { header: 'Motivo', key: 'blockReason', width: 40 },
      { header: 'Bloqueado em', key: 'blockedAt', width: 18 },
      { header: 'Registrado por', key: 'blockedBy', width: 20 },
      { header: 'Situação', key: 'status', width: 16 },
    ];
    vehicles.forEach((v) =>
      wsCurrent.addRow({
        plate: v.plate,
        owner: plateOwner(v.plate),
        type: VEHICLE_TYPE_LABELS[v.type] ?? v.type,
        brand: v.brand,
        model: v.model,
        capacityMotos: v.capacityMotos,
        defaultDriver: v.defaultDriver ?? '—',
        blockCategory: BLOCK_CATEGORY_LABELS[v.blockCategory ?? 'MANUTENCAO'] ?? v.blockCategory ?? '—',
        blockReason: v.blockReason ?? '—',
        blockedAt: v.blockedAt ? format(v.blockedAt, 'dd/MM/yyyy HH:mm') : '—',
        blockedBy: v.blockedBy?.name ?? '—',
        status: v.status === VehicleStatus.EM_MANUTENCAO ? 'Em manutenção' : v.status,
      }),
    );
    wsCurrent.addRow([]);
    wsCurrent.addRow({ plate: `Total: ${vehicles.length} placa(s) em manutenção/bloqueio` });
    wsCurrent.addRow({ plate: `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}` });

    const historyFrom = from ? new Date(String(from)) : undefined;
    const historyTo = to ? new Date(String(to) + 'T23:59:59') : undefined;
    const historyWhere: Record<string, unknown> = {
      action: { in: ['BLOQUEIO_MANUTENCAO', 'LIBERACAO_MANUTENCAO'] },
    };
    if (historyFrom || historyTo) {
      historyWhere.createdAt = {};
      if (historyFrom) (historyWhere.createdAt as Record<string, Date>).gte = historyFrom;
      if (historyTo) (historyWhere.createdAt as Record<string, Date>).lte = historyTo;
    }

    const historyRaw = await prisma.vehicleHistory.findMany({
      where: historyWhere,
      include: {
        vehicle: { select: { plate: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const history = filterPlatesForRole(
      req.user?.role,
      historyRaw.map((h) => ({ ...h, plate: h.vehicle.plate })),
    );

    const wsHistory = wb.addWorksheet('Histórico');
    wsHistory.columns = [
      { header: 'Data/hora', key: 'createdAt', width: 18 },
      { header: 'Placa', key: 'plate', width: 12 },
      { header: 'Ação', key: 'action', width: 20 },
      { header: 'De', key: 'fromStatus', width: 14 },
      { header: 'Para', key: 'toStatus', width: 14 },
      { header: 'Detalhes', key: 'details', width: 44 },
      { header: 'Usuário', key: 'user', width: 20 },
    ];
    const ACTION_LABELS: Record<string, string> = {
      BLOQUEIO_MANUTENCAO: 'Bloqueio',
      LIBERACAO_MANUTENCAO: 'Liberação',
    };
    history.forEach((h) =>
      wsHistory.addRow({
        createdAt: format(h.createdAt, 'dd/MM/yyyy HH:mm'),
        plate: h.vehicle.plate,
        action: ACTION_LABELS[h.action] ?? h.action,
        fromStatus: h.fromStatus ?? '—',
        toStatus: h.toStatus ?? '—',
        details: h.details ?? '—',
        user: h.user?.name ?? '—',
      }),
    );
    if (historyFrom || historyTo) {
      wsHistory.addRow([]);
      wsHistory.addRow({
        createdAt: `Período: ${historyFrom ? format(historyFrom, 'dd/MM/yyyy') : '…'} a ${
          historyTo ? format(historyTo, 'dd/MM/yyyy') : '…'
        }`,
      });
    }
  } else if (type === 'historico-placa' && vehicleId) {
    const trips = await prisma.trip.findMany({
      where: { vehicleId: String(vehicleId) },
      include: { dealership: true },
      orderBy: { departureAt: 'desc' },
    });
    ws.columns = [
      { header: 'Saída', key: 'out', width: 18 },
      { header: 'Destino', key: 'dest', width: 24 },
      { header: 'Retorno', key: 'ret', width: 18 },
      { header: 'Status', key: 'status', width: 14 },
    ];
    trips.forEach((t) =>
      ws.addRow({
        out: format(t.departureAt, 'dd/MM/yyyy'),
        dest: t.dealership.name,
        ret: t.returnedAt ? format(t.returnedAt, 'dd/MM/yyyy') : '—',
        status: t.status,
      })
    );
  } else {
    return res.status(400).json({ error: 'Tipo de relatório inválido' });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=relatorio-${type}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
});

router.get('/pdf/:type', async (req: AuthRequest, res) => {
  const type = String(req.params.type);
  if (denySensitiveReport(req, type)) {
    return res.status(403).json({ error: 'Acesso negado a este relatório' });
  }
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=relatorio-${type}.pdf`);
  doc.pipe(res);

  doc.fontSize(16).text('FrotaTMS — Relatório', { align: 'left' });
  doc.fontSize(10).fillColor('#666').text(`Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`);
  doc.moveDown();
  doc.fillColor('#000');

  if (type === 'frota' || type === 'disponiveis') {
    let vehicles = await fleetRows();
    if (type === 'disponiveis') vehicles = vehicles.filter((v) => v.status === 'DISPONIVEL');
    doc.fontSize(12).text(type === 'disponiveis' ? 'Veículos Disponíveis' : 'Relatório da Frota');
    doc.moveDown(0.5);
    vehicles.forEach((v) => {
      doc.fontSize(10).text(`${v.plate} | ${v.type} | ${v.brand} ${v.model} | ${v.status}`);
    });
  } else if (type === 'produtos') {
    const products = await prisma.priorityProduct.findMany({
      where: { active: true },
      orderBy: { expiryDate: 'asc' },
    });
    doc.fontSize(12).text('Produtos Prioritários');
    doc.moveDown(0.5);
    products.forEach((p) => {
      doc
        .fontSize(10)
        .text(
          `${p.product} | Lote ${p.lot} | Val ${format(p.expiryDate, 'dd/MM/yyyy')} | ${daysUntilExpiry(p.expiryDate)} dias`
        );
    });
  } else if (type === 'viagens' || type === 'diario' || type === 'periodo') {
    const trips = await tripRows(
      req.query.from as string | undefined,
      req.query.to as string | undefined
    );
    doc.fontSize(12).text('Relatório de Viagens');
    doc.moveDown(0.5);
    trips.slice(0, 80).forEach((t) => {
      doc
        .fontSize(10)
        .text(
          `${t.vehicle.plate} → ${t.dealership.name} | ${format(t.departureAt, 'dd/MM/yyyy')} | ${t.status}`
        );
    });
  } else if (type === 'concessionarias') {
    const items = await prisma.dealership.findMany({ orderBy: { name: 'asc' } });
    doc.fontSize(12).text('Concessionárias');
    doc.moveDown(0.5);
    items.forEach((d) => {
      doc.fontSize(10).text(`${d.name} — ${d.city}/${d.state} (${d.avgTravelDays} dias)`);
    });
  } else {
    doc.text('Tipo de relatório não suportado neste formato.');
  }

  doc.end();
});

export default router;
