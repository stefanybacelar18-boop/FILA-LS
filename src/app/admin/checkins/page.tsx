"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getStatusLabel, QUEUE_STATUSES, isActiveQueueStatus } from "@/lib/constants";
import {
  formatEntryArrivalDay,
  formatEntryArrivalTime,
  formatEntryFinishedDay,
  formatEntryFinishedTime,
} from "@/lib/queue-entry-dates";
import { QueueEntryDateCell } from "@/components/fila/QueueEntryDates";
import type { QueueEntry } from "@/lib/types";
import { ClipboardList, Search, FileSpreadsheet } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { downloadCheckinsExcel } from "@/lib/export-checkins";
import { formatPrevisaoDate } from "@/lib/utils";

export default function AdminCheckinsPage() {
  const { profile, checking, authError } = useAuthGuard(["administrador"]);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchCheckins = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search.trim()) params.set("q", search.trim());

    const res = await fetch(`/api/queue/checkins?${params.toString()}`);
    const json = (await res.json().catch(() => ({}))) as {
      data?: QueueEntry[];
      error?: string;
    };

    if (res.ok) {
      setEntries(json.data ?? []);
    }
    setLoading(false);
  }, [search, statusFilter]);

  useEffect(() => {
    if (!profile) return;
    const timer = setTimeout(fetchCheckins, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchCheckins, search, profile]);

  async function handleExportExcel() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ export: "excel", limit: "2000" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("q", search.trim());

      const res = await fetch(`/api/queue/checkins?${params.toString()}`);
      if (!res.ok) {
        alert("Não foi possível exportar. Tente novamente.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 10);
      const link = document.createElement("a");
      link.href = url;
      link.download = `checkins-lsl-${stamp}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      if (entries.length > 0) {
        downloadCheckinsExcel(entries);
      } else {
        alert("Erro ao gerar relatório.");
      }
    } finally {
      setExporting(false);
    }
  }

  if (authError) {
    return (
      <PageLoader error={authError} onRetry={() => window.location.reload()} />
    );
  }

  if (checking || !profile) {
    return <PageLoader message="Verificando sessão…" />;
  }

  return (
    <AppShell role="administrador" userName={profile.full_name}>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <ClipboardList className="h-6 w-6 text-brand" />
          Registro de check-ins
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Histórico completo com dia da chegada do motorista e dia da finalização — para consultas
          futuras, dias anteriores e minutas encerradas.
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar minuta, placa, motorista..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          label=""
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "all", label: "Todos os status" },
            ...QUEUE_STATUSES.map((s) => ({
              value: s,
              label: getStatusLabel(s),
            })),
          ]}
          className="min-w-[200px]"
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={exporting || loading}
          onClick={handleExportExcel}
        >
          {exporting ? (
            <Spinner size="sm" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}
          Exportar CSV
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 text-left">
                <th className="section-eyebrow px-4 py-3.5">Dia chegada</th>
                <th className="section-eyebrow px-4 py-3.5">Dia finalização</th>
                <th className="section-eyebrow px-4 py-3.5">Minuta</th>
                <th className="section-eyebrow px-4 py-3.5">Placa</th>
                <th className="section-eyebrow px-4 py-3.5">Motorista</th>
                <th className="section-eyebrow px-4 py-3.5">Transportadora</th>
                <th className="section-eyebrow px-4 py-3.5">Status</th>
                <th className="section-eyebrow px-4 py-3.5">Doca</th>
                <th className="section-eyebrow px-4 py-3.5">Previsão</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                    Nenhum check-in encontrado.
                  </td>
                </tr>
              ) : (
                entries.map((row) => {
                  const active = isActiveQueueStatus(row.status);
                  const finishedDay = formatEntryFinishedDay(row);
                  const finishedTime = formatEntryFinishedTime(row);
                  const hasFinished = finishedDay !== "—";
                  return (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 transition-colors hover:bg-brand-muted/20"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <QueueEntryDateCell
                        day={formatEntryArrivalDay(row)}
                        time={formatEntryArrivalTime(row)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {active ? (
                        <QueueEntryDateCell day="" time="" pending />
                      ) : hasFinished ? (
                        <QueueEntryDateCell day={finishedDay} time={finishedTime} />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-brand">
                      {row.minuta || "—"}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold">
                      {row.placa_cavalo || row.placa}
                    </td>
                    <td className="px-4 py-3">{row.nome}</td>
                    <td className="px-4 py-3">{row.transportadora}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3">{row.doca ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.previsao_descarregamento ? (
                        <span className="text-sky-800">
                          {formatPrevisaoDate(row.previsao_descarregamento)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">
            {entries.length} registro{entries.length !== 1 ? "s" : ""} · até 300 na tela · exportação
            inclui até 2.000
          </p>
        </Card>
      )}
    </AppShell>
  );
}
