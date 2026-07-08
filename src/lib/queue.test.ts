import { describe, expect, it } from "vitest";
import { compareQueueOrder, resolveQueuePosition } from "./queue";
import type { QueueEntry } from "./types";

function entry(
  partial: Partial<QueueEntry> & Pick<QueueEntry, "id" | "status">
): QueueEntry {
  return {
    token: "t",
    minuta: "1",
    nome: "N",
    cpf: "",
    telefone: "",
    placa: "",
    placa_cavalo: "",
    placa_carreta: "",
    placa_segunda_carreta: null,
    tipo_veiculo: "convencional",
    transportadora: "T",
    empresa: "",
    tipo_carga: "",
    retorno_racks_vazios: false,
    observacoes: null,
    prioridade: false,
    doca: null,
    previsao_descarregamento: null,
    posicao_fila: 1,
    called_at: null,
    started_unload_at: null,
    finished_at: null,
    created_at: "2026-07-08T10:00:00Z",
    updated_at: "2026-07-08T10:00:00Z",
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

describe("compareQueueOrder", () => {
  it("prioridade manual vem primeiro", () => {
    const a = entry({ id: "a", status: "aguardando_descarregamento", prioridade: false });
    const b = entry({ id: "b", status: "aguardando_descarregamento", prioridade: true });
    expect(compareQueueOrder(a, b)).toBeGreaterThan(0);
  });

  it("desempata por vencimento NF mais próximo", () => {
    const a = entry({
      id: "a",
      status: "aguardando_descarregamento",
      menor_vencimento: "2026-07-20",
    });
    const b = entry({
      id: "b",
      status: "aguardando_descarregamento",
      menor_vencimento: "2026-07-10",
    });
    expect(compareQueueOrder(a, b)).toBeGreaterThan(0);
  });
});

describe("resolveQueuePosition", () => {
  it("calcula posição na fila ativa", () => {
    const first = entry({ id: "1", status: "aguardando_descarregamento", prioridade: true });
    const second = entry({ id: "2", status: "aguardando_descarregamento" });
    const all = [second, first];
    expect(resolveQueuePosition(first, all)).toBe(1);
    expect(resolveQueuePosition(second, all)).toBe(2);
  });
});
