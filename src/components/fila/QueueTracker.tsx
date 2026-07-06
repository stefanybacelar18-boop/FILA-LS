"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { QueueEntry } from "@/lib/types";
import { countVehiclesAhead, resolveQueuePosition } from "@/lib/queue";
import { fetchEnrichedOperationalQueue } from "@/lib/queue-fetch";
import { getStatusLabel } from "@/lib/constants";
import { PanelShellHeader } from "@/components/brand/PanelShellHeader";
import { formatPrevisaoDate, getDriverFirstName } from "@/lib/utils";
import { sanitizeQueueEntry } from "@/lib/sanitize-queue-entry";
import { createDebouncedFn } from "@/lib/debounce";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { Clock, Users, RefreshCw } from "lucide-react";

/** Painel público LGPD — sem dados pessoais */
export function QueueTracker({ token, lgpd = true }: { token: string; lgpd?: boolean }) {
  const supabase = createClient();
  const [entry, setEntry] = useState<QueueEntry | null>(null);
  const [allEntries, setAllEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const { data: entryData, error: entryError } = await supabase
      .rpc("get_queue_by_token", { p_token: token });

    const row = Array.isArray(entryData) ? entryData[0] : entryData;

    if (entryError || !row) {
      setError("Check-in não encontrado.");
      setLoading(false);
      return;
    }

    setEntry(sanitizeQueueEntry(row as QueueEntry));

    setAllEntries(await fetchEnrichedOperationalQueue(supabase));
    setLoading(false);
  }, [supabase, token]);

  useEffect(() => {
    fetchData();
    const debounced = createDebouncedFn(() => fetchData(), 400);

    const channel = supabase
      .channel(`queue-track-${token}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_entries" }, () =>
        debounced.call()
      )
      .subscribe();
    return () => {
      debounced.cancel();
      supabase.removeChannel(channel);
    };
  }, [supabase, token, fetchData]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <Spinner />
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
        <Card className="max-w-md text-center"><p className="text-danger">{error}</p></Card>
      </div>
    );
  }

  const veiculosAFrente = Math.max(0, countVehiclesAhead(entry, allEntries));
  const posicao = resolveQueuePosition(entry, allEntries) ?? veiculosAFrente + 1;

  return (
    <div className="min-h-screen app-canvas-mobile">
      <PanelShellHeader
        logoHref={false}
        trailing={
          <button
            onClick={fetchData}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
            aria-label="Atualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        }
      />

      <div className="mx-auto max-w-lg px-4 py-6 space-y-4">
        <div className="text-center">
          <p className="text-sm text-slate-500">Acompanhamento da Fila</p>
          {lgpd ? (
            <p className="mt-1 text-2xl font-bold text-brand">Minuta {entry.minuta || "—"}</p>
          ) : (
            <h1 className="mt-1 text-2xl font-bold">{getDriverFirstName(entry.nome)}</h1>
          )}
        </div>

        <Card className="card-brand text-center py-8">
          <p className="text-sm font-medium text-slate-500 uppercase">Posição na fila</p>
          <p className="mt-2 text-7xl font-black text-brand animate-pulse-ring">{posicao}º</p>
          <div className="mt-4 flex justify-center">
            <StatusBadge status={entry.status} className="text-sm px-4 py-1" />
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card className="card-brand text-center py-4">
            <Users className="mx-auto h-6 w-6 text-brand-light" />
            <p className="mt-2 text-2xl font-bold">{veiculosAFrente}</p>
            <p className="text-xs text-slate-500">À frente</p>
          </Card>
          <Card className="card-brand text-center py-4">
            <Clock className="mx-auto h-6 w-6 text-brand-light" />
            <p className="mt-2 text-lg font-bold">{formatPrevisaoDate(entry.previsao_descarregamento)}</p>
            <p className="text-xs text-slate-500">Previsão</p>
          </Card>
        </div>

        <Card className="card-brand">
          <CardHeader><CardTitle className="text-base">Informações</CardTitle></CardHeader>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd className="font-medium">{getStatusLabel(entry.status)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Minuta</dt><dd className="font-medium">{entry.minuta || "—"}</dd></div>
            {entry.doca && <div className="flex justify-between"><dt className="text-slate-500">Doca</dt><dd className="font-bold text-success">{entry.doca}</dd></div>}
          </dl>
        </Card>

        <p className="text-center text-xs text-slate-400">Dados protegidos conforme LGPD • Atualização em tempo real</p>
      </div>
    </div>
  );
}
