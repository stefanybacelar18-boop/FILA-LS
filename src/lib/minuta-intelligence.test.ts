import { describe, expect, it } from "vitest";
import { addManausDays, getManausDateYmd } from "./queue-day";
import {
  daysUntilVencimento,
  isNfVencida,
  normalizeMinutaKey,
  shouldAutoPrioritize,
} from "./minuta-intelligence";

describe("normalizeMinutaKey", () => {
  it("remove espaços e converte para maiúsculas", () => {
    expect(normalizeMinutaKey("  12345  ")).toBe("12345");
    expect(normalizeMinutaKey("abc 12")).toBe("ABC12");
  });
});

describe("daysUntilVencimento", () => {
  it("retorna 0 para vencimento hoje", () => {
    const today = getManausDateYmd();
    expect(daysUntilVencimento(today)).toBe(0);
  });

  it("retorna 1 para vencimento amanhã", () => {
    const tomorrow = addManausDays(getManausDateYmd(), 1);
    expect(daysUntilVencimento(tomorrow)).toBe(1);
  });
});

describe("shouldAutoPrioritize", () => {
  it("não prioriza sem vencimento", () => {
    expect(shouldAutoPrioritize(null)).toBe(false);
  });

  it("não prioriza NF vencida", () => {
    expect(shouldAutoPrioritize("2020-01-01")).toBe(false);
  });

  it("prioriza NF que vence amanhã", () => {
    const tomorrow = addManausDays(getManausDateYmd(), 1);
    expect(shouldAutoPrioritize(tomorrow)).toBe(true);
  });

  it("não prioriza NF que vence hoje", () => {
    expect(shouldAutoPrioritize(getManausDateYmd())).toBe(false);
  });
});

describe("isNfVencida", () => {
  it("detecta vencimento no passado", () => {
    expect(isNfVencida("2020-01-01")).toBe(true);
  });

  it("ignora vencimento futuro", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(isNfVencida(future.toISOString().slice(0, 10))).toBe(false);
  });
});
