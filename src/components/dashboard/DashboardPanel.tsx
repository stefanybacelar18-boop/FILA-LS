"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { QueueEntry } from "@/lib/types";
import { toAppRole } from "@/lib/types";
import { computeDashboardStats, computeHourlyBuckets } from "@/lib/dashboard-stats";
import { formatDuration, formatQueueTime } from "@/lib/utils";
import { formatManausDateLabel, getTodayStartISO } from "@/lib/queue-day";
import { createDebouncedFn } from "@/lib/debounce";
import { AppShell } from "@/components/layout/AppShell";
import { PageHero } from "@/components/ui/PageHero";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import {
  Trophy,
  BarChart3,
  CheckCircle2,
  Clock,
  PhoneCall,
  Timer,
  UserX,
  Activity,
} from "lucide-react";
import {
  QUEUE_STATUSES,
  STATUS_LABELS,
  normalizeQueueStatus,
} from "@/lib/constants";

export function DashboardPanel({
  profile,
}: {
  profile: { role: string; full_name: string };
}) {
  const supabase = createClient();
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from("queue_entries")
      .select("*")
      .is("deleted_at", null)
      .gte("created_at", getTodayStartISO());

    setEntries((data as QueueEntry[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
    const debounced = createDebouncedFn(() => fetchData(), 400);

    const channel = supabase
      .channel("dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_entries" },
        () => debounced.call()
      )
      .subscribe();

    return () => {
      debounced.cancel();
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchData]);

  const stats = computeDashboardStats(entries);
  const hourlyBuckets = computeHourlyBuckets(entries);
  const maxHourly = Math.max(...hourlyBuckets.map((b) => b.count), 1);

  const statusCounts = Object.fromEntries(
    QUEUE_STATUSES.map((status) => [
      status,
      entries.filter((e) => normalizeQueueStatus(e.status) === status).length,
    ])
  ) as Record<(typeof QUEUE_STATUSES)[number], number>;

  const maxStatusCount = Math.max(...Object.values(statusCounts), 1);
  const taxaConclusao =
    stats.veiculosHoje > 0
      ? Math.round((stats.veiculosFinalizados / stats.veiculosHoje) * 100)
      : 0;

  const recentActivity = [...entries]
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    .slice(0, 8);

  return (
    <AppShell role={toAppRole(profile.role)} userName={profile.full_name}>
      <PageHero
        eyebrow="Dashboard operacional"
        title={formatManausDateLabel()}
        description="Indicadores do dia · atualização em tempo real"
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Na fila agora"
              value={stats.veiculosAguardando}
              icon={Clock}
              accent="brand"
            />
            <StatCard
              title="Chamados p/ doca"
              value={stats.veiculosEmDescarga}
              icon={PhoneCall}
              accent="blue"
            />
            <StatCard
              title="Finalizados"
              value={stats.veiculosFinalizados}
              icon={CheckCircle2}
              accent="green"
            />
            <StatCard
              title="Taxa de conclusão"
              value={`${taxaConclusao}%`}
              subtitle={`${stats.veiculosFinalizados} de ${stats.veiculosHoje} hoje`}
              icon={BarChart3}
              accent="green"
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <StatCard
              title="Tempo médio espera"
              value={formatDuration(stats.tempoMedioEsperaMin)}
              icon={Timer}
              accent="slate"
            />
            <StatCard
              title="Tempo médio descarga"
              value={formatDuration(stats.tempoMedioDescargaMin)}
              icon={Timer}
              accent="slate"
            />
            <StatCard
              title="Ausentes"
              value={stats.veiculosAusentes}
              icon={UserX}
              accent="amber"
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-brand" />
                  Distribuição por status
                </CardTitle>
              </CardHeader>
              <div className="space-y-3">
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
                  <p className="text-sm text-slate-500">Sem movimentação hoje.</p>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  Veículos por transportadora
                </CardTitle>
              </CardHeader>
              {stats.rankingTransportadoras.length === 0 ? (
                <p className="text-sm text-slate-500">Sem dados hoje.</p>
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
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-brand" />
                  Chegadas por hora
                </CardTitle>
              </CardHeader>
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
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-brand" />
                  Atividade recente
                </CardTitle>
              </CardHeader>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-slate-500">Sem movimentação hoje.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recentActivity.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-800">
                          {entry.minuta || entry.placa}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {entry.placa} · {entry.transportadora}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {STATUS_LABELS[normalizeQueueStatus(entry.status)]}
                        </span>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {formatQueueTime(entry.updated_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
