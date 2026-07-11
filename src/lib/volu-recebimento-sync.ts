import * as XLSX from "xlsx";

/** PAD fixo desta ferramenta (Volu secundário SIF). */
export const VOLU_PAD = "SIF";

export type VoluDayAgg = {
  /** YYYY-MM-DD (UTC date key) */
  dayKey: string;
  cargas: number;
  motos: number;
  balsas: string[];
};

export type VoluSyncStats = {
  pad: string;
  monitoramentoRows: number;
  daysWithArrival: number;
  daysUpdated: number;
  totalMotos: number;
  totalCargas: number;
};

export type VoluSyncResult = {
  workbook: XLSX.WorkBook;
  stats: VoluSyncStats;
  byDay: VoluDayAgg[];
};

function parseExcelDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Datas vindas do Excel costumam representar o calendário local do arquivo.
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  const text = String(value).trim();
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    let year = Number(br[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(br[2]) - 1, Number(br[1]));
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  const asDate = new Date(text);
  if (Number.isNaN(asDate.getTime())) return null;
  return new Date(asDate.getFullYear(), asDate.getMonth(), asDate.getDate());
}

export function dayKeyFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Lê a data do calendário Volu priorizando o texto exibido (01/07 Wed). */
function dayKeyFromVoluCell(cell: XLSX.CellObject): string | null {
  const shown = cell.w != null ? String(cell.w).trim() : "";

  // Ignora números formatados como quantidade (ex.: "1,403").
  if (cell.t === "n" && shown && !/\d{1,2}\/\d{1,2}/.test(shown) && !(cell.v instanceof Date)) {
    return null;
  }

  // Formato do Volu: "01/07 Wed" (dia/mês + weekday)
  const voluFmt = shown.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+[A-Za-z]/);
  if (voluFmt) {
    let year: number | null = voluFmt[3] ? Number(voluFmt[3]) : null;
    if (year != null && year < 100) year += 2000;
    if (year == null) {
      const base = parseExcelDate(cell.v);
      year = base?.getFullYear() ?? null;
    }
    if (year != null) {
      const m = String(Number(voluFmt[2])).padStart(2, "0");
      const d = String(Number(voluFmt[1])).padStart(2, "0");
      return `${year}-${m}-${d}`;
    }
  }

  if (typeof cell.v === "string") {
    const parsed = parseExcelDate(cell.v);
    return parsed ? dayKeyFromDate(parsed) : null;
  }

  const parsed = parseExcelDate(cell.v);
  return parsed ? dayKeyFromDate(parsed) : null;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function findMonitoramentoSheet(workbook: XLSX.WorkBook): {
  sheetName: string;
  headerRow: number;
  col: {
    pad: number;
    motos: number;
    chegadaPad: number;
    balsa: number;
    fluvial: number;
  };
} {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
    });
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const row = rows[r] ?? [];
      const headers = row.map(normalizeHeader);
      const pad = headers.findIndex((h) => h === "PAD");
      const motos = headers.findIndex(
        (h) => h === "QDE MOTOS" || h === "QTD MOTOS" || h === "QTDE MOTOS"
      );
      const chegadaPad = headers.findIndex(
        (h) => h === "CHEGADA PAD" || h.startsWith("CHEGADA PAD")
      );
      const balsa = headers.findIndex((h) => h === "BALSA");
      const fluvial = headers.findIndex((h) => h === "FLUVIAL");
      if (pad >= 0 && motos >= 0 && chegadaPad >= 0) {
        return {
          sheetName,
          headerRow: r,
          col: {
            pad,
            motos,
            chegadaPad,
            balsa: balsa >= 0 ? balsa : -1,
            fluvial: fluvial >= 0 ? fluvial : -1,
          },
        };
      }
    }
  }
  throw new Error(
    'Não achei a aba de monitoramento com colunas PAD, QDE MOTOS e CHEGADA PAD (ex.: aba "2025").'
  );
}

/** Agrega chegadas do Monitoramento para um PAD. */
export function aggregateMonitoramentoByChegadaPad(
  workbook: XLSX.WorkBook,
  pad: string = VOLU_PAD
): { rows: number; byDay: Map<string, VoluDayAgg> } {
  const meta = findMonitoramentoSheet(workbook);
  const sheet = workbook.Sheets[meta.sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });
  const padNorm = pad.trim().toUpperCase();
  const byDay = new Map<string, VoluDayAgg>();
  let matched = 0;

  for (let i = meta.headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const rowPad = String(row[meta.col.pad] ?? "")
      .trim()
      .toUpperCase();
    if (rowPad !== padNorm) continue;

    const chegada = parseExcelDate(row[meta.col.chegadaPad]);
    if (!chegada) continue;

    const motosRaw = row[meta.col.motos];
    const motos =
      typeof motosRaw === "number"
        ? motosRaw
        : Number(String(motosRaw ?? "").replace(/[^\d.-]/g, "")) || 0;

    const key = dayKeyFromDate(chegada);
    let agg = byDay.get(key);
    if (!agg) {
      agg = { dayKey: key, cargas: 0, motos: 0, balsas: [] };
      byDay.set(key, agg);
    }
    agg.cargas += 1;
    agg.motos += motos;
    matched += 1;

    if (meta.col.balsa >= 0) {
      const balsa = String(row[meta.col.balsa] ?? "").trim();
      if (balsa && !agg.balsas.includes(balsa)) agg.balsas.push(balsa);
    }
  }

  for (const agg of byDay.values()) {
    agg.balsas.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  return { rows: matched, byDay };
}

export function formatVoluObservacao(agg: VoluDayAgg): string {
  if (agg.cargas <= 0) return "";
  const balsas = agg.balsas.length > 0 ? agg.balsas.join("/") : "—";
  return `${balsas} (FLUVIAL)`;
}

function findVoluHeaderRow(sheet: XLSX.Sheet): number {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  });
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = (rows[i] ?? []).map(normalizeHeader);
    if (
      row[0] === "DATA" &&
      row.some((h) => h.includes("CONSOLIDADO")) &&
      row.some((h) => h.includes("RODOVIARIO") || h.includes("RECEBIDAS"))
    ) {
      return i + 1; // Excel 1-based
    }
  }
  throw new Error(
    'Não achei o cabeçalho "Data / Consolidado / …" na planilha Volu.'
  );
}

function setNumberCell(sheet: XLSX.Sheet, addr: string, value: number | null) {
  if (value == null) {
    delete sheet[addr];
    return;
  }
  sheet[addr] = { t: "n", v: value };
}

function setTextCell(sheet: XLSX.Sheet, addr: string, value: string) {
  if (!value) {
    delete sheet[addr];
    return;
  }
  sheet[addr] = { t: "s", v: value };
}

/**
 * Atualiza o Volu com chegadas SIF do Monitoramento.
 * - Preenche Rodoviário (D) e Qde Motos Recebidas (E)
 * - Preenche OBS (L)
 * - Não altera Cabotagem (C), Expedidas (F), nem fórmulas de Consolidado/Saldo
 */
export function syncVoluRecebimentoFromMonitoramento(
  voluWorkbook: XLSX.WorkBook,
  monitoramentoWorkbook: XLSX.WorkBook,
  pad: string = VOLU_PAD
): VoluSyncResult {
  const sheetName = voluWorkbook.SheetNames[0];
  if (!sheetName) throw new Error("Planilha Volu vazia.");
  const sheet = voluWorkbook.Sheets[sheetName];
  if (!sheet) throw new Error("Aba Volu não encontrada.");

  const { rows: monitoramentoRows, byDay } =
    aggregateMonitoramentoByChegadaPad(monitoramentoWorkbook, pad);

  const headerExcelRow = findVoluHeaderRow(sheet);
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  let daysUpdated = 0;

  for (let excelRow = headerExcelRow + 1; excelRow <= range.e.r + 1; excelRow++) {
    const dateCell = sheet[XLSX.utils.encode_cell({ r: excelRow - 1, c: 0 })];
    if (!dateCell) continue;
    const key = dayKeyFromVoluCell(dateCell);
    if (!key) continue;

    const agg = byDay.get(key);
    const dAddr = XLSX.utils.encode_cell({ r: excelRow - 1, c: 3 }); // Rodoviário
    const eAddr = XLSX.utils.encode_cell({ r: excelRow - 1, c: 4 }); // Recebidas
    const lAddr = XLSX.utils.encode_cell({ r: excelRow - 1, c: 11 }); // OBS

    // Só preenche dias com chegada no Monitoramento; não apaga outros dias
    // (expedição e ajustes manuais permanecem).
    if (!agg || agg.cargas <= 0) continue;

    setNumberCell(sheet, dAddr, agg.cargas);
    setNumberCell(sheet, eAddr, agg.motos);
    setTextCell(sheet, lAddr, formatVoluObservacao(agg));
    daysUpdated += 1;
  }

  const list = [...byDay.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  const stats: VoluSyncStats = {
    pad,
    monitoramentoRows,
    daysWithArrival: list.length,
    daysUpdated,
    totalMotos: list.reduce((s, d) => s + d.motos, 0),
    totalCargas: list.reduce((s, d) => s + d.cargas, 0),
  };

  return { workbook: voluWorkbook, stats, byDay: list };
}

export function workbookToBuffer(workbook: XLSX.WorkBook): Buffer {
  const out = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    cellDates: true,
  });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
