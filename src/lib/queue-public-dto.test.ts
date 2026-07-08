import { describe, expect, it } from "vitest";
import {
  isMotoristaOwnEntry,
  toMotoristaQueueEntry,
  toPublicQueueEntry,
} from "./queue-public-dto";
import type { QueueEntry } from "./types";

const base: QueueEntry = {
  id: "e1",
  token: "secret-token",
  minuta: "99999",
  nome: "João Silva",
  cpf: "123",
  telefone: "11999999999",
  placa: "ABC1D23",
  placa_cavalo: "ABC1D23",
  placa_carreta: "XYZ9W87",
  placa_segunda_carreta: null,
  tipo_veiculo: "convencional",
  transportadora: "Transp",
  empresa: "Emp",
  tipo_carga: "Motos",
  retorno_racks_vazios: false,
  observacoes: "obs",
  status: "aguardando_descarregamento",
  prioridade: false,
  doca: null,
  previsao_descarregamento: null,
  posicao_fila: 2,
  called_at: null,
  started_unload_at: null,
  finished_at: null,
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
  deleted_at: null,
  driver_user_id: "driver-a",
  checkin_lat: -22.7,
  checkin_lng: -47.1,
  device_id: "dev",
  user_agent: "ua",
  ip_address: "1.2.3.4",
  closed_by_user_id: null,
};

describe("toPublicQueueEntry", () => {
  it("remove PII e token", () => {
    const pub = toPublicQueueEntry(base);
    expect(pub.minuta).toBe("99999");
    expect("nome" in pub).toBe(false);
    expect("token" in pub).toBe(false);
    expect("placa_cavalo" in pub).toBe(false);
  });
});

describe("toMotoristaQueueEntry", () => {
  it("marca is_mine apenas para o viewer", () => {
    const mine = toMotoristaQueueEntry(base, "driver-a");
    const other = toMotoristaQueueEntry(base, "driver-b");
    expect(mine.is_mine).toBe(true);
    expect(other.is_mine).toBeUndefined();
    expect(isMotoristaOwnEntry(mine)).toBe(true);
    expect(isMotoristaOwnEntry(other)).toBe(false);
  });
});
