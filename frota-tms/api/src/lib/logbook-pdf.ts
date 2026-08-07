import PDFDocument from 'pdfkit';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { TripLogbook } from '@prisma/client';
import {
  LOGBOOK_CHECKLIST_ITEMS,
  LOGBOOK_FORM_CODE,
  parseChecklistJson,
  parseFuelingJson,
} from './logbook-checklist';

type LogbookPdfInput = TripLogbook & {
  trip: {
    driverName: string | null;
    departureAt: Date;
    expectedReturn: Date;
    returnedAt: Date | null;
    dealership: { name: string; city: string };
    route: { name: string; date: Date } | null;
  };
  vehicle: { plate: string; brand: string; model: string };
  coordinatorUser?: { name: string } | null;
};

function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(base64, 'base64');
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return '—';
  return format(d, 'dd/MM/yyyy', { locale: ptBR });
}

function fmtDateTime(d: Date | null | undefined) {
  if (!d) return '—';
  return format(d, 'dd/MM/yyyy HH:mm', { locale: ptBR });
}

function cell(state: ReturnType<typeof parseChecklistJson>[string]) {
  if (!state?.status) return '—';
  const q = state.qty != null ? ` (${state.qty})` : '';
  return `${state.status}${q}`;
}

export function buildLogbookPdf(logbook: LogbookPdfInput) {
  const doc = new PDFDocument({ margin: 36, size: 'A4' });
  const dep = parseChecklistJson(logbook.checklistDeparture);
  const ret = parseChecklistJson(logbook.checklistReturn);
  const fuelDep = parseFuelingJson(logbook.fuelingDepartureJson);
  const fuelRet = parseFuelingJson(logbook.fuelingReturnJson);

  doc.fontSize(14).text('LSL TRANSPORTES LTDA', { align: 'center' });
  doc.fontSize(11).text('CHECK-LIST FROTA — Diário de bordo digital', { align: 'center' });
  doc.fontSize(9).fillColor('#444').text(logbook.formCode || LOGBOOK_FORM_CODE, { align: 'center' });
  doc.moveDown(0.5);
  doc.fillColor('#000');

  doc.fontSize(9);
  doc.text(`Placa: ${logbook.vehicle.plate}  ·  ${logbook.vehicle.brand} ${logbook.vehicle.model}`);
  doc.text(`Motorista: ${logbook.trip.driverName ?? '—'}  ·  Matrícula: ${logbook.driverMatricula ?? '—'}`);
  if (logbook.helperName) {
    doc.text(`Ajudante: ${logbook.helperName}  ·  Matrícula: ${logbook.helperMatricula ?? '—'}`);
  }
  doc.text(`Roteiro: ${logbook.trip.route?.name ?? '—'}`);
  doc.text(`Destino: ${logbook.trip.dealership.name} — ${logbook.trip.dealership.city}`);
  doc.text(
    `Saída: ${fmtDateTime(logbook.trip.departureAt)}  ·  Retorno prev.: ${fmtDate(logbook.trip.expectedReturn)}  ·  Retorno real: ${fmtDateTime(logbook.trip.returnedAt)}`,
  );
  doc.text(
    `KM inicial: ${logbook.kmInitial ?? '—'}  ·  KM final: ${logbook.kmFinal ?? '—'}  ·  Diesel saída/retorno: ${logbook.fuelDieselDeparture ?? '—'} / ${logbook.fuelDieselReturn ?? '—'}  ·  Óleo: ${logbook.fuelOilDeparture ?? '—'} / ${logbook.fuelOilReturn ?? '—'}`,
  );

  if (logbook.damageDescription) doc.text(`Avaria: ${logbook.damageDescription}`);
  if (logbook.maintenanceDescription) doc.text(`Manutenção: ${logbook.maintenanceDescription}`);

  doc.moveDown(0.5);
  doc.fontSize(10).text('Pontos de verificação', { underline: true });
  doc.moveDown(0.25);

  const colItem = 36;
  const colDep = 300;
  const colRet = 380;
  doc.fontSize(8).fillColor('#666');
  doc.text('Item', colItem, doc.y, { continued: false });
  const headerY = doc.y - 10;
  doc.text('Saída', colDep, headerY);
  doc.text('Retorno', colRet, headerY);
  doc.moveDown(0.3);
  doc.fillColor('#000');

  for (const item of LOGBOOK_CHECKLIST_ITEMS) {
    const y = doc.y;
    if (y > 700) {
      doc.addPage();
      doc.fontSize(8);
    }
    doc.fontSize(7.5).text(item.label, colItem, doc.y, { width: 250 });
    const rowY = doc.y - 10;
    doc.text(cell(dep[item.id]), colDep, rowY);
    doc.text(cell(ret[item.id]), colRet, rowY);
    doc.moveDown(0.15);
  }

  doc.moveDown(0.5);
  doc.fontSize(8).fillColor('#444');
  if (fuelDep.length > 0 || fuelRet.length > 0) {
    doc.text(`Abastecimento saída: ${JSON.stringify(fuelDep)}  ·  retorno: ${JSON.stringify(fuelRet)}`);
  }
  doc.text(`Assinatura saída: ${fmtDateTime(logbook.departureSignedAt)}  ·  retorno: ${fmtDateTime(logbook.returnSignedAt)}`);
  if (logbook.coordinatorSignedAt) {
    doc.text(
      `Validado por ${logbook.coordinatorUser?.name ?? 'coordenador'} em ${fmtDateTime(logbook.coordinatorSignedAt)}`,
    );
  }
  doc.text(`Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`);
  doc.fillColor('#000');

  doc.moveDown(0.5);
  const sigY = doc.y;
  const sigW = 160;
  const sigH = 55;

  if (logbook.departureSignaturePng) {
    try {
      doc.fontSize(7).text('Motorista (saída)', 36, sigY);
      doc.image(dataUrlToBuffer(logbook.departureSignaturePng), 36, sigY + 10, {
        fit: [sigW, sigH],
      });
    } catch {
      doc.text('Assinatura saída indisponível', 36, sigY + 12);
    }
  }

  if (logbook.returnSignaturePng) {
    try {
      doc.fontSize(7).text('Motorista (retorno)', 220, sigY);
      doc.image(dataUrlToBuffer(logbook.returnSignaturePng), 220, sigY + 10, {
        fit: [sigW, sigH],
      });
    } catch {
      doc.text('Assinatura retorno indisponível', 220, sigY + 12);
    }
  }

  if (logbook.coordinatorSignaturePng) {
    try {
      doc.fontSize(7).text('Líder / Coordenador', 400, sigY);
      doc.image(dataUrlToBuffer(logbook.coordinatorSignaturePng), 400, sigY + 10, {
        fit: [sigW, sigH],
      });
    } catch {
      doc.text('Assinatura coordenador indisponível', 400, sigY + 12);
    }
  }

  doc.fontSize(7).fillColor('#888').text('Período de retenção: 1 ano', 36, 780, { align: 'center' });

  return doc;
}
