import { describe, expect, it } from "vitest";
import { isValidPlaca, validateCheckInBody } from "./checkin-validation";

const validBody = {
  minuta: "123456",
  nome: "João Silva",
  telefone: "(11) 98765-4321",
  transportadora: "Transportadora X",
  tipo_veiculo: "convencional" as const,
  placa_cavalo: "ABC1D23",
  placa_carreta: "XYZ9W87",
  device_id: "device-abc",
  user_agent: "test",
};

describe("isValidPlaca", () => {
  it("aceita placa Mercosul", () => {
    expect(isValidPlaca("ABC1D23")).toBe(true);
    expect(isValidPlaca("abc-1d23")).toBe(true);
  });

  it("rejeita formato inválido", () => {
    expect(isValidPlaca("AB12345")).toBe(false);
    expect(isValidPlaca("")).toBe(false);
  });
});

describe("validateCheckInBody", () => {
  it("aceita payload válido convencional", () => {
    const result = validateCheckInBody(validBody);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.placa_cavalo).toBe("ABC1D23");
      expect(result.data.placa_carreta).toBe("XYZ9W87");
    }
  });

  it("exige segunda carreta para bitrem", () => {
    const result = validateCheckInBody({
      ...validBody,
      tipo_veiculo: "bitrem",
    });
    expect(result.ok).toBe(false);
  });

  it("rejeita minuta curta", () => {
    const result = validateCheckInBody({ ...validBody, minuta: "12" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Minuta");
  });

  it("rejeita telefone inválido", () => {
    const result = validateCheckInBody({ ...validBody, telefone: "123" });
    expect(result.ok).toBe(false);
  });
});
