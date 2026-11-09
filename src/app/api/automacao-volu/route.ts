import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

const FROTATMS_URL = "https://frota-tms.onrender.com";
const DIAS_TRANSITO = 5;

// ── tipos ──────────────────────────────────────────────────────────────────

interface MinutaRow {
  minuta: string;
  qtdMotos: number;
  status: string;
  saidaBelem: Date | null;
  dataChegada: Date | null;
  descarregamento: Date | null;
  eta: Date | null;
}

interface ProcessResult {
  descarregadasHoje: MinutaRow[];
  emTransito: MinutaRow[];
  atrasadas: MinutaRow[];
  porEta: Record<string, MinutaRow[]>;
  semData: MinutaRow[];
  totalMinutas: number;
  totalMotos: number;
  motosExpedidas: number;
  frotatmsViagens: number;
  voloFile: string; // base64
  relatorioFile: string; // base64
  voloAtualizado: boolean;
}

// ── helpers de data ────────────────────────────────────────────────────────

function parseDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(val);
    if (!d) return null;
    return new Date(d.y, d.m - 1, d.d);
  }
  if (typeof val === "string") {
    const s = val.trim();
    if (!s) return null;
    // dd/mm/yyyy HH:mm or dd/mm/yyyy
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayKey(): string {
  return dateKey(new Date());
}

function fmt(d: Date | null): string {
  if (!d) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// ── leitura do Chronus ─────────────────────────────────────────────────────

function findColKey(headers: string[], patterns: string[]): string | undefined {
  for (const p of patterns) {
    const h = headers.find((h) => h.toLowerCase().replace(/\s/g, "").includes(p.toLowerCase().replace(/\s/g, "")));
    if (h) return h;
  }
  return undefined;
}

function lerChronus(buffer: ArrayBuffer): MinutaRow[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (!raw.length) return [];

  const headers = Object.keys(raw[0]);
  const colMinuta      = findColKey(headers, ["Minuta", "NroMinuta", "Número"]);
  // Volume = Qtd Caixa (col I) + Qtdade NPD (col J) — ignora Qtd de moto (col G)
  const colQtdCaixa    = findColKey(headers, ["QtdCaixa", "Qtddecaixa", "QTDCaixa", "Caixa"]);
  const colQtdNPD      = findColKey(headers, ["QtdNPD", "QtdadeNPD", "QTDNPD", "NPD"]);
  const colStatus      = findColKey(headers, ["Status", "Situação", "STATUS"]);
  const colSaida       = findColKey(headers, ["SaídaBelém", "SaidaBelem", "SAIDA", "Saída"]);
  const colPrevisao    = findColKey(headers, ["PrevisãoChegada", "PrevisaoChegada", "Previsão", "Previsao"]);
  const colChegada     = findColKey(headers, ["DataChegada", "DTCHEGADA", "DataChegada"]);
  const colDescarga    = findColKey(headers, ["DataDescarregamento", "DTDESCARREGAMENTO", "Descarga", "Descarregamento"]);

  return raw
    .map((r): MinutaRow | null => {
      const minuta = String(r[colMinuta ?? ""] ?? "").trim().replace(/\.0$/, "");
      if (!minuta || minuta === "0" || minuta === "nan") return null;

      const caixa = colQtdCaixa ? Math.round(Number(r[colQtdCaixa] ?? 0)) : 0;
      const npd   = colQtdNPD   ? Math.round(Number(r[colQtdNPD]   ?? 0)) : 0;
      const qtdMotos = caixa + npd;

      const status = String(r[colStatus ?? ""] ?? "").toUpperCase();
      const saidaBelem      = parseDate(r[colSaida    ?? ""] ?? null);
      const previsaoChronus = parseDate(r[colPrevisao ?? ""] ?? null);
      const dataChegada     = parseDate(r[colChegada  ?? ""] ?? null);
      const descarregamento = parseDate(r[colDescarga ?? ""] ?? null);

      // Usa a Previsão Chegada do Chronus quando disponível; senão calcula Saída + 5 dias
      let eta: Date | null = previsaoChronus;
      if (!eta && saidaBelem) {
        eta = new Date(saidaBelem);
        eta.setDate(eta.getDate() + DIAS_TRANSITO);
      }

      return { minuta, qtdMotos, status, saidaBelem, dataChegada, descarregamento, eta };
    })
    .filter((r): r is MinutaRow => r !== null);
}

// ── processamento ──────────────────────────────────────────────────────────

function processarMinutas(minutas: MinutaRow[], today: string) {
  const descarregadasHoje: MinutaRow[] = [];
  const emTransito: MinutaRow[] = [];
  const atrasadas: MinutaRow[] = [];

  for (const m of minutas) {
    const isDesc = m.status.includes("DESCARREGAD") || m.status.includes("ENTREGUE");
    const isTrans = m.status.includes("TRANSITO") || m.status.includes("TRÂNSITO");

    if (isDesc) {
      const chegKey = m.dataChegada ? dateKey(m.dataChegada) : null;
      const descKey = m.descarregamento ? dateKey(m.descarregamento) : null;
      if (chegKey === today || descKey === today) {
        descarregadasHoje.push(m);
      }
    } else if (isTrans) {
      if (m.eta && dateKey(m.eta) < today) {
        atrasadas.push(m);
      } else {
        emTransito.push(m);
      }
    }
  }

  const porEta: Record<string, MinutaRow[]> = {};
  const semData: MinutaRow[] = [];

  for (const m of emTransito) {
    if (m.eta) {
      const k = fmt(m.eta);
      (porEta[k] = porEta[k] ?? []).push(m);
    } else {
      semData.push(m);
    }
  }

  // ordena por data
  const porEtaOrdenado = Object.fromEntries(
    Object.entries(porEta).sort(([a], [b]) => {
      const [da, ma, ya] = a.split("/").map(Number);
      const [db, mb, yb] = b.split("/").map(Number);
      return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
    })
  );

  return { descarregadasHoje, emTransito, atrasadas, porEta: porEtaOrdenado, semData };
}

// ── FrotaTMS API ───────────────────────────────────────────────────────────

async function frotatmsExpedidas(today: string): Promise<{ total: number; count: number }> {
  try {
    const loginResp = await fetch(`${FROTATMS_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "lsl@.com", password: "lsl123" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!loginResp.ok) return { total: 0, count: 0 };
    const { token } = await loginResp.json();

    const start = `${today}T00:00:00`;
    const end   = `${today}T23:59:59`;
    const tripsResp = await fetch(
      `${FROTATMS_URL}/api/trips?from=${start}&to=${end}&all=true`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!tripsResp.ok) return { total: 0, count: 0 };

    const trips: Array<{ status: string; vehicle: { capacityMotos: number } }> = await tripsResp.json();
    let total = 0;
    let count = 0;
    for (const t of trips) {
      if (t.status === "CANCELADO") continue;
      total += t.vehicle?.capacityMotos ?? 0;
      count++;
    }
    return { total, count };
  } catch {
    return { total: 0, count: 0 };
  }
}

// ── atualizar Volu — usa exceljs para preservar 100% da formatação original ─

async function atualizarVolu(
  buffer: ArrayBuffer,
  today: string,
  minutas: number,
  motosRec: number,
  motosExp: number
): Promise<{ b64: string; updated: boolean }> {
  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(new Uint8Array(buffer) as any);
  const ws = wb.worksheets[0];

  // 1. Detecta linha de cabeçalho lendo valores das células
  let colRodov = 0, colRecebidas = 0, colExpedidas = 0;
  let headerRowNum = 0;

  ws.eachRow((row, rowNum) => {
    if (headerRowNum) return;
    const vals = row.values as (ExcelJS.CellValue | undefined)[];
    const strs = vals.map((v) => String(v ?? "").toLowerCase().trim());
    if (strs.includes("data") && strs.some((s) => s.includes("consolidado") || s.includes("minuta"))) {
      headerRowNum = rowNum;
      strs.forEach((s, i) => {
        if (s.includes("rodoviár") || s === "rodoviario") colRodov = i;
        if (s.includes("recebida")) colRecebidas = i;
        if (s.includes("expedida")) colExpedidas = i;
      });
    }
  });

  if (!headerRowNum) return { b64: "", updated: false };

  // 2. Encontra linha da data de hoje
  let targetRowNum = 0;
  ws.eachRow((row, rowNum) => {
    if (targetRowNum || rowNum <= headerRowNum) return;
    const cell = row.getCell(1);
    let d: Date | null = null;
    if (cell.value instanceof Date) {
      d = cell.value;
    } else if (cell.type === ExcelJS.ValueType.Formula && cell.result instanceof Date) {
      d = cell.result as Date;
    }
    if (d && dateKey(d) === today) targetRowNum = rowNum;
  });

  if (!targetRowNum) return { b64: "", updated: false };

  // 3. Preenche apenas as células de entrada manual — não toca fórmulas
  const targetRow = ws.getRow(targetRowNum);
  const setVal = (col: number, val: number) => {
    if (!col) return;
    const cell = targetRow.getCell(col);
    // Só sobrescreve se não for fórmula
    if (cell.type !== ExcelJS.ValueType.Formula) {
      cell.value = val;
    }
  };

  setVal(colRodov, minutas);
  setVal(colRecebidas, motosRec);
  if (motosExp > 0) setVal(colExpedidas, motosExp);
  targetRow.commit();

  const outBuf = await wb.xlsx.writeBuffer();
  return { b64: Buffer.from(outBuf).toString("base64"), updated: true };
}

// ── gerar relatório de trânsito ────────────────────────────────────────────

function gerarRelatorio(
  descarregadas: MinutaRow[],
  porEta: Record<string, MinutaRow[]>,
  atrasadas: MinutaRow[],
  semData: MinutaRow[],
  today: string,
  motosExpedidas: number,
  frotatmsViagens: number
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const todayFmt = today.split("-").reverse().join("/");

  // ── Resumo ──
  const resumo = [
    ["RELATÓRIO DE TRÂNSITO LSL", todayFmt],
    [],
    ["Indicador", "Valor"],
    ["Minutas descarregadas hoje", descarregadas.length],
    ["Motos recebidas hoje (Chronus)", descarregadas.reduce((s, r) => s + r.qtdMotos, 0)],
    ["Motos expedidas (FrotaTMS)", motosExpedidas],
    ["Viagens FrotaTMS registradas", frotatmsViagens],
    ["Minutas em trânsito", Object.values(porEta).flat().length + semData.length],
    ["Minutas atrasadas", atrasadas.length],
    ["Sem data de saída Belém", semData.length],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), "Resumo");

  // ── Descarregadas Hoje ──
  const descRows = [
    ["Minuta", "Saída Belém", "Data Chegada", "Descarregamento", "Qtd Motos"],
    ...descarregadas.map((m) => [
      m.minuta, fmt(m.saidaBelem), fmt(m.dataChegada), fmt(m.descarregamento), m.qtdMotos,
    ]),
    ["TOTAL", "", "", "", descarregadas.reduce((s, r) => s + r.qtdMotos, 0)],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(descRows), "Descarregadas Hoje");

  // ── Em Trânsito ──
  const tranRows: unknown[][] = [["Minuta", "Saída Belém", "Previsão Chegada", "Qtd Motos", "Dias Faltando"]];
  const todayDate = new Date(today);

  for (const [etaStr, lista] of Object.entries(porEta)) {
    const [d, mo, y] = etaStr.split("/").map(Number);
    const etaDate = new Date(y, mo - 1, d);
    const dias = Math.round((etaDate.getTime() - todayDate.getTime()) / 86_400_000);
    for (const m of lista) {
      tranRows.push([m.minuta, fmt(m.saidaBelem), etaStr, m.qtdMotos, dias]);
    }
  }
  for (const m of semData) {
    tranRows.push([m.minuta, "—", "Sem data de saída", m.qtdMotos, "—"]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tranRows), "Em Transito");

  // ── Atrasadas ──
  if (atrasadas.length) {
    const atrRows = [
      ["Minuta", "Saída Belém", "Previsão Era", "Dias de Atraso", "Qtd Motos"],
      ...atrasadas.map((m) => {
        const atraso = m.eta
          ? Math.round((todayDate.getTime() - m.eta.getTime()) / 86_400_000)
          : "?";
        return [m.minuta, fmt(m.saidaBelem), fmt(m.eta), atraso, m.qtdMotos];
      }),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(atrRows), "ATRASADAS");
  }

  return wb;
}

// ── handler principal ──────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const form = await req.formData();
    const chronusFile = form.get("chronus") as File | null;
    const voloFile    = form.get("volo")    as File | null;

    if (!chronusFile) {
      return NextResponse.json({ error: "Arquivo Chronus não enviado" }, { status: 400 });
    }

    const chronusBuf = await chronusFile.arrayBuffer();

    // 1. Ler Chronus
    const today = todayKey();
    const minutas = lerChronus(chronusBuf);
    const { descarregadasHoje, emTransito, atrasadas, porEta, semData } = processarMinutas(minutas, today);

    const totalMinutas = descarregadasHoje.length;
    const totalMotos   = descarregadasHoje.reduce((s, r) => s + r.qtdMotos, 0);

    // 2. FrotaTMS
    const { total: motosExpedidas, count: frotatmsViagens } = await frotatmsExpedidas(today);

    // 3. Atualizar Volu (opcional) — exceljs preserva 100% da formatação original
    let voloFileB64 = "";
    let voloAtualizado = false;
    if (voloFile) {
      const voloBuf = await voloFile.arrayBuffer();
      const { b64, updated } = await atualizarVolu(voloBuf, today, totalMinutas, totalMotos, motosExpedidas);
      voloAtualizado = updated;
      voloFileB64 = b64;
    }

    // 4. Gerar relatório de trânsito
    const relWb = gerarRelatorio(descarregadasHoje, porEta, atrasadas, semData, today, motosExpedidas, frotatmsViagens);
    const relB64 = XLSX.write(relWb, { type: "base64", bookType: "xlsx" });

    const result: ProcessResult = {
      descarregadasHoje,
      emTransito,
      atrasadas,
      porEta,
      semData,
      totalMinutas,
      totalMotos,
      motosExpedidas,
      frotatmsViagens,
      voloFile: voloFileB64,
      relatorioFile: relB64,
      voloAtualizado,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[automacao-volu]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
