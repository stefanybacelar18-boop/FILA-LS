import PDFDocument from 'pdfkit';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { TripLogbook } from '@prisma/client';
import {
  LOGBOOK_CHECKLIST_ITEMS,
  LOGBOOK_FORM_CODE,
  logbookWorkflowStatus,
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
  if (!d) return '________';
  return format(d, 'dd/MM/yyyy', { locale: ptBR });
}

function fmtTime(d: Date | null | undefined) {
  if (!d) return '________';
  return format(d, 'HH:mm', { locale: ptBR });
}

function cell(state: ReturnType<typeof parseChecklistJson>[string]) {
  if (!state?.status) return '—';
  const q = state.qty != null ? ` ${state.qty}` : '';
  return `${state.status}${q}`;
}

function drawWatermark(doc: InstanceType<typeof PDFDocument>, text: string) {
  doc.save();
  doc.rotate(-35, { origin: [300, 400] });
  doc.fontSize(44).fillColor('#cccccc').opacity(0.35).text(text, 80, 380, { align: 'center', width: 440 });
  doc.opacity(1).fillColor('#000');
  doc.restore();
}

export function buildLogbookPdf(logbook: LogbookPdfInput) {
  const doc = new PDFDocument({ margin: 28, size: 'A4' });
  const dep = parseChecklistJson(logbook.checklistDeparture);
  const ret = parseChecklistJson(logbook.checklistReturn);
  const status = logbookWorkflowStatus(logbook);
  const archived = status === 'ARQUIVADO';

  if (!archived) {
    drawWatermark(
      doc,
      status === 'AGUARDANDO_COORDENADOR' ? 'AGUARDANDO\nCOORDENADOR' : 'RASCUNHO',
    );
  }

  // —— Cabeçalho (modelo FCDE-LSLT-018c-01) ——
  doc.fontSize(13).text('LSL TRANSPORTES LTDA', { align: 'center' });
  doc.fontSize(11).text('CHECK-LIST FROTA', { align: 'center' });
  doc.fontSize(8).fillColor('#333').text(logbook.formCode || LOGBOOK_FORM_CODE, { align: 'center' });
  doc.moveDown(0.4);
  doc.fillColor('#000').fontSize(8);

  const y0 = doc.y;
  doc.text(`MOTORISTA: ${logbook.trip.driverName ?? '________________'}`, 28, y0);
  doc.text(`MAT: ${logbook.driverMatricula ?? '______'}`, 320, y0);
  doc.text(`AJUDANTE: ${logbook.helperName ?? '________________'}`, 28, y0 + 12);
  doc.text(`MAT: ${logbook.helperMatricula ?? '______'}`, 320, y0 + 12);
  doc.text(`DATA: ${fmtDate(logbook.trip.departureAt)}`, 28, y0 + 24);
  doc.text(`PLACA: ${logbook.vehicle.plate}`, 320, y0 + 24);
  doc.y = y0 + 40;

  doc.fontSize(7).fillColor('#444');
  doc.text('PONTOS DE VERIFICAÇÃO — OK / NG / QTDE', { align: 'center' });
  doc.fillColor('#000');

  const tableTop = doc.y + 4;
  const colL = 28;
  const colR = 300;
  const colDepL = 200;
  const colRetL = 248;
  const colDepR = 472;
  const colRetR = 520;
  const rowH = 11;

  doc.fontSize(6.5);
  doc.text('SAÍDA', colDepL, tableTop);
  doc.text('RETOR.', colRetL, tableTop);
  doc.text('SAÍDA', colDepR, tableTop);
  doc.text('RETOR.', colRetR, tableTop);

  let y = tableTop + 10;
  for (let i = 0; i < LOGBOOK_CHECKLIST_ITEMS.length; i += 2) {
    if (y > 520) {
      doc.addPage();
      if (!archived) drawWatermark(doc, 'AGUARDANDO COORDENADOR');
      y = 40;
    }
    const left = LOGBOOK_CHECKLIST_ITEMS[i];
    const right = LOGBOOK_CHECKLIST_ITEMS[i + 1];
    doc.fontSize(6.5).text(left.label.toUpperCase(), colL, y, { width: 165 });
    doc.text(cell(dep[left.id]), colDepL, y, { width: 40 });
    doc.text(cell(ret[left.id]), colRetL, y, { width: 40 });
    if (right) {
      doc.text(right.label.toUpperCase(), colR, y, { width: 165 });
      doc.text(cell(dep[right.id]), colDepR, y, { width: 40 });
      doc.text(cell(ret[right.id]), colRetR, y, { width: 40 });
    }
    y += rowH;
  }

  doc.y = Math.max(y + 8, 540);
  doc.fontSize(8);
  doc.text(
    `KM INICIAL: ${logbook.kmInitial ?? '________'}    KM FINAL: ${logbook.kmFinal ?? '________'}`,
  );
  doc.text(
    `DATA SAÍDA: ${fmtDate(logbook.trip.departureAt)}    DATA RETORNO: ${fmtDate(logbook.trip.returnedAt ?? logbook.trip.expectedReturn)}`,
  );
  doc.text(
    `HORÁRIO SAÍDA: ${fmtTime(logbook.departureSignedAt)}    HORÁRIO RETORNO: ${fmtTime(logbook.returnSignedAt)}`,
  );
  doc.text(
    `DIESEL saída/retorno: ${logbook.fuelDieselDeparture ?? '—'} / ${logbook.fuelDieselReturn ?? '—'}    ÓLEO: ${logbook.fuelOilDeparture ?? '—'} / ${logbook.fuelOilReturn ?? '—'}`,
  );

  if (logbook.damageDescription) doc.text(`LOCAL AVARIADO: ${logbook.damageDescription}`);
  if (logbook.maintenanceDescription) doc.text(`DESCRIÇÃO MANUTENÇÃO: ${logbook.maintenanceDescription}`);

  const sigY = doc.y + 12;
  const sigW = 155;
  const sigH = 50;

  doc.fontSize(7);
  if (logbook.departureSignaturePng) {
    doc.text('Motorista (saída)', 28, sigY);
    try {
      doc.image(dataUrlToBuffer(logbook.departureSignaturePng), 28, sigY + 10, { fit: [sigW, sigH] });
    } catch {
      doc.text('(assinatura)', 28, sigY + 20);
    }
  } else {
    doc.text('Motorista (saída) ___________________', 28, sigY + 20);
  }

  if (logbook.returnSignaturePng) {
    doc.text('Motorista (retorno)', 210, sigY);
    try {
      doc.image(dataUrlToBuffer(logbook.returnSignaturePng), 210, sigY + 10, { fit: [sigW, sigH] });
    } catch {
      doc.text('(assinatura)', 210, sigY + 20);
    }
  } else {
    doc.text('Motorista (retorno) ___________________', 210, sigY + 20);
  }

  if (logbook.coordinatorSignaturePng) {
    const coordName = logbook.coordinatorUser?.name ?? 'Coordenador';
    doc.text(`Líder ou Coordenador — ${coordName}`, 392, sigY);
    try {
      doc.image(dataUrlToBuffer(logbook.coordinatorSignaturePng), 392, sigY + 10, { fit: [sigW, sigH] });
    } catch {
      doc.text('(assinatura)', 392, sigY + 20);
    }
    doc.fontSize(7).fillColor('#166534');
    doc.text(`CONFERIDO em ${fmtDate(logbook.coordinatorSignedAt)}`, 392, sigY + sigH + 14);
    doc.fillColor('#000');
  } else {
    doc.text('Líder ou Coordenador ___________________', 392, sigY + 20);
  }

  doc.fontSize(6.5).fillColor('#666');
  doc.text('PERÍODO DE RETENÇÃO: 1 ANO', 28, 800, { align: 'center', width: 540 });
  if (archived) {
    doc.fillColor('#166534').text('DOCUMENTO ARQUIVADO — CÓPIA OFICIAL', { align: 'center', width: 540 });
  }
  doc.fillColor('#000');

  return doc;
}
