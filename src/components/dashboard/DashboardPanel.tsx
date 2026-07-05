"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import type { QueueEntry } from "@/lib/types";
import { toAppRole } from "@/lib/types";
import { computeDashboardStats, computeHourlyBuckets } from "@/lib/dashboard-stats";
import { formatDuration, formatQueueTime } from "@/lib/utils";
import { sanitizeQueueEntries } from "@/lib/sanitize-queue-entry";
import { formatManausDateLabel } from "@/lib/queue-day";
import { createDebouncedFn } from "@/lib/debounce";
import { AppShell } from "@/components/layout/AppShell";
import { AdminPageHeader } from "@/components/layout/AdminPageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Trophy,
  BarChart3,
  Clock,
  Activity,
} from "lucide-react";
import {
  QUEUE_STATUSES,
  STATUS_LABELS,
  isActiveQueueStatus,
  isAusenteQueueStatus,
  normalizeQueueStatus,
} from "@/lib/constants";

export function DashboardPanel({
  profile,
}: {
  profile: { role: string; full_name: string; email?: string | null };
}) {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams({ scope: "all", _: String(Date.now()) });
    const res = await fetch(`/api/queue/today?${params.toString()}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { data?: QueueEntry[] };

    if (res.ok) {
      setEntries(sanitizeQueueEntries(json.data ?? []));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const debounced = createDebouncedFn(() => fetchData(), 400);
    const interval = setInterval(fetchData, 60_000);

    return () => {
      debounced.cancel();
      clearInterval(interval);
    };
  }, [fetchData]);

  const stats = useMemo(() => computeDashboardStats(entries), [entries]);
  const hourlyBuckets = useMemo(() => computeHourlyBuckets(entries), [entries]);
  const maxHourly = useMemo(
    () => Math.max(...hourlyBuckets.map((b) => b.count), 1),
    [hourlyBuckets]
  );

  const queueSnapshot = useMemo(
    () =>
      entries.filter(
        (e) => isActiveQueueStatus(e.status) || isAusenteQueueStatus(e.status)
      ),
    [entries]
  );

  const statusCounts = useMemo(
    () =>
      Object.fromEntries(
        QUEUE_STATUSES.map((status) => [
          status,
          queueSnapshot.filter((e) => normalizeQueueStatus(e.status) === status).length,
        ])
      ) as Record<(typeof QUEUE_STATUSES)[number], number>,
    [queueSnapshot]
  );

  const maxStatusCount = useMemo(
    () => Math.max(...Object.values(statusCounts), 1),
    [statusCounts]
  );

  const taxaConclusao = useMemo(
    () =>
      stats.veiculosHoje > 0
        ? Math.round((stats.veiculosFinalizados / stats.veiculosHoje) * 100)
        : 0,
    [stats.veiculosHoje, stats.veiculosFinalizados]
  );

  const recentActivity = useMemo(
    () =>
      [...entries]
        .sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )
        .slice(0, 8),
    [entries]
  );

  return (
    <AppShell role={toAppRole(profile.role)} userName={profile.full_name} userEmail={profile.email}>
      <AdminPageHeader
        eyebrow="Dashboard · Operação"
        title={formatManausDateLabel()}
        description="Fila ativa no pátio · indicadores do dia em tempo real"
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Na fila agora"
              value={stats.veiculosAguardando}
              subtitle="Minutas ativas aguardando"
              accent="brand"
            />
            <StatCard
              title="Chamados p/ doca"
              value={stats.veiculosEmDescarga}
              subtitle="Motorista acionado"
              accent="blue"
            />
            <StatCard title="Finalizados hoje" value={stats.veiculosFinalizados} accent="green" />
            <StatCard
              title="Taxa de conclusão"
              value={`${taxaConclusao}%`}
              subtitle={`${stats.veiculosFinalizados} de ${stats.veiculosHoje} check-ins hoje`}
              accent="green"
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <StatCard
              title="Tempo médio espera"
              value={formatDuration(stats.tempoMedioEsperaMin)}
              accent="slate"
            />
            <StatCard
              title="Tempo médio descarregamento"
              value={formatDuration(stats.tempoMedioDescargaMin)}
              accent="slate"
            />
            <StatCard
              title="Ausentes no pátio"
              value={stats.veiculosAusentes}
              accent="amber"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden p-0">
              <CardHeader className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-5 w-5 text-brand" />
                  Fila ativa por status
                </CardTitle>
              </CardHeader>
              <div className="space-y-3 p-5">
                {QUEUE_STATUSES.filter((status) => statusCounts[status] > 0).map((status) => {
                  const count = statusCounts[status];
                  return (
                    <div key={status}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-slate-600">{STATUS_LABELS[status]}</span>
                        <span className="font-bold text-slate-800">{count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-brand transition-all"
                          style={{ width: `${(count / maxStatusCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {Object.values(statusCounts).every((c) => c === 0) && (
                  <p className="text-sm text-slate-500">Nenhuma minuta ativa na fila.</p>
                )}
              </div>
            </Card>

            <Card className="overflow-hidden p-0">
              <CardHeader className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  Veículos por transportadora
                </CardTitle>
              </CardHeader>
              <div className="p-5">
              {stats.rankingTransportadoras.length === 0 ? (
                <p className="text-sm text-slate-500">Sem check-ins hoje.</p>
              ) : (
                <div className="space-y-3">
                  {stats.rankingTransportadoras.slice(0, 6).map((item, idx) => {
                    const max = stats.rankingTransportadoras[0]?.total || 1;
                    return (
                      <div key={item.transportadora}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="flex items-center gap-2 text-slate-600">
                            <span className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-slate-400">
                              {idx + 1}
                            </span>
                            {item.transportadora}
                          </span>
                          <span className="font-bold text-slate-800">{item.total}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-brand-light transition-all"
                            style={{ width: `${(item.total / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            </Card>

            <Card className="overflow-hidden p-0">
              <CardHeader className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-5 w-5 text-brand" />
                  Chegadas por hora
                </CardTitle>
              </CardHeader>
              <div className="p-5">
              {hourlyBuckets.every((b) => b.count === 0) ? (
                <p className="text-sm text-slate-500">Nenhuma chegada registrada hoje.</p>
              ) : (
                <div className="flex items-end gap-1.5" style={{ minHeight: "8rem" }}>
                  {hourlyBuckets.map((bucket) => (
                    <div
                      key={bucket.hour}
                      className="flex flex-1 flex-col items-center gap-1"
                    >
                      <span className="text-[10px] font-semibold text-slate-500">
                        {bucket.count > 0 ? bucket.count : ""}
                      </span>
                      <div
                        className="w-full rounded-t-md bg-brand/80 transition-all"
                        style={{
                          height: `${Math.max(8, (bucket.count / maxHourly) * 96)}px`,
                        }}
                        title={`${bucket.label}: ${bucket.count}`}
                      />
                      <span className="text-[9px] text-slate-400">{bucket.label}</span>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </Card>

            <Card className="overflow-hidden p-0">
              <CardHeader className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-5 w-5 text-brand" />
                  Atividade recente
                </CardTitle>
              </CardHeader>
              <div className="p-0">
              {recentActivity.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">Sem movimentação recente.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recentActivity.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-slate-50/80"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-brand">
                          {entry.minuta || "—"}
                        </p>
                        <p className="truncate font-mono text-xs text-slate-600">
                          {entry.placa_cavalo || entry.placa}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {entry.transportadora}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StatusBadge status={entry.status} />
                        <p className="text-[10px] tabular-nums text-slate-400">
                          {formatQueueTime(entry.updated_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              </div>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
