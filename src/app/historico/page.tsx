"use client";

import { useAuthGuard } from "@/hooks/useAuthGuard";
import { AdminPageHeader } from "@/components/layout/AdminPageHeader";
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
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const fetchHistory = useCallback(async () => {
    setFetchError(null);
    const { data, error } = await supabase
      .from("queue_history")
      .select("*, queue_entries(placa, nome, transportadora, minuta)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setFetchError("Não foi possível carregar o histórico.");
      setHistory([]);
    } else {
      setHistory((data as HistoryRow[]) ?? []);
    }
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
    <AppShell role={toAppRole(profile.role)} userName={profile.full_name} userEmail={profile.email}>
      <AdminPageHeader
        title="Histórico de movimentações"
        description="Registro completo de alterações"
      >
        <Input
          placeholder="Buscar por minuta, placa, nome..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full sm:min-w-[240px]"
        />
      </AdminPageHeader>

      {fetchError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {fetchError}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner label="Carregando histórico…" />
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="data-table w-full min-w-[720px] text-sm">
            <thead className="border-b border-slate-200">
              <tr className="text-left">
                <th className="table-head-cell">Data</th>
                <th className="table-head-cell">Minuta</th>
                <th className="table-head-cell">Placa</th>
                <th className="table-head-cell">Motorista</th>
                <th className="table-head-cell">De</th>
                <th className="table-head-cell">Para</th>
                <th className="table-head-cell">Doca</th>
                <th className="table-head-cell">Por</th>
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
                  <tr key={row.id}>
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
