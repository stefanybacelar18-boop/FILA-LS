import { describe, expect, it } from "vitest";
import { addManausDays, getManausDateYmd } from "./queue-day";
import {
  DEFAULT_MINUTA_VOLUME_MEDIA,
  daysUntilVencimento,
  isNfVencida,
  isVolumeEstimado,
  mergeMetadataIntoEntries,
  normalizeMinutaKey,
  resolveVolumeMotos,
  shouldAutoPrioritize,
} from "./minuta-intelligence";
import type { QueueEntry } from "./types";

describe("normalizeMinutaKey", () => {
  it("remove espaços e converte para maiúsculas", () => {
    expect(normalizeMinutaKey("  12345  ")).toBe("12345");
    expect(normalizeMinutaKey("abc 12")).toBe("ABC12");
  });
});

describe("resolveVolumeMotos", () => {
  it("usa média 62 sem volume importado", () => {
    expect(resolveVolumeMotos(null)).toBe(DEFAULT_MINUTA_VOLUME_MEDIA);
    expect(resolveVolumeMotos(undefined)).toBe(62);
    expect(resolveVolumeMotos(0)).toBe(62);
    expect(isVolumeEstimado(null)).toBe(true);
  });

  it("usa volume real quando importado", () => {
    expect(resolveVolumeMotos(48)).toBe(48);
    expect(isVolumeEstimado(48)).toBe(false);
  });
});

describe("mergeMetadataIntoEntries volume", () => {
  const base = {
    id: "1",
    token: "t",
    driver_user_id: null,
    minuta: "584152",
    nome: "Teste",
    cpf: "",
    telefone: "1",
    placa: "ABC1D23",
    placa_cavalo: "ABC1D23",
    placa_carreta: null,
    placa_segunda_carreta: null,
    tipo_veiculo: null,
    transportadora: "X",
    empresa: "X",
    tipo_carga: "X",
    retorno_racks_vazios: null,
    observacoes: null,
    status: "aguardando_descarregamento" as const,
    doca: null,
    previsao_descarregamento: null,
    posicao_fila: null,
    checkin_lat: null,
    checkin_lng: null,
    device_id: null,
    ip_address: null,
    user_agent: null,
    called_at: null,
    started_unload_at: null,
    finished_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  } satisfies QueueEntry;

  it("aplica média 62 sem metadata e marca estimado", () => {
    const [row] = mergeMetadataIntoEntries([base], new Map());
    expect(row.volume_motos).toBe(62);
    expect(row.volume_estimado).toBe(true);
  });

  it("usa volume real da ConsultaGeral quando importado", () => {
    const map = new Map([
      [
        "584152",
        {
          minuta: "584152",
          volume_motos: 40,
          menor_vencimento: "2026-08-01",
        },
      ],
    ]);
    const [row] = mergeMetadataIntoEntries([base], map);
    expect(row.volume_motos).toBe(40);
    expect(row.volume_estimado).toBe(false);
    expect(row.menor_vencimento).toBe("2026-08-01");
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
