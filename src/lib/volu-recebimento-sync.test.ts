import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  aggregateMonitoramentoByChegadaPad,
  formatVoluObservacao,
  syncVoluRecebimentoFromMonitoramento,
  VOLU_PAD,
} from "@/lib/volu-recebimento-sync";

function buildMonitoramentoBook() {
  const header = Array(44).fill("");
  header[3] = "MINUTA";
  header[9] = "SW/ BALSA TRANSP.";
  header[10] = "FLUVIAL";
  header[11] = "BALSA";
  header[13] = "QDE MOTOS";
  header[14] = "STATUS";
  header[15] = "PAD";
  header[43] = "CHEGADA PAD";

  const mk = (
    minuta: string,
    pad: string,
    motos: number,
    balsa: string,
    chegada: string
  ) => {
    const r = Array(44).fill("");
    r[3] = minuta;
    r[10] = "SW";
    r[11] = balsa;
    r[13] = motos;
    r[14] = "AGUARDANDO DESCARREGAMENTO PAD";
    r[15] = pad;
    r[43] = chegada;
    return r;
  };

  const data = [
    header,
    mk("1", "SIF", 40, "LISBOA", "02/07/2026"),
    mk("2", "SIF", 51, "OSAKA", "02/07/2026"),
    mk("3", "REC", 99, "TOKYO", "02/07/2026"),
    mk("4", "SIF", 60, "YOKOHAMA", "30/06/2026"),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "2025");
  return wb;
}

function buildVoluBook() {
  const sheet: XLSX.WorkSheet = {
    "!ref": "A16:L20",
    G16: { t: "n", v: 1403, w: "1,403" },
    A17: { t: "s", v: "Data" },
    B17: { t: "s", v: "Consolidado" },
    C17: { t: "s", v: "Cabotagem" },
    D17: { t: "s", v: "Rodoviário" },
    E17: { t: "s", v: "Qde Motos Recebidas" },
    F17: { t: "s", v: "Qde Motos Expedidas" },
    G17: { t: "s", v: "Saldo" },
    L17: { t: "s", v: "OBSERVAÇÕES" },
    // Texto no mesmo formato do Volu real (dia/mês + weekday)
    A18: { t: "s", v: "01/07 Wed", w: "01/07 Wed" },
    B18: { t: "n", v: 0, f: "SUM(C18:D18)" },
    F18: { t: "n", v: 347 },
    G18: { t: "n", v: 1056, f: "G16+E18-F18" },
    A19: { t: "s", v: "02/07 Thu", w: "02/07 Thu" },
    B19: { t: "n", v: 0, f: "SUM(C19:D19)" },
    F19: { t: "n", v: 359 },
    G19: { t: "n", v: 0, f: "G18+E19-F19" },
    A20: { t: "s", v: "03/07 Fri", w: "03/07 Fri" },
    F20: { t: "n", v: 100 },
  };
  // Ano auxiliar para dayKeyFromVoluCell (via parseExcelDate do valor)
  sheet.A18 = { t: "d", v: new Date(2026, 6, 1), w: "01/07 Wed" };
  sheet.A19 = { t: "d", v: new Date(2026, 6, 2), w: "02/07 Thu" };
  sheet.A20 = { t: "d", v: new Date(2026, 6, 3), w: "03/07 Fri" };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Planilha1");
  return wb;
}

describe("volu-recebimento-sync", () => {
  it("agrega só PAD SIF por CHEGADA PAD", () => {
    const { rows, byDay } = aggregateMonitoramentoByChegadaPad(
      buildMonitoramentoBook(),
      VOLU_PAD
    );
    expect(rows).toBe(3);
    expect(byDay.get("2026-07-02")).toEqual({
      dayKey: "2026-07-02",
      cargas: 2,
      motos: 91,
      balsas: ["LISBOA", "OSAKA"],
    });
    expect(byDay.get("2026-06-30")?.motos).toBe(60);
  });

  it("formata observação como no Volu manual", () => {
    expect(
      formatVoluObservacao({
        dayKey: "2026-07-02",
        cargas: 2,
        motos: 91,
        balsas: ["LISBOA", "OSAKA"],
      })
    ).toBe("LISBOA/OSAKA (FLUVIAL)");
  });

  it("preenche Rodoviário, Recebidas e OBS sem tocar Expedidas", () => {
    const result = syncVoluRecebimentoFromMonitoramento(
      buildVoluBook(),
      buildMonitoramentoBook(),
      VOLU_PAD
    );
    const sheet = result.workbook.Sheets.Planilha1;

    expect(result.stats.daysUpdated).toBe(1);
    expect(sheet.D19?.v).toBe(2);
    expect(sheet.E19?.v).toBe(91);
    expect(sheet.L19?.v).toBe("LISBOA/OSAKA (FLUVIAL)");
    expect(sheet.F19?.v).toBe(359);
    expect(sheet.B19?.f).toBe("SUM(C19:D19)");
    expect(sheet.G19?.f).toBe("G18+E19-F19");
    expect(result.stats.totalMotos).toBe(151);
  });
});
