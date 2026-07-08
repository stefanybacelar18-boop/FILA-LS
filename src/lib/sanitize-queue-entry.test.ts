import { describe, expect, it } from "vitest";
import { sanitizeQueueEntry, sanitizeQueueEntries } from "./sanitize-queue-entry";

describe("sanitizeQueueEntry", () => {
  it("converte null em string vazia nos campos de texto", () => {
    const out = sanitizeQueueEntry({
      nome: null as unknown as string,
      minuta: undefined,
      placa: "ABC1D23",
    });
    expect(out.nome).toBe("");
    expect(out.minuta).toBe("");
    expect(out.placa).toBe("ABC1D23");
  });
});

describe("sanitizeQueueEntries", () => {
  it("sanitiza lista inteira", () => {
    const rows = sanitizeQueueEntries([{ telefone: null as unknown as string }]);
    expect(rows[0].telefone).toBe("");
  });
});
