import { describe, expect, it } from "vitest";
import { forecastDescarregamentoFromCheckIn, VIAGEM_PREVISAO_DIAS } from "./trip-forecast";
import { addManausDays, getManausDateYmd } from "./queue-day";

describe("forecastDescarregamentoFromCheckIn", () => {
  it("soma 5 dias corridos no fuso operacional", () => {
    const date = new Date("2026-07-30T15:00:00-03:00");
    const ymd = getManausDateYmd(date);
    const expected = addManausDays(ymd, VIAGEM_PREVISAO_DIAS);
    const iso = forecastDescarregamentoFromCheckIn(date);
    expect(iso.startsWith(expected)).toBe(true);
  });
});
