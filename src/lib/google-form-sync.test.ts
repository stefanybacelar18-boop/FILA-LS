import { describe, expect, it } from "vitest";
import {
  buildGoogleFormRowId,
  mapGoogleFormStatus,
  parseGoogleFormRow,
} from "./google-form-sync";

describe("google-form-sync", () => {
  it("mapGoogleFormStatus trata finalizado e descarregado igual", () => {
    expect(mapGoogleFormStatus("FINALIZADO")).toBe("finalizado");
    expect(mapGoogleFormStatus("descarregado")).toBe("finalizado");
    expect(mapGoogleFormStatus("")).toBe("aguardando_descarregamento");
  });

  it("buildGoogleFormRowId usa carimbo e placa", () => {
    expect(buildGoogleFormRowId("13/08/2025 08:38:16", "EGK8I13")).toBe(
      "13/08/2025 08:38:16|EGK8I13"
    );
  });

  it("parseGoogleFormRow a partir de values da planilha", () => {
    const values = [
      "13/08/2025 08:38:16",
      "motorista@test.com",
      "584152",
      "LUCAS",
      "EGK8I13",
      "FUQ3231",
      "LDP",
      "(71)981631504",
      "",
      "18/08/2025",
      "FINALIZADO",
      "OPE1",
      "",
      "",
      "",
    ];

    const result = parseGoogleFormRow({ values });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.rowId).toBe("13/08/2025 08:38:16|EGK8I13");
    expect(result.data.status).toBe("finalizado");
    expect(result.data.minuta).toBe("584152");
    expect(result.data.placa_carreta).toBe("FUQ3231");
    expect(result.data.previsao_descarregamento).toBeTruthy();
  });

  it("rejeita linha sem placa", () => {
    const result = parseGoogleFormRow({
      values: ["13/08/2025 08:38:16", "", "1", "Nome", "", "", "", "", "", "", "", "", "", "", ""],
    });
    expect(result.ok).toBe(false);
  });
});
