"use client";

import { useAuthGuard } from "@/hooks/useAuthGuard";
import { History } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Spinner } from "@/components/ui/Spinner";
import { createClient } from "@/lib/supabase/client";
import type { QueueHistory, QueueEntry } from "@/lib/types";
import { getStatusLabel } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { toAppRole } from "@/lib/types";
import { createDebouncedFn } from "@/lib/debounce";
import { useEffect, useState, useCallback, useMemo } from "react";

interface HistoryRow extends QueueHistory {
  queue_entries: Pick<QueueEntry, "placa" | "nome" | "transportadora" | "minuta"> | null;
}

export default function HistoricoPage() {
  const { profile, checking, authError } = useAuthGuard(["administrador"]);
  const supabase = useMemo(() => createClient(), []);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const fetchHistory = useCallback(async () => {
    const { data } = await supabase
      .from("queue_history")
      .select("*, queue_entries(placa, nome, transportadora, minuta)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);

    setHistory((data as HistoryRow[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!profile) return;

    setLoading(true);
    void fetchHistory();

    const debounced = createDebouncedFn(() => void fetchHistory(), 800);

    const channel = supabase
      .channel("history")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "queue_history" },
        () => debounced.call()
      )
      .subscribe();

    return () => {
      debounced.cancel();
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchHistory, profile]);

  if (authError) {
    return (
      <PageLoader error={authError} onRetry={() => window.location.reload()} />
    );
  }

  if (checking || !profile) {
    return <PageLoader message="Verificando sessão…" />;
  }

  const filtered = history.filter((h) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      h.queue_entries?.placa?.toLowerCase().includes(q) ||
      h.queue_entries?.minuta?.toLowerCase().includes(q) ||
      h.queue_entries?.nome?.toLowerCase().includes(q) ||
      h.changed_by_name?.toLowerCase().includes(q)
    );
  });

  return (
    <AppShell role={toAppRole(profile.role)} userName={profile.full_name}>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <History className="h-6 w-6 text-brand" />
            Histórico de Movimentações
          </h1>
          <p className="mt-1 text-sm text-slate-500">Registro completo de alterações</p>
        </div>
        <Input
          placeholder="Buscar por minuta, placa, nome..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full sm:max-w-xs"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 text-left">
                <th className="section-eyebrow px-4 py-3.5">Data</th>
                <th className="section-eyebrow px-4 py-3.5">Minuta</th>
                <th className="section-eyebrow px-4 py-3.5">Placa</th>
                <th className="section-eyebrow px-4 py-3.5">Motorista</th>
                <th className="section-eyebrow px-4 py-3.5">De</th>
                <th className="section-eyebrow px-4 py-3.5">Para</th>
                <th className="section-eyebrow px-4 py-3.5">Doca</th>
                <th className="section-eyebrow px-4 py-3.5">Por</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 transition-colors hover:bg-brand-muted/20"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-brand">
                      {row.queue_entries?.minuta ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold">
                      {row.queue_entries?.placa ?? "—"}
                    </td>
                    <td className="px-4 py-3">{row.queue_entries?.nome ?? "—"}</td>
                    <td className="px-4 py-3">
                      {row.old_status ? getStatusLabel(row.old_status) : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {getStatusLabel(row.new_status)}
                    </td>
                    <td className="px-4 py-3">{row.doca ?? "—"}</td>
                    <td className="px-4 py-3">{row.changed_by_name ?? "Sistema"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
