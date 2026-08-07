import PDFDocument from 'pdfkit';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { TripLogbook } from '@prisma/client';
import {
  LOGBOOK_CHECKLIST_ITEMS,
  LOGBOOK_FORM_CODE,
  type FuelingEntry,
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

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 14;

function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(base64, 'base64');
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return '';
  return format(d, 'dd/MM/yy', { locale: ptBR });
}

function fmtTime(d: Date | null | undefined) {
  if (!d) return '';
  return format(d, 'HH:mm', { locale: ptBR });
}

function cell(state: ReturnType<typeof parseChecklistJson>[string]) {
  if (!state?.status) return '';
  const q = state.qty != null ? ` (${state.qty})` : '';
  return `${state.status}${q}`;
}

function fuelGaugeRatio(level: string | null | undefined): number {
  switch (level) {
    case 'C':
      return 1;
    case '3/4':
      return 0.75;
    case '1/2':
      return 0.5;
    case '1/4':
      return 0.25;
    case 'R':
      return 0.08;
    default:
      return 0;
  }
}

function drawRect(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: { fill?: string; lineWidth?: number },
) {
  doc.save();
  if (opts?.fill) doc.fillColor(opts.fill);
  doc.lineWidth(opts?.lineWidth ?? 0.6).rect(x, y, w, h);
  if (opts?.fill) doc.fillAndStroke();
  else doc.stroke();
  doc.restore();
  doc.fillColor('#000').strokeColor('#000');
}

function drawField(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
) {
  drawRect(doc, x, y, w, h);
  doc.fontSize(5.5).text(label, x + 3, y + 2, { width: w - 6 });
  doc.fontSize(7.5).text(value || ' ', x + 3, y + 11, { width: w - 6 });
}

function drawSemicircle(
  doc: InstanceType<typeof PDFDocument>,
  cx: number,
  cy: number,
  r: number,
) {
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const ang = Math.PI - (Math.PI * i) / steps;
    const x = cx + Math.cos(ang) * r;
    const y = cy - Math.sin(ang) * r;
    if (i === 0) doc.moveTo(x, y);
    else doc.lineTo(x, y);
  }
  doc.stroke();
}

function drawFuelGauge(
  doc: InstanceType<typeof PDFDocument>,
  cx: number,
  cy: number,
  r: number,
  label: string,
  level: string | null | undefined,
) {
  doc.fontSize(5.5).text(label, cx - r, cy - r - 10, { width: r * 2, align: 'center' });
  doc.save();
  doc.lineWidth(0.5);
  drawSemicircle(doc, cx, cy, r);
  for (const [frac, txt] of [
    [0, 'R'],
    [0.25, '1/4'],
    [0.5, '1/2'],
    [0.75, '3/4'],
    [1, 'C'],
  ] as const) {
    const ang = Math.PI - Math.PI * frac;
    const x1 = cx + Math.cos(ang) * (r - 2);
    const y1 = cy - Math.sin(ang) * (r - 2);
    const x2 = cx + Math.cos(ang) * (r + 2);
    const y2 = cy - Math.sin(ang) * (r + 2);
    doc.moveTo(x1, y1).lineTo(x2, y2).stroke();
    const tx = cx + Math.cos(ang) * (r + 9);
    const ty = cy - Math.sin(ang) * (r + 9);
    doc.fontSize(4.5).text(txt, tx - 8, ty - 3, { width: 16, align: 'center' });
  }
  const ratio = fuelGaugeRatio(level);
  if (ratio > 0) {
    const ang = Math.PI - Math.PI * ratio;
    doc.lineWidth(1.2).strokeColor('#1d4ed8');
    doc
      .moveTo(cx, cy)
      .lineTo(cx + Math.cos(ang) * (r - 4), cy - Math.sin(ang) * (r - 4))
      .stroke();
    doc.strokeColor('#000');
  }
  doc.restore();
}

function drawVehicleOutline(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, h: number) {
  drawRect(doc, x, y, w, h);
  doc.fontSize(5).text('LOCAL AVARIADO', x, y + 2, { width: w, align: 'center' });
  const cabW = w * 0.22;
  const bodyW = w * 0.52;
  const trailerW = w * 0.18;
  const top = y + 14;
  const vh = h - 22;
  const vx = x + (w - cabW - bodyW - trailerW - 4) / 2;
  drawRect(doc, vx, top, cabW, vh * 0.55);
  drawRect(doc, vx + cabW + 2, top + vh * 0.1, bodyW, vh * 0.8);
  drawRect(doc, vx + cabW + bodyW + 4, top + vh * 0.15, trailerW, vh * 0.7);
}

function drawWatermark(doc: InstanceType<typeof PDFDocument>, text: string) {
  doc.save();
  doc.rotate(-32, { origin: [PAGE_W / 2, PAGE_H / 2] });
  doc.fontSize(42).fillColor('#bbbbbb').opacity(0.28).text(text, 60, 360, { align: 'center', width: 480 });
  doc.opacity(1).fillColor('#000');
  doc.restore();
}

function drawChecklistColumn(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  items: typeof LOGBOOK_CHECKLIST_ITEMS,
  startNum: number,
  dep: ReturnType<typeof parseChecklistJson>,
  ret: ReturnType<typeof parseChecklistJson>,
) {
  const colW = w;
  const numW = 11;
  const itemW = colW - numW - 54;
  const depW = 24;
  const retW = 24;
  const rowH = 8.2;

  drawRect(doc, x, y, colW, 14);
  doc.fontSize(5).text('OK / NG / QTDE', x + numW + 2, y + 4, { width: itemW });
  doc.text('SAÍDA', x + numW + itemW + 2, y + 4, { width: depW, align: 'center' });
  doc.text('RETOR.', x + numW + itemW + depW + 2, y + 4, { width: retW, align: 'center' });

  let rowY = y + 14;
  items.forEach((item, idx) => {
    const n = startNum + idx;
    drawRect(doc, x, rowY, colW, rowH);
    doc.fontSize(5).text(String(n), x + 2, rowY + 2, { width: numW - 2, align: 'center' });
    doc.fontSize(4.8).text(item.label, x + numW + 2, rowY + 2, { width: itemW });
    const depVal = cell(dep[item.id]);
    const retVal = cell(ret[item.id]);
    doc.fontSize(5.5).text(depVal, x + numW + itemW + 2, rowY + 2, { width: depW, align: 'center' });
    doc.text(retVal, x + numW + itemW + depW + 2, rowY + 2, { width: retW, align: 'center' });
    rowY += rowH;
  });

  return rowY;
}

function formatFuelingRow(entries: FuelingEntry[]) {
  const e = entries[0];
  if (!e) return { liters: '', km: '', value: '' };
  return {
    liters: e.liters != null ? String(e.liters) : '',
    km: e.odometerKm != null ? String(e.odometerKm) : '',
    value: e.valueReais != null ? e.valueReais.toFixed(2).replace('.', ',') : '',
  };
}

export function buildLogbookPdf(logbook: LogbookPdfInput) {
  const doc = new PDFDocument({ margin: 0, size: 'A4' });
  const dep = parseChecklistJson(logbook.checklistDeparture);
  const ret = parseChecklistJson(logbook.checklistReturn);
  const fuelDep = parseFuelingJson(logbook.fuelingDepartureJson);
  const fuelRet = parseFuelingJson(logbook.fuelingReturnJson);
  const status = logbookWorkflowStatus(logbook);
  const archived = status === 'ARQUIVADO';

  if (!archived) {
    drawWatermark(
      doc,
      status === 'AGUARDANDO_COORDENADOR' ? 'AGUARDANDO\nCOORDENADOR' : 'RASCUNHO',
    );
  }

  const outerX = M;
  const outerY = M;
  const outerW = PAGE_W - M * 2;
  const outerH = PAGE_H - M * 2;
  drawRect(doc, outerX, outerY, outerW, outerH, { lineWidth: 1.2 });

  // —— Cabeçalho ——
  const headerY = outerY + 6;
  drawRect(doc, outerX + 6, headerY, 42, 28);
  doc.font('Helvetica-Bold').fontSize(14).text('LSL', outerX + 10, headerY + 8);

  doc.font('Helvetica-Bold').fontSize(11).text('LSL TRANSPORTES LTDA', outerX + 56, headerY + 2, {
    width: outerW - 170,
    align: 'center',
  });
  doc.fontSize(10).text('CHECK-LIST FROTA', outerX + 56, headerY + 16, { width: outerW - 170, align: 'center' });

  const coordBoxX = outerX + outerW - 118;
  drawRect(doc, coordBoxX, headerY, 112, 42);
  doc.font('Helvetica').fontSize(5.5).text('LÍDER OU COORDENADOR', coordBoxX + 3, headerY + 3, {
    width: 106,
    align: 'center',
  });
  if (logbook.coordinatorSignaturePng) {
    try {
      doc.image(dataUrlToBuffer(logbook.coordinatorSignaturePng), coordBoxX + 8, headerY + 12, {
        fit: [96, 26],
      });
    } catch {
      doc.fontSize(6).text('(assinatura)', coordBoxX + 20, headerY + 20);
    }
    if (logbook.coordinatorSignedAt) {
      doc.fontSize(4.5).fillColor('#166534');
      doc.text(fmtDate(logbook.coordinatorSignedAt), coordBoxX + 3, headerY + 34, { width: 106, align: 'center' });
      doc.fillColor('#000');
    }
  }

  // —— Dados motorista ——
  const infoY = headerY + 46;
  const infoH = 24;
  const fields = [
    { label: 'MOTORISTA', value: logbook.trip.driverName ?? '', w: 150 },
    { label: 'MAT', value: logbook.driverMatricula ?? '', w: 42 },
    { label: 'AJUDANTE', value: logbook.helperName ?? '', w: 110 },
    { label: 'MAT', value: logbook.helperMatricula ?? '', w: 42 },
    { label: 'DATA', value: fmtDate(logbook.trip.departureAt), w: 58 },
    { label: 'PLACA', value: logbook.vehicle.plate, w: 72 },
  ];
  let fx = outerX + 6;
  for (const f of fields) {
    drawField(doc, fx, infoY, f.w, infoH, f.label, f.value);
    fx += f.w + 2;
  }

  // —— Checklist (2 colunas, itens 1–25 e 26–51) ——
  const checklistY = infoY + infoH + 4;
  const colGap = 4;
  const colW = (outerW - 12 - colGap) / 2;
  const leftItems = LOGBOOK_CHECKLIST_ITEMS.slice(0, 25);
  const rightItems = LOGBOOK_CHECKLIST_ITEMS.slice(25);
  const leftEnd = drawChecklistColumn(doc, outerX + 6, checklistY, colW, leftItems, 1, dep, ret);
  const rightEnd = drawChecklistColumn(doc, outerX + 6 + colW + colGap, checklistY, colW, rightItems, 26, dep, ret);
  const sectionEnd = Math.max(leftEnd, rightEnd) + 4;

  // —— Saída / Retorno (KM, data, hora, combustível, diagrama) ——
  const tripY = sectionEnd;
  const tripH = 108;
  const halfW = (outerW - 14) / 2;
  const tripLeftX = outerX + 6;
  const tripRightX = tripLeftX + halfW + 2;

  drawRect(doc, tripLeftX, tripY, halfW, tripH);
  drawRect(doc, tripRightX, tripY, halfW, tripH);
  doc.font('Helvetica-Bold').fontSize(7).text('SAÍDA', tripLeftX, tripY + 3, { width: halfW, align: 'center' });
  doc.text('RETORNO', tripRightX, tripY + 3, { width: halfW, align: 'center' });
  doc.font('Helvetica');

  const kmY = tripY + 12;
  drawField(doc, tripLeftX + 4, kmY, 54, 20, 'KM INICIAL', logbook.kmInitial != null ? String(logbook.kmInitial) : '');
  drawField(doc, tripLeftX + 62, kmY, 48, 20, 'DATA', fmtDate(logbook.trip.departureAt));
  drawField(doc, tripLeftX + 114, kmY, 36, 20, 'HORÁRIO', fmtTime(logbook.departureSignedAt ?? logbook.trip.departureAt));

  drawField(doc, tripRightX + 4, kmY, 54, 20, 'KM FINAL', logbook.kmFinal != null ? String(logbook.kmFinal) : '');
  drawField(
    doc,
    tripRightX + 62,
    kmY,
    48,
    20,
    'DATA',
    fmtDate(logbook.trip.returnedAt ?? logbook.trip.expectedReturn),
  );
  drawField(doc, tripRightX + 114, kmY, 36, 20, 'HORÁRIO', fmtTime(logbook.returnSignedAt));

  drawFuelGauge(doc, tripLeftX + 42, tripY + 72, 16, 'DIESEL', logbook.fuelDieselDeparture);
  drawFuelGauge(doc, tripLeftX + 88, tripY + 72, 16, 'ÓLEO', logbook.fuelOilDeparture);
  drawVehicleOutline(doc, tripLeftX + 118, tripY + 34, halfW - 124, tripH - 38);

  drawFuelGauge(doc, tripRightX + 42, tripY + 72, 16, 'DIESEL', logbook.fuelDieselReturn);
  drawFuelGauge(doc, tripRightX + 88, tripY + 72, 16, 'ÓLEO', logbook.fuelOilReturn);
  drawVehicleOutline(doc, tripRightX + 118, tripY + 34, halfW - 124, tripH - 38);

  if (logbook.damageDescription) {
    doc.fontSize(5).text(`Avaria: ${logbook.damageDescription}`, tripLeftX + 4, tripY + tripH - 10, {
      width: halfW - 8,
    });
  }

  // —— Abastecimento ——
  const fuelTableY = tripY + tripH + 4;
  const fuelTableH = 34;
  drawRect(doc, outerX + 6, fuelTableY, outerW - 12, fuelTableH);
  doc.font('Helvetica-Bold').fontSize(6).text('ABASTECIMENTO', outerX + 10, fuelTableY + 3);
  doc.font('Helvetica');

  const depDiesel = formatFuelingRow(fuelDep.filter((_, i) => i === 0 || fuelDep.length === 1));
  const depOil = formatFuelingRow(fuelDep.slice(1));
  const retDiesel = formatFuelingRow(fuelRet.filter((_, i) => i === 0 || fuelRet.length === 1));
  const retOil = formatFuelingRow(fuelRet.slice(1));

  const abCols = [
    { x: outerX + 8, w: 70, label: '' },
    { x: outerX + 80, w: 55, label: 'QTD LITRO' },
    { x: outerX + 137, w: 55, label: 'KM ABASTEC.' },
    { x: outerX + 194, w: 50, label: 'VALOR (R$)' },
    { x: outerX + 250, w: 70, label: '' },
    { x: outerX + 322, w: 55, label: 'QTD LITRO' },
    { x: outerX + 379, w: 55, label: 'KM ABASTEC.' },
    { x: outerX + 436, w: 50, label: 'VALOR (R$)' },
  ];
  doc.fontSize(4.5);
  for (const c of abCols.slice(1, 4)) doc.text(c.label, c.x, fuelTableY + 10, { width: c.w, align: 'center' });
  for (const c of abCols.slice(5)) doc.text(c.label, c.x, fuelTableY + 10, { width: c.w, align: 'center' });

  const abRow = (rowY: number, leftLabel: string, left: ReturnType<typeof formatFuelingRow>, right: ReturnType<typeof formatFuelingRow>) => {
    doc.fontSize(5.5).text(leftLabel, outerX + 10, rowY, { width: 66 });
    doc.text(left.liters, abCols[1].x, rowY, { width: abCols[1].w, align: 'center' });
    doc.text(left.km, abCols[2].x, rowY, { width: abCols[2].w, align: 'center' });
    doc.text(left.value, abCols[3].x, rowY, { width: abCols[3].w, align: 'center' });
    doc.text(leftLabel, outerX + 252, rowY, { width: 66 });
    doc.text(right.liters, abCols[5].x, rowY, { width: abCols[5].w, align: 'center' });
    doc.text(right.km, abCols[6].x, rowY, { width: abCols[6].w, align: 'center' });
    doc.text(right.value, abCols[7].x, rowY, { width: abCols[7].w, align: 'center' });
  };
  abRow(fuelTableY + 18, 'DIESEL', depDiesel, retDiesel);
  abRow(fuelTableY + 26, 'ÓLEO DE MOTOR', depOil, retOil);

  // —— Descrição manutenção ——
  const maintY = fuelTableY + fuelTableH + 4;
  const maintH = 38;
  drawRect(doc, outerX + 6, maintY, outerW - 12, maintH);
  doc.fontSize(5.5).text('DESCRIÇÃO MANUTENÇÃO', outerX + 10, maintY + 3);
  const maintText = logbook.maintenanceDescription ?? '';
  doc.fontSize(6).text(maintText, outerX + 10, maintY + 12, { width: outerW - 28, lineGap: 2 });
  for (let i = 0; i < 3; i++) {
    const ly = maintY + 22 + i * 5;
    doc.moveTo(outerX + 10, ly).lineTo(outerX + outerW - 16, ly).stroke();
  }

  // —— Assinaturas motorista ——
  const sigY = maintY + maintH + 6;
  const sigW = (outerW - 24) / 2;
  const sigH = 34;
  drawRect(doc, outerX + 6, sigY, sigW, sigH);
  drawRect(doc, outerX + 12 + sigW, sigY, sigW, sigH);
  doc.fontSize(5.5).text('ASSINATURA MOTORISTA (SAÍDA)', outerX + 10, sigY + 3, { width: sigW - 8, align: 'center' });
  doc.text('ASSINATURA MOTORISTA (RETORNO)', outerX + 16 + sigW, sigY + 3, { width: sigW - 8, align: 'center' });

  if (logbook.departureSignaturePng) {
    try {
      doc.image(dataUrlToBuffer(logbook.departureSignaturePng), outerX + 14, sigY + 10, { fit: [sigW - 16, 20] });
    } catch {
      /* ignore */
    }
  }
  if (logbook.returnSignaturePng) {
    try {
      doc.image(dataUrlToBuffer(logbook.returnSignaturePng), outerX + 20 + sigW, sigY + 10, { fit: [sigW - 16, 20] });
    } catch {
      /* ignore */
    }
  }

  // —— Rodapé ——
  const footY = outerY + outerH - 16;
  doc.fontSize(5.5).fillColor('#333');
  doc.text('PERÍODO DE RETENÇÃO: 1 ANO', outerX + 10, footY);
  doc.text(logbook.formCode || LOGBOOK_FORM_CODE, outerX + outerW - 110, footY, { width: 100, align: 'right' });
  if (archived) {
    doc.fillColor('#166534').fontSize(6).text('DOCUMENTO ARQUIVADO — CÓPIA OFICIAL', outerX + 120, footY, {
      width: outerW - 240,
      align: 'center',
    });
  }
  doc.fillColor('#000');

  return doc;
}
