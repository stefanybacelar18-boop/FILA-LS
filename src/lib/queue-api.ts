import type { QueueEntry, QueueStatus } from "./types";

export type QueueUpdatePayload = {
  entryId: string;
  status?: QueueStatus;
  doca?: string | null;
  prioridade?: boolean;
  previsao_descarregamento?: string | null;
  retorno_racks_vazios?: boolean | null;
  called_at?: string | null;
};

export type DriverPushDelivery = {
  sent: number;
  failed: number;
  reason?: string;
};

export async function updateQueueEntryViaApi(
  payload: QueueUpdatePayload
): Promise<{ error: string | null; data?: QueueEntry | null; push?: DriverPushDelivery }> {
  const res = await fetch("/api/queue/update", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    data?: QueueEntry;
    push?: DriverPushDelivery;
  };

  if (!res.ok) {
    return { error: json.error ?? "Erro ao salvar alterações" };
  }

  return { error: null, data: json.data ?? null, push: json.push };
}
