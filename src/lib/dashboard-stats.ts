import type { QueueEntry, DashboardStats } from "./types";
import {
  isActiveQueueStatus,
  isAusenteQueueStatus,
  normalizeQueueStatus,
} from "./constants";
import { countAguardandoDescarregamento, countFinalizadasNoDiaOperacional } from "./queue-counters";
import { isEntryClosedToday, isQueueEntryFromToday } from "./queue-day";

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

  const activeInQueue = entries.filter((e) => isActiveQueueStatus(e.status));
  const calledInQueue = activeInQueue.filter((e) => isDriverCalled(e));
  const ausenteInQueue = entries.filter((e) => isAusenteQueueStatus(e.status));

  const finishedToday = entries.filter(
    (e) =>
      normalizeQueueStatus(e.status) === "finalizado" && isEntryClosedToday(e)
  );
  const retornoRacksSim = todayEntries.filter((e) => e.retorno_racks_vazios === true);

  const waitTimes = finishedToday
    .filter((e) => e.started_unload_at)
    .map(
      (e) =>
        (new Date(e.started_unload_at!).getTime() - new Date(e.created_at).getTime()) / 60000
    );

  const unloadTimes = finishedToday
    .filter((e) => e.started_unload_at && e.finished_at)
    .map(
      (e) =>
        (new Date(e.finished_at!).getTime() - new Date(e.started_unload_at!).getTime()) / 60000
    );

  const transportadoraCount: Record<string, number> = {};
  todayEntries.forEach((e) => {
    const key = e.transportadora?.trim() || "—";
    transportadoraCount[key] = (transportadoraCount[key] ?? 0) + 1;
  });

  const rankingTransportadoras = Object.entries(transportadoraCount)
    .map(([transportadora, total]) => ({ transportadora, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return {
    veiculosHoje: todayEntries.length,
    veiculosAusentes: ausenteInQueue.length,
    tempoMedioEsperaMin:
      waitTimes.length > 0 ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0,
    tempoMedioDescargaMin:
      unloadTimes.length > 0 ? unloadTimes.reduce((a, b) => a + b, 0) / unloadTimes.length : 0,
    veiculosFinalizados: finishedToday.length,
    veiculosAguardando: activeInQueue.length,
    veiculosEmDescarga: calledInQueue.length,
    retornoRacksSim: retornoRacksSim.length,
    rankingTransportadoras,
  };
}

export function computeEmpilhadorStats(
  entries: QueueEntry[],
  userId: string
): EmpilhadorDashboardStats {
  const activeEntries = entries.filter((e) => isActiveQueueStatus(e.status));
  const closedToday = entries.filter((e) => isEntryClosedToday(e));

  const finalizadosHoje = countFinalizadasNoDiaOperacional(entries);

  const ausentesHoje = entries.filter((e) => isAusenteQueueStatus(e.status)).length;

  const minhasFinalizadas = closedToday.filter(
    (e) =>
      normalizeQueueStatus(e.status) === "finalizado" &&
      e.closed_by_user_id === userId
  ).length;

  const minhasAusencias = entries.filter(
    (e) =>
      isAusenteQueueStatus(e.status) &&
      e.closed_by_user_id === userId
  ).length;

  const encerradosPorMim = minhasFinalizadas + minhasAusencias;

  return {
    aguardando: countAguardandoDescarregamento(entries),
    chamados: activeEntries.filter((e) => isDriverCalled(e)).length,
    finalizadosHoje: countFinalizadasNoDiaOperacional(entries),
    ausentesHoje,
    retornoRacks: entries.filter((e) => e.retorno_racks_vazios === true).length,
    encerradosPorMim,
    minhasFinalizadas,
    minhasAusencias,
    totalOperacoesHoje: countFinalizadasNoDiaOperacional(entries) + ausentesHoje,
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
