import { describe, expect, it } from "vitest";
import { canCheckInAgain, hasActiveCheckIn } from "./checkin-rules";
import type { QueueEntry } from "./types";

function entry(partial: Partial<QueueEntry> & Pick<QueueEntry, "status">): QueueEntry {
  return {
    id: "1",
    token: "abc",
    minuta: "12345",
    nome: "Test",
    cpf: "",
    telefone: "",
    placa: "",
    placa_cavalo: "ABC1D23",
    placa_carreta: "",
    placa_segunda_carreta: null,
    tipo_veiculo: "convencional",
    transportadora: "T",
    empresa: "",
    tipo_carga: "",
    retorno_racks_vazios: false,
    observacoes: null,
    status: partial.status,
    prioridade: false,
    doca: null,
    previsao_descarregamento: null,
    posicao_fila: 1,
    called_at: null,
    started_unload_at: null,
    finished_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    driver_user_id: "user-1",
    checkin_lat: null,
    checkin_lng: null,
    device_id: null,
    user_agent: null,
    ip_address: null,
    closed_by_user_id: null,
    ...partial,
  };
}

describe("hasActiveCheckIn", () => {
  it("retorna entrada aguardando descarregamento", () => {
    const active = entry({ status: "aguardando_descarregamento" });
    expect(hasActiveCheckIn([active])?.id).toBe("1");
  });

  it("ignora finalizados", () => {
    const closed = entry({ status: "finalizado" });
    expect(hasActiveCheckIn([closed])).toBeNull();
  });
});

describe("canCheckInAgain", () => {
  it("permite quando checkin_liberado", () => {
    expect(canCheckInAgain(null, { checkin_liberado: true }).allowed).toBe(true);
  });

  it("bloqueia dentro do cooldown", () => {
    const recent = entry({
      status: "finalizado",
      created_at: new Date().toISOString(),
    });
    expect(canCheckInAgain(recent, { checkin_liberado: false }).allowed).toBe(false);
  });
});
