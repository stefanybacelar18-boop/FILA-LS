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
import { sanitizeQueueEntries } from "@/lib/sanitize-queue-entry";
import { getManausDateYmd, ymdToDayEndISO, ymdToDayStartISO } from "@/lib/queue-day";

function buildCheckinsParams(options: {
  statusFilter: string;
  search: string;
  dateFrom: string;
  dateTo: string;
  exportMode?: boolean;
}) {
  const params = new URLSearchParams();
  if (options.statusFilter !== "all") params.set("status", options.statusFilter);
  if (options.search.trim()) params.set("q", options.search.trim());
  if (options.dateFrom) params.set("from", ymdToDayStartISO(options.dateFrom));
  if (options.dateTo) params.set("to", ymdToDayEndISO(options.dateTo));
  if (options.exportMode) {
    params.set("export", "excel");
    params.set("limit", "2000");
  }
  return params;
}

export default function AdminCheckinsPage() {
  const { profile, checking, authError } = useAuthGuard(["administrador"]);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(getManausDateYmd());

  const fetchCheckins = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const params = buildCheckinsParams({ statusFilter, search, dateFrom, dateTo });

    try {
      const res = await fetch(`/api/queue/checkins?${params.toString()}`);
      const json = (await res.json().catch(() => ({}))) as {
        data?: QueueEntry[];
        error?: string;
      };

      if (res.ok) {
        setEntries(sanitizeQueueEntries(json.data ?? []));
      } else {
        setFetchError(json.error ?? "Não foi possível carregar os check-ins.");
        setEntries([]);
      }
    } catch {
      setFetchError("Erro de conexão ao carregar check-ins.");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, dateFrom, dateTo]);

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
    setExportError(null);
    try {
      const params = buildCheckinsParams({
        statusFilter,
        search,
        dateFrom,
        dateTo,
        exportMode: true,
      });

      const res = await fetch(`/api/queue/checkins?${params.toString()}`);
      if (!res.ok) {
        setExportError("Não foi possível exportar. Tente novamente.");
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
        setExportError("Erro ao gerar relatório.");
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
        description="Histórico com volume da minuta, vencimento NF, doca e previsão."
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

      {fetchError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {fetchError}
        </p>
      )}

      {exportError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {exportError}
        </p>
      )}

      <Card className="mb-4 p-4">
        <div className="grid gap-3 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="checkins-search" className="field-label">
                Buscar
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="checkins-search"
                  type="search"
                  placeholder="Minuta, placa, motorista..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200/90 bg-white py-3 pl-9 pr-3.5 text-base text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/12 sm:py-2.5 sm:text-sm"
                />
              </div>
            </div>
          </div>
          <div className="lg:col-span-2">
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: "all", label: "Todos" },
                ...QUEUE_STATUSES.map((s) => ({
                  value: s,
                  label: getStatusLabel(s),
                })),
              ]}
            />
          </div>
          <div className="lg:col-span-2">
            <Input
              label="De"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="lg:col-span-2">
            <Input
              label="Até"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div className="lg:col-span-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
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
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Período aplicado na listagem e na exportação · menor vencimento NF exclui Euclides da Cunha e
          Ribeira do Pombal (importação ConsultaGeralMotos)
        </p>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Carregando check-ins…" />
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="data-table w-full min-w-[1120px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80">
                <tr className="text-left">
                  <th className="table-head-cell whitespace-nowrap">Chegada</th>
                  <th className="table-head-cell whitespace-nowrap">Finalização</th>
                  <th className="table-head-cell whitespace-nowrap">Minuta</th>
                  <th className="table-head-cell whitespace-nowrap">Placa</th>
                  <th className="table-head-cell whitespace-nowrap">Motorista</th>
                  <th className="table-head-cell whitespace-nowrap">Transportadora</th>
                  <th className="table-head-cell whitespace-nowrap">Vol.</th>
                  <th className="table-head-cell whitespace-nowrap">Venc. NF</th>
                  <th className="table-head-cell whitespace-nowrap">Status</th>
                  <th className="table-head-cell whitespace-nowrap">Doca</th>
                  <th className="table-head-cell whitespace-nowrap">Previsão</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                        <ClipboardList className="h-5 w-5" />
                      </div>
                      <p className="mt-3 text-sm font-medium text-slate-600">
                        Nenhum check-in encontrado
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Ajuste a busca, o status ou o período.
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
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          <QueueEntryDateCell
                            day={formatEntryArrivalDay(row)}
                            time={formatEntryArrivalTime(row)}
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          {active ? (
                            <QueueEntryDateCell day="" time="" pending />
                          ) : hasFinished ? (
                            <QueueEntryDateCell day={finishedDay} time={finishedTime} />
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top font-medium text-brand">
                          {row.minuta || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top font-mono text-sm font-semibold text-slate-800">
                          {row.placa_cavalo || row.placa}
                        </td>
                        <td className="max-w-[140px] truncate px-4 py-3 align-top text-slate-700">
                          {row.nome || "—"}
                        </td>
                        <td className="max-w-[160px] truncate px-4 py-3 align-top text-slate-600">
                          {row.transportadora}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top tabular-nums text-slate-700">
                          {row.volume_motos != null && row.volume_motos > 0 ? (
                            <span className="inline-flex rounded-md bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800">
                              {row.volume_motos}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          {row.menor_vencimento ? (
                            <span className="inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                              {formatPrevisaoDate(row.menor_vencimento)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-slate-600">
                          {row.doca ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">
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
          </div>
          <p className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs text-slate-500">
            {entries.length} registro{entries.length !== 1 ? "s" : ""} · até 300 na tela · exportação
            inclui até 2.000 no período selecionado
          </p>
        </Card>
      )}
    </AppShell>
  );
}
