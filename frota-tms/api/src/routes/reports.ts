import { Router } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { Role } from '../types/enums';
import { daysUntilExpiry } from '../utils/status';
import { format } from 'date-fns';

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

router.get('/excel/:type', async (req, res) => {
  const { type } = req.params;
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

router.get('/pdf/:type', async (req, res) => {
  const { type } = req.params;
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
