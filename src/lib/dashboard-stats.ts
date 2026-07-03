import type { QueueEntry, DashboardStats } from "./types";
import {
  isActiveQueueStatus,
  normalizeQueueStatus,
} from "./constants";
import { isQueueEntryFromToday } from "./queue-day";

function isDriverCalled(entry: QueueEntry): boolean {
  return isActiveQueueStatus(entry.status) && Boolean(entry.called_at);
}

export interface EmpilhadorDashboardStats {
  aguardando: number;
  chamados: number;
  finalizadosHoje: number;
  ausentesHoje: number;
  retornoRacks: number;
  encerradosPorMim: number;
  minhasFinalizadas: number;
  minhasAusencias: number;
  totalOperacoesHoje: number;
}

export interface HourlyBucket {
  hour: number;
  label: string;
  count: number;
}

export function computeDashboardStats(entries: QueueEntry[]): DashboardStats {
  const todayEntries = entries.filter((e) => isQueueEntryFromToday(e.created_at));

  const finished = todayEntries.filter(
    (e) => normalizeQueueStatus(e.status) === "finalizado"
  );
  const waiting = todayEntries.filter((e) => isActiveQueueStatus(e.status));
  const called = todayEntries.filter((e) => isDriverCalled(e));
  const retornoRacksSim = todayEntries.filter((e) => e.retorno_racks_vazios === true);

  const waitTimes = finished
    .filter((e) => e.started_unload_at)
    .map(
      (e) =>
        (new Date(e.started_unload_at!).getTime() - new Date(e.created_at).getTime()) / 60000
    );

  const unloadTimes = finished
    .filter((e) => e.started_unload_at && e.finished_at)
    .map(
      (e) =>
        (new Date(e.finished_at!).getTime() - new Date(e.started_unload_at!).getTime()) / 60000
    );

  const transportadoraCount: Record<string, number> = {};
  todayEntries.forEach((e) => {
    transportadoraCount[e.transportadora] =
      (transportadoraCount[e.transportadora] ?? 0) + 1;
  });

  const rankingTransportadoras = Object.entries(transportadoraCount)
    .map(([transportadora, total]) => ({ transportadora, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return {
    veiculosHoje: todayEntries.length,
    veiculosAusentes: todayEntries.filter(
      (e) => normalizeQueueStatus(e.status) === "ausente"
    ).length,
    tempoMedioEsperaMin:
      waitTimes.length > 0 ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0,
    tempoMedioDescargaMin:
      unloadTimes.length > 0 ? unloadTimes.reduce((a, b) => a + b, 0) / unloadTimes.length : 0,
    veiculosFinalizados: finished.length,
    veiculosAguardando: waiting.length,
    veiculosEmDescarga: called.length,
    retornoRacksSim: retornoRacksSim.length,
    rankingTransportadoras,
  };
}

export function computeEmpilhadorStats(
  entries: QueueEntry[],
  userId: string
): EmpilhadorDashboardStats {
  const todayEntries = entries.filter((e) => isQueueEntryFromToday(e.created_at));

  const finalizadosHoje = todayEntries.filter(
    (e) => normalizeQueueStatus(e.status) === "finalizado"
  ).length;

  const ausentesHoje = todayEntries.filter(
    (e) => normalizeQueueStatus(e.status) === "ausente"
  ).length;

  const minhasFinalizadas = todayEntries.filter(
    (e) =>
      normalizeQueueStatus(e.status) === "finalizado" &&
      e.closed_by_user_id === userId
  ).length;

  const minhasAusencias = todayEntries.filter(
    (e) =>
      normalizeQueueStatus(e.status) === "ausente" &&
      e.closed_by_user_id === userId
  ).length;

  const encerradosPorMim = minhasFinalizadas + minhasAusencias;

  return {
    aguardando: todayEntries.filter((e) => isActiveQueueStatus(e.status)).length,
    chamados: todayEntries.filter((e) => isDriverCalled(e)).length,
    finalizadosHoje,
    ausentesHoje,
    retornoRacks: todayEntries.filter((e) => e.retorno_racks_vazios === true).length,
    encerradosPorMim,
    minhasFinalizadas,
    minhasAusencias,
    totalOperacoesHoje: finalizadosHoje + ausentesHoje,
  };
}

export function computeHourlyBuckets(entries: QueueEntry[]): HourlyBucket[] {
  const todayEntries = entries.filter((e) => isQueueEntryFromToday(e.created_at));
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}h`,
    count: 0,
  }));

  for (const entry of todayEntries) {
    const hour = new Date(entry.created_at).getHours();
    buckets[hour].count += 1;
  }

  const firstHour = buckets.findIndex((b) => b.count > 0);
  if (firstHour === -1) return buckets.slice(6, 20);

  const lastHour =
    buckets.length -
    1 -
    [...buckets].reverse().findIndex((b) => b.count > 0);

  const start = Math.max(0, firstHour - 1);
  const end = Math.min(23, lastHour + 1);
  return buckets.slice(start, end + 1);
}
