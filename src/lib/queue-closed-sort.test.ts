import { describe, expect, it } from "vitest";
import { sortClosedEntries } from "./queue-closed-sort";
import type { QueueEntry } from "./types";

function entry(partial: Partial<QueueEntry>): QueueEntry {
  return {
    id: partial.id ?? "1",
    token: "t",
    minuta: "1",
    nome: "",
    cpf: "",
    telefone: "",
    placa: "",
    placa_cavalo: "",
    placa_carreta: "",
    placa_segunda_carreta: null,
    tipo_veiculo: "convencional",
    transportadora: "",
    empresa: "",
    tipo_carga: "",
    retorno_racks_vazios: false,
    observacoes: null,
    status: "finalizado",
    prioridade: false,
    doca: null,
    previsao_descarregamento: null,
    posicao_fila: 1,
    called_at: null,
    started_unload_at: null,
    finished_at: null,
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    deleted_at: null,
    driver_user_id: null,
    checkin_lat: null,
    checkin_lng: null,
    device_id: null,
    user_agent: null,
    ip_address: null,
    closed_by_user_id: null,
    ...partial,
  };
}

describe("sortClosedEntries", () => {
  it("ordena finalizados do mais recente ao mais antigo", () => {
    const older = entry({
      id: "a",
      finished_at: "2026-07-08T10:00:00Z",
    });
    const newer = entry({
      id: "b",
      finished_at: "2026-07-08T14:00:00Z",
    });
    const sorted = sortClosedEntries([older, newer]);
    expect(sorted[0].id).toBe("b");
    expect(sorted[1].id).toBe("a");
  });
});
