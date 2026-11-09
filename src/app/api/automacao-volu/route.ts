import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

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
  const colQtd         = findColKey(headers, ["QtdMoto", "QtddeMotos", "QuantidadeMotos", "Qtddemoto"]);
  const colStatus      = findColKey(headers, ["Status", "Situação", "STATUS"]);
  const colSaida       = findColKey(headers, ["SaídaBelém", "SaidaBelem", "SAIDA", "Saída"]);
  const colChegada     = findColKey(headers, ["DataChegada", "DTCHEGADA", "Chegada"]);
  const colDescarga    = findColKey(headers, ["DataDescarregamento", "DTDESCARREGAMENTO", "Descarga", "Descarregamento"]);

  const today = todayKey();

  return raw
    .map((r): MinutaRow | null => {
      const minuta = String(r[colMinuta ?? ""] ?? "").trim().replace(/\.0$/, "");
      if (!minuta || minuta === "0" || minuta === "nan") return null;

      const qtdRaw = r[colQtd ?? ""];
      const qtdMotos = qtdRaw ? Math.round(Number(qtdRaw)) : 0;

      const status = String(r[colStatus ?? ""] ?? "").toUpperCase();
      const saidaBelem    = parseDate(r[colSaida ?? ""] ?? null);
      const dataChegada   = parseDate(r[colChegada ?? ""] ?? null);
      const descarregamento = parseDate(r[colDescarga ?? ""] ?? null);

      let eta: Date | null = null;
      if (saidaBelem) {
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

// ── atualizar Volu ─────────────────────────────────────────────────────────

function atualizarVolu(
  buffer: ArrayBuffer,
  today: string,
  minutas: number,
  motosRec: number,
  motosExp: number
): { wb: XLSX.WorkBook; updated: boolean } {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");

  // Detecta linha de cabeçalho
  let headerRow = -1;
  let colRodov = -1, colRecebidas = -1, colExpedidas = -1;

  for (let r = range.s.r; r <= Math.min(range.s.r + 25, range.e.r); r++) {
    const vals = Array.from({ length: range.e.c + 1 }, (_, c) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      return String(cell?.v ?? "").toLowerCase().trim();
    });
    if (vals.includes("data") && vals.some((v) => v.includes("consolidado") || v.includes("minuta"))) {
      headerRow = r;
      vals.forEach((v, i) => {
        if (v.includes("rodoviár") || v === "rodoviario") colRodov = i;
        if (v.includes("recebida"))  colRecebidas = i;
        if (v.includes("expedida"))  colExpedidas = i;
      });
      break;
    }
  }

  if (headerRow === -1) return { wb, updated: false };

  // Encontra linha da data de hoje
  let targetRow = -1;
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (!cell) continue;
    let d: Date | null = null;
    if (cell.t === "d" && cell.v instanceof Date) {
      d = cell.v;
    } else if (typeof cell.v === "number") {
      const parsed = XLSX.SSF.parse_date_code(cell.v);
      if (parsed) d = new Date(parsed.y, parsed.m - 1, parsed.d);
    }
    if (d && dateKey(d) === today) {
      targetRow = r;
      break;
    }
  }

  if (targetRow === -1) return { wb, updated: false };

  const writeCell = (col: number, val: number) => {
    if (col < 0) return;
    const addr = XLSX.utils.encode_cell({ r: targetRow, c: col });
    ws[addr] = { t: "n", v: val };
  };

  writeCell(colRodov, minutas);
  writeCell(colRecebidas, motosRec);
  if (motosExp > 0) writeCell(colExpedidas, motosExp);

  return { wb, updated: true };
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

    const today = todayKey();
    const chronusBuf = await chronusFile.arrayBuffer();

    // 1. Ler Chronus
    const minutas = lerChronus(chronusBuf);
    const { descarregadasHoje, emTransito, atrasadas, porEta, semData } = processarMinutas(minutas, today);

    const totalMinutas = descarregadasHoje.length;
    const totalMotos   = descarregadasHoje.reduce((s, r) => s + r.qtdMotos, 0);

    // 2. FrotaTMS
    const { total: motosExpedidas, count: frotatmsViagens } = await frotatmsExpedidas(today);

    // 3. Atualizar Volu (opcional)
    let voloFileB64 = "";
    let voloAtualizado = false;
    if (voloFile) {
      const voloBuf = await voloFile.arrayBuffer();
      const { wb: voloWb, updated } = atualizarVolu(voloBuf, today, totalMinutas, totalMotos, motosExpedidas);
      voloAtualizado = updated;
      const voloOut = XLSX.write(voloWb, { type: "base64", bookType: "xlsx" });
      voloFileB64 = voloOut;
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
