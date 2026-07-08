import { describe, expect, it } from "vitest";
import {
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

describe("shouldAutoPrioritize", () => {
  it("não prioriza sem vencimento", () => {
    expect(shouldAutoPrioritize(null)).toBe(false);
  });

  it("não prioriza NF vencida", () => {
    expect(shouldAutoPrioritize("2020-01-01")).toBe(false);
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
