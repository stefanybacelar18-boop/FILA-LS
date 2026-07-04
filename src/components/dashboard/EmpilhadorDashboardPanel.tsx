"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { QueueEntry } from "@/lib/types";
import { computeEmpilhadorStats } from "@/lib/dashboard-stats";
import { formatManausDateLabel, isEntryClosedToday } from "@/lib/queue-day";
import { fetchStaffQueueToday } from "@/lib/queue-fetch";
import { createDebouncedFn } from "@/lib/debounce";
import { FieldStaffShell } from "@/components/layout/FieldStaffShell";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import {
  CheckCircle2,
  UserX,
  PhoneCall,
  Clock,
  Target,
  AlertCircle,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { normalizeQueueStatus } from "@/lib/constants";

export function EmpilhadorDashboardPanel({
  profile,
}: {
  profile: { id: string; full_name: string };
}) {
  const supabase = createClient();
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setFetchError(null);
    const { data, error } = await fetchStaffQueueToday();
    if (error) {
      setFetchError(error);
      setEntries([]);
    } else {
      setEntries(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const debounced = createDebouncedFn(() => fetchData(), 400);

    const channel = supabase
      .channel("empilhador-dashboard")
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

  const stats = computeEmpilhadorStats(entries, profile.id);
  const participacaoPct =
    stats.totalOperacoesHoje > 0
      ? Math.round((stats.encerradosPorMim / stats.totalOperacoesHoje) * 100)
      : 0;

  const minhasRecentes = entries
    .filter(
      (e) =>
        normalizeQueueStatus(e.status) === "finalizado" &&
        e.closed_by_user_id === profile.id &&
        isEntryClosedToday(e)
    )
    .sort(
      (a, b) =>
        new Date(b.finished_at ?? b.updated_at).getTime() -
        new Date(a.finished_at ?? a.updated_at).getTime()
    )
    .slice(0, 6);

  return (
    <FieldStaffShell userName={profile.full_name}>
      <header className="mb-4">
        <p className="section-eyebrow">Operação · Descarga</p>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Meu desempenho</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Resumo do dia · {formatManausDateLabel(new Date())}
        </p>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : fetchError ? (
        <div
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível carregar o resumo</p>
            <p className="mt-1 text-red-700">{fetchError}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void fetchData();
              }}
              className="mt-2 font-semibold underline"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 overflow-hidden rounded-2xl border border-brand/20 bg-brand-hero p-5 text-white shadow-lg shadow-brand/15">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-white/70">
                  Operações encerradas por você
                </p>
                <p className="mt-1 text-5xl font-bold tabular-nums">{stats.encerradosPorMim}</p>
                <p className="mt-2 text-sm text-white/80">
                  {stats.minhasFinalizadas} finalizadas · {stats.minhasAusencias} ausentes
                </p>
              </div>
              <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
                <Target className="h-6 w-6 text-white/90" />
                <span className="mt-0.5 text-xs font-bold">{participacaoPct}%</span>
              </div>
            </div>
            {stats.totalOperacoesHoje > 0 && (
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-white/70">
                  <span>Sua participação no pátio</span>
                  <span>
                    {stats.encerradosPorMim} de {stats.totalOperacoesHoje}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/20">
                  <div
                    className="h-2 rounded-full bg-white transition-all"
                    style={{ width: `${participacaoPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <StatCard
              title="Finalizadas (pátio)"
              value={stats.finalizadosHoje}
              subtitle={`${stats.minhasFinalizadas} por você`}
              icon={CheckCircle2}
              accent="green"
            />
            <StatCard
              title="Ausentes (pátio)"
              value={stats.ausentesHoje}
              subtitle={`${stats.minhasAusencias} por você`}
              icon={UserX}
              accent="amber"
            />
            <StatCard title="Aguardando" value={stats.aguardando} icon={Clock} accent="blue" />
            <StatCard
              title="Chamados"
              value={stats.chamados}
              icon={PhoneCall}
              accent="brand"
            />
          </div>

          {minhasRecentes.length > 0 && (
            <Card className="mt-4 overflow-hidden p-0">
              <CardHeader className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Suas últimas operações
                </CardTitle>
              </CardHeader>
              <ul className="divide-y divide-slate-100">
                {minhasRecentes.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-brand">
                        {e.minuta ? `Minuta ${e.minuta}` : e.nome}
                      </p>
                      <p className="truncate font-mono text-xs text-slate-600">
                        {e.placa_cavalo || e.placa}
                      </p>
                    </div>
                    <StatusBadge status={e.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {stats.totalOperacoesHoje === 0 && stats.aguardando === 0 && stats.chamados === 0 && (
            <p className="mt-6 text-center text-sm text-slate-500">
              Nenhuma operação registrada hoje no pátio.
            </p>
          )}
        </>
      )}
    </FieldStaffShell>
  );
}
