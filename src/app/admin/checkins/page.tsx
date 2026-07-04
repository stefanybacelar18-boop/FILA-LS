"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { AdminPageHeader } from "@/components/layout/AdminPageHeader";
import { RegistryStatsBar } from "@/components/ui/RegistryStatsBar";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  getStatusLabel,
  QUEUE_STATUSES,
  isActiveQueueStatus,
  normalizeQueueStatus,
} from "@/lib/constants";
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
import { cn } from "@/lib/utils";

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

  const registryStats = useMemo(() => {
    const active = entries.filter((e) => isActiveQueueStatus(e.status)).length;
    const finished = entries.filter(
      (e) => normalizeQueueStatus(e.status) === "finalizado"
    ).length;
    const absent = entries.filter(
      (e) => normalizeQueueStatus(e.status) === "ausente"
    ).length;
    return { total: entries.length, active, finished, absent };
  }, [entries]);

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
      link.download = `checkins-filadock-${stamp}.csv`;
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
    <AppShell role="administrador" userName={profile.full_name} userEmail={profile.email}>
      <AdminPageHeader
        eyebrow="Registros · Operação"
        title="Check-ins"
        description="Histórico com dia de chegada, finalização, doca e previsão."
      />

      {!loading && entries.length > 0 && (
        <RegistryStatsBar
          className="mb-6"
          items={[
            { label: "Registros", value: registryStats.total, tone: "brand" },
            { label: "Ativos", value: registryStats.active, tone: "amber" },
            { label: "Finalizados", value: registryStats.finished, tone: "emerald" },
            { label: "Ausentes", value: registryStats.absent, tone: "slate" },
          ]}
        />
      )}

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="relative min-w-0 flex-1">
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
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <Card className="overflow-x-auto overflow-hidden p-0">
          <table className="data-table w-full min-w-[960px] text-sm">
            <thead className="sticky top-12 z-10 border-b border-slate-200">
              <tr className="text-left">
                <th className="table-head-cell">Dia chegada</th>
                <th className="table-head-cell">Dia finalização</th>
                <th className="table-head-cell">Minuta</th>
                <th className="table-head-cell">Placa</th>
                <th className="table-head-cell">Motorista</th>
                <th className="table-head-cell">Transportadora</th>
                <th className="table-head-cell">Status</th>
                <th className="table-head-cell">Doca</th>
                <th className="table-head-cell">Previsão</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <ClipboardList className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-600">
                      Nenhum check-in encontrado
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Ajuste a busca ou o filtro de status.
                    </p>
                  </td>
                </tr>
              ) : (
                entries.map((row, idx) => {
                  const active = isActiveQueueStatus(row.status);
                  const finishedDay = formatEntryFinishedDay(row);
                  const finishedTime = formatEntryFinishedTime(row);
                  const hasFinished = finishedDay !== "—";
                  return (
                  <tr
                    key={row.id}
                    className={cn(idx % 2 === 1 && "bg-slate-50/30")}
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
                    <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-800">
                      {row.placa_cavalo || row.placa}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.nome}</td>
                    <td className="px-4 py-3 text-slate-600">{row.transportadora}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.doca ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.previsao_descarregamento ? (
                        <span className="inline-flex rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">
                          {formatPrevisaoDate(row.previsao_descarregamento)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <p className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs text-slate-500">
            {entries.length} registro{entries.length !== 1 ? "s" : ""} · até 300 na tela · exportação
            inclui até 2.000
          </p>
        </Card>
      )}
    </AppShell>
  );
}
