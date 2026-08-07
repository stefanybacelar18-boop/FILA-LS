import type PDFDocument from 'pdfkit';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { TripLogbook } from '@prisma/client';
import {
  LOGBOOK_REPORT_FORM_CODE,
  parseReportExtrasJson,
  parseStopsJson,
  type LogbookStopEntry,
} from './logbook-report';

type ReportPdfInput = TripLogbook & {
  trip: {
    driverName: string | null;
    departureAt: Date;
    expectedReturn: Date;
    returnedAt: Date | null;
    route: { name: string; date: Date } | null;
  };
  vehicle: { plate: string };
};

const PAGE_W = 595.28;
const M = 12;

function fmtDate(d: Date | null | undefined) {
  if (!d) return '';
  return format(d, 'dd.MM.yy', { locale: ptBR });
}

function fmtTime(d: Date | null | undefined) {
  if (!d) return '';
  return format(d, 'HH:mm', { locale: ptBR });
}

function drawRect(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  doc.lineWidth(0.5).rect(x, y, w, h).stroke();
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
  doc.fontSize(5).text(label, x + 2, y + 2, { width: w - 4 });
  doc.fontSize(7).text(value || ' ', x + 2, y + 10, { width: w - 4 });
}

function drawStopRow(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
  n: number,
  stop: LogbookStopEntry,
) {
  const cols = {
    n: 14,
    dealer: w * 0.28,
    city: w * 0.18,
    km: w * 0.12,
    cheg: w * 0.1,
    saida: w * 0.1,
    caixa: w * 0.09,
    moto: w * 0.09,
  };
  let cx = x;
  drawRect(doc, cx, y, cols.n, h);
  doc.fontSize(6).text(String(n), cx + 2, y + 5, { width: cols.n - 4, align: 'center' });
  cx += cols.n;
  drawRect(doc, cx, y, cols.dealer, h);
  doc.fontSize(5.5).text(stop.dealershipName, cx + 2, y + 4, { width: cols.dealer - 4 });
  cx += cols.dealer;
  drawRect(doc, cx, y, cols.city, h);
  doc.fontSize(5.5).text(stop.city, cx + 2, y + 4, { width: cols.city - 4 });
  cx += cols.city;
  drawRect(doc, cx, y, cols.km, h);
  doc.fontSize(6).text(stop.kmArrival != null ? String(stop.kmArrival) : '', cx + 2, y + 4, {
    width: cols.km - 4,
    align: 'center',
  });
  cx += cols.km;
  drawRect(doc, cx, y, cols.cheg, h);
  doc.fontSize(6).text(stop.arrivalTime ?? '', cx + 2, y + 4, { width: cols.cheg - 4, align: 'center' });
  cx += cols.cheg;
  drawRect(doc, cx, y, cols.saida, h);
  doc.fontSize(6).text(stop.departureTime ?? '', cx + 2, y + 4, { width: cols.saida - 4, align: 'center' });
  cx += cols.saida;
  drawRect(doc, cx, y, cols.caixa, h);
  doc.fontSize(6).text(stop.boxQty != null ? String(stop.boxQty) : '', cx + 2, y + 4, {
    width: cols.caixa - 4,
    align: 'center',
  });
  cx += cols.caixa;
  drawRect(doc, cx, y, cols.moto, h);
  const moto =
    stop.motoQty != null
      ? String(stop.motoQty)
      : stop.plannedMotoCount != null
        ? `(${stop.plannedMotoCount})`
        : '';
  doc.fontSize(6).text(moto, cx + 2, y + 4, { width: cols.moto - 4, align: 'center' });
}

export function drawLogbookReportPage(doc: InstanceType<typeof PDFDocument>, logbook: ReportPdfInput) {
  const stops = parseStopsJson(logbook.stopsJson);
  const extras = parseReportExtrasJson(logbook.reportExtrasJson);
  const outerX = M;
  const outerY = M;
  const outerW = PAGE_W - M * 2;
  const outerH = 817;

  drawRect(doc, outerX, outerY, outerW, outerH);

  const headerY = outerY + 6;
  drawRect(doc, outerX + 6, headerY, 40, 26);
  doc.font('Helvetica-Bold').fontSize(13).text('LSL', outerX + 12, headerY + 7);
  doc.fontSize(8.5).text('CONTROLE DISTRIBUIÇÃO DE MOTOS', outerX + 52, headerY + 2, {
    width: outerW - 110,
    align: 'center',
  });
  doc.fontSize(8.5).text('RELATÓRIO DE BORDO', outerX + 52, headerY + 13, { width: outerW - 110, align: 'center' });
  doc.font('Helvetica');

  const infoY = headerY + 32;
  const rowH = 22;
  drawField(doc, outerX + 6, infoY, 52, rowH, 'DTA. SAÍDA', fmtDate(logbook.trip.departureAt));
  drawField(doc, outerX + 60, infoY, 36, rowH, 'HORA', fmtTime(logbook.departureSignedAt ?? logbook.trip.departureAt));
  drawField(
    doc,
    outerX + 98,
    infoY,
    52,
    rowH,
    'DTA. RETORNO',
    fmtDate(logbook.trip.returnedAt ?? logbook.trip.expectedReturn),
  );
  drawField(doc, outerX + 152, infoY, 36, rowH, 'HORA', fmtTime(logbook.returnSignedAt));
  drawField(doc, outerX + 190, infoY, 44, rowH, 'PLACA', logbook.vehicle.plate);
  drawField(doc, outerX + 236, infoY, 90, rowH, 'MOTORISTA', logbook.trip.driverName ?? '');
  drawField(doc, outerX + 328, infoY, 36, rowH, 'MAT', logbook.driverMatricula ?? '');
  drawField(doc, outerX + 366, infoY, 72, rowH, 'AJUDANTE', logbook.helperName ?? '');
  drawField(doc, outerX + 440, infoY, 36, rowH, 'MAT', logbook.helperMatricula ?? '');
  drawField(doc, outerX + 478, infoY, 48, rowH, 'VIAGEM', logbook.trip.route?.name ?? '');

  const kmY = infoY + rowH + 2;
  drawField(doc, outerX + 6, kmY, 70, rowH, 'KM INICIAL', logbook.kmInitial != null ? String(logbook.kmInitial) : '');
  drawField(doc, outerX + 78, kmY, 70, rowH, 'KM FINAL', logbook.kmFinal != null ? String(logbook.kmFinal) : '');

  const tableY = kmY + rowH + 4;
  const tableW = outerW - 12;
  const headerH = 16;
  const stopH = 14;

  drawRect(doc, outerX + 6, tableY, tableW, headerH);
  doc.fontSize(5).text('CONCESSIONÁRIA', outerX + 22, tableY + 4, { width: 80 });
  doc.text('CIDADE', outerX + 150, tableY + 4, { width: 50 });
  doc.text('KM CHEG.', outerX + 230, tableY + 4, { width: 40 });
  doc.text('CHEG.', outerX + 285, tableY + 4, { width: 30 });
  doc.text('SAÍDA', outerX + 330, tableY + 4, { width: 30 });
  doc.text('CAIXA', outerX + 375, tableY + 4, { width: 30 });
  doc.text('MOTOS', outerX + 420, tableY + 4, { width: 30 });

  let rowY = tableY + headerH;
  for (let i = 0; i < 10; i++) {
    drawStopRow(doc, outerX + 6, rowY, tableW, stopH, i + 1, stops[i]);
    rowY += stopH;
  }

  const midY = rowY + 4;
  const midH = 52;
  const thirdW = (tableW - 4) / 3;

  drawRect(doc, outerX + 6, midY, thirdW, midH);
  doc.fontSize(5.5).text('PERNOITE', outerX + 8, midY + 2);
  extras.pernoites.forEach((p, i) => {
    const y = midY + 10 + i * 14;
    doc.fontSize(4.5).text(
      `${p.date ?? ''} ${p.cityHotel ?? ''} ${p.arrivalTime ?? ''}-${p.departureTime ?? ''}`,
      outerX + 8,
      y,
      { width: thirdW - 10 },
    );
  });

  drawRect(doc, outerX + 8 + thirdW, midY, thirdW, midH);
  doc.fontSize(5.5).text('ALMOÇO / JANTA', outerX + 10 + thirdW, midY + 2);
  extras.meals.forEach((m, i) => {
    const y = midY + 10 + i * 14;
    doc.fontSize(4.5).text(
      `${m.date ?? ''} ${m.city ?? ''} ${m.startTime ?? ''}-${m.endTime ?? ''}`,
      outerX + 10 + thirdW,
      y,
      { width: thirdW - 10 },
    );
  });

  drawRect(doc, outerX + 10 + thirdW * 2, midY, thirdW, midH);
  doc.fontSize(5.5).text('TEMPO DESCANSO / ESPERA', outerX + 12 + thirdW * 2, midY + 2);
  extras.restTimes.forEach((r, i) => {
    const y = midY + 10 + i * 8;
    doc.fontSize(4).text(`${r.local ?? ''} ${r.start ?? ''}-${r.end ?? ''}`, outerX + 12 + thirdW * 2, y, {
      width: thirdW - 10,
    });
  });
  extras.waitTimes.forEach((w, i) => {
    const y = midY + 34 + i * 8;
    doc.fontSize(4).text(`${w.local ?? ''} ${w.start ?? ''}-${w.end ?? ''}`, outerX + 12 + thirdW * 2, y, {
      width: thirdW - 10,
    });
  });

  const maintY = midY + midH + 4;
  const maintH = 44;
  drawRect(doc, outerX + 6, maintY, tableW, maintH);
  doc.fontSize(5.5).text('MANUTENÇÃO', outerX + 8, maintY + 2);
  const m = extras.maintenance;
  doc.fontSize(5).text(
    `${m.local ?? ''} KM:${m.kmArrival ?? ''} ${m.service ?? ''} ${m.arrivalTime ?? ''}-${m.departureTime ?? ''}`,
    outerX + 8,
    maintY + 12,
    { width: tableW - 16 },
  );
  const types = [
    m.mecanica ? 'MEC' : '',
    m.hidraulica ? 'HID' : '',
    m.eletrica ? 'ELE' : '',
    m.lavagem ? 'LAV' : '',
    m.borracharia ? 'BOR' : '',
    m.bau ? 'BAÚ' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  doc.text(types, outerX + 8, maintY + 22, { width: tableW - 16 });
  if (logbook.maintenanceDescription) {
    doc.text(logbook.maintenanceDescription, outerX + 8, maintY + 32, { width: tableW - 16 });
  }

  const obsY = maintY + maintH + 4;
  const obsH = 36;
  drawRect(doc, outerX + 6, obsY, tableW, obsH);
  doc.fontSize(5.5).text('OBSERVAÇÕES DA VIAGEM', outerX + 8, obsY + 2);
  doc.fontSize(6).text(logbook.tripObservations ?? '', outerX + 8, obsY + 12, { width: tableW - 16 });

  const sigY = obsY + obsH + 4;
  const sigW = (tableW - 4) / 3;
  const sigH = 30;
  drawRect(doc, outerX + 6, sigY, sigW, sigH);
  drawRect(doc, outerX + 8 + sigW, sigY, sigW, sigH);
  drawRect(doc, outerX + 10 + sigW * 2, sigY, sigW, sigH);
  doc.fontSize(5).text('ASSINATURA MOTORISTA', outerX + 8, sigY + 2, { width: sigW - 4, align: 'center' });
  doc.text('ASSINATURA RESP. PAD LOCAL', outerX + 10 + sigW, sigY + 2, { width: sigW - 4, align: 'center' });
  doc.text('ASSINATURA AJUDANTE', outerX + 12 + sigW * 2, sigY + 2, { width: sigW - 4, align: 'center' });

  if (logbook.departureSignaturePng) {
    try {
      const buf = Buffer.from(logbook.departureSignaturePng.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      doc.image(buf, outerX + 12, sigY + 10, { fit: [sigW - 12, 16] });
    } catch {
      /* ignore */
    }
  }

  doc.fontSize(5).fillColor('#333');
  doc.text('PERÍODO DE RETENÇÃO: 1 ANO', outerX + 8, outerY + outerH - 12);
  doc.text(logbook.reportFormCode || LOGBOOK_REPORT_FORM_CODE, outerX + outerW - 90, outerY + outerH - 12, {
    width: 80,
    align: 'right',
  });
  doc.fillColor('#000');
}
