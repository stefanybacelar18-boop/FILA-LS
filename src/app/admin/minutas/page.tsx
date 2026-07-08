"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/components/auth/AuthGate";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AdminPageHeader } from "@/components/layout/AdminPageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { EstoqueExpedicaoEditor } from "@/components/admin/EstoqueExpedicaoEditor";
import type { CapacityPlan, EstoqueExpedicaoConfig } from "@/lib/minuta-intelligence";
import {
  computeMotosComportamDiaSeguinte,
} from "@/lib/minuta-intelligence";
import { formatPrevisaoDate } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";
import {
  Upload,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

const API_TIMEOUT_MS = 90_000;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const json = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

export default function AdminMinutasPage() {
  return (
    <AuthGate roles={["administrador"]}>
      {(profile) => <AdminMinutasContent profile={profile} />}
    </AuthGate>
  );
}

function AdminMinutasContent({ profile }: { profile: { full_name: string; email?: string | null } }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [estoqueConfig, setEstoqueConfig] = useState<EstoqueExpedicaoConfig | null>(null);
  const [plan, setPlan] = useState<CapacityPlan | null>(null);
  const [totalImportadas, setTotalImportadas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const loadCapacity = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const { ok, json } = await fetchJson<{
        error?: string;
        expedicao?: EstoqueExpedicaoConfig | null;
        plan?: CapacityPlan | null;
        totalImportadas?: number;
      }>("/api/admin/minutas/capacity");

      if (!ok) {
        setLoadError(json.error ?? "Erro ao carregar dados.");
        return;
      }

      setEstoqueConfig(json.expedicao ?? null);
      setPlan(json.plan ?? null);
      setTotalImportadas(json.totalImportadas ?? 0);
    } catch {
      setLoadError("Tempo esgotado ao carregar. Verifique se o servidor está respondendo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCapacity();
  }, [loadCapacity]);

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const { ok, json } = await fetchJson<{
        error?: string;
        imported?: number;
        created?: number;
        updated?: number;
        unchanged?: number;
        totalInFile?: number;
        totalMotos?: number;
        format?: string;
        preview?: Array<{ minuta: string; volume_motos: number; menor_vencimento: string | null }>;
        matchedInQueue?: number;
        autoPriorities?: number;
        autoPrevisoes?: number;
      }>("/api/admin/minutas/import", { method: "POST", body: form });

      if (!ok) {
        setImportError(json.error ?? "Falha na importação.");
        return;
      }

      const formatLabel =
        json.format === "consulta_geral_motos"
          ? "Consulta Geral de Motos"
          : "planilha resumida";

      const previewText =
        json.preview?.length
          ? ` Ex.: minuta ${json.preview[0].minuta} com ${json.preview[0].volume_motos} motos.`
          : "";

      const dedupParts = [
        json.created ? `${json.created} nova(s)` : null,
        json.updated ? `${json.updated} atualizada(s)` : null,
        json.unchanged ? `${json.unchanged} já existiam (sem alteração)` : null,
      ].filter(Boolean);

      const dedupText =
        dedupParts.length > 0
          ? dedupParts.join(" · ")
          : `${json.imported ?? 0} minuta(s) processada(s)`;

      setImportResult(
        `${dedupText} (${formatLabel}) · ${json.totalMotos ?? 0} motos no arquivo · ${json.matchedInQueue ?? 0} na fila · ${json.autoPriorities ?? 0} prioridade(s) · ${json.autoPrevisoes ?? 0} previsão(ões)${previewText}`
      );
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadCapacity();
    } catch {
      setImportError(
        "Importação demorou demais ou o servidor travou. Reinicie o servidor (npm run start:lan) e tente de novo."
      );
    } finally {
      setImporting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);

    try {
      const { ok, json } = await fetchJson<{
        error?: string;
        autoPriorities?: number;
        autoPrevisoes?: number;
      }>("/api/admin/minutas/sync", { method: "POST" });

      if (!ok) {
        setSyncError(json.error ?? "Erro ao recalcular.");
        return;
      }

      setSyncResult(
        `Fila atualizada · ${json.autoPriorities ?? 0} prioridade(s) · ${json.autoPrevisoes ?? 0} previsão(ões)`
      );
      await loadCapacity();
    } catch {
      setSyncError("Recálculo demorou demais. Reinicie o servidor e tente novamente.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <AppShell role="administrador" userName={profile.full_name} userEmail={profile.email}>
      <AdminPageHeader title="Inteligência de minutas" />

      {loadError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" disabled={syncing} onClick={() => void handleSync()}>
          {syncing ? <Spinner size="sm" /> : "Recalcular fila agora"}
        </Button>
        {syncResult && <span className="text-sm text-green-700">{syncResult}</span>}
      </div>

      {syncError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {syncError}
        </p>
      )}

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Minutas importadas" value={totalImportadas} accent="brand" />
        <StatCard
          title="Capacidade do estoque"
          value={estoqueConfig?.capacidade_estoque ?? "—"}
          accent="blue"
        />
        <StatCard
          title="Motos expedidas"
          value={estoqueConfig?.expedicao ?? "—"}
          accent="slate"
        />
        <StatCard
          title="Comportam amanhã"
          value={
            estoqueConfig
              ? computeMotosComportamDiaSeguinte(
                  estoqueConfig.capacidade_estoque,
                  estoqueConfig.expedicao
                )
              : "—"
          }
          accent="green"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-brand" />
              Importar planilha Excel
            </CardTitle>
          </CardHeader>

          <input
            ref={fileInputRef}
            id="minuta-file-input"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setImportError(null);
              setImportResult(null);
            }}
            className="sr-only"
          />

          <label
            htmlFor="minuta-file-input"
            className="mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand/30 bg-brand-muted/40 px-4 py-6 text-sm font-semibold text-brand transition hover:border-brand/50 hover:bg-brand-muted/70"
          >
            <Upload className="h-5 w-5" />
            {file ? "Trocar arquivo" : "Selecionar arquivo Excel"}
          </label>

          {file && (
            <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              Arquivo pronto: <strong>{file.name}</strong> ({Math.round(file.size / 1024)} KB)
            </p>
          )}

          <Button
            variant="primary"
            className="w-full"
            disabled={!file || importing}
            onClick={() => void handleImport()}
          >
            {importing ? (
              <>
                <Spinner size="sm" />
                Importando…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Importar arquivo
              </>
            )}
          </Button>

          {importError && <p className="mt-3 text-sm text-red-600">{importError}</p>}
          {importResult && (
            <p className="mt-3 flex items-start gap-2 text-sm text-green-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              {importResult}
            </p>
          )}
        </Card>

        <EstoqueExpedicaoEditor
          variant="card"
          deferLoad={loading}
          initialConfig={estoqueConfig}
          onSaved={() => void loadCapacity()}
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Previsão automática de descarregamento</CardTitle>
        </CardHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size="md" />
          </div>
        ) : !plan || plan.capacidadeEstoque <= 0 ? (
          <p className="text-sm text-slate-500">Configure estoque e expedição.</p>
        ) : plan.minutasSugeridas.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma minuta na fila com volume importado.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {plan.minutasSugeridas.map((item, idx) => (
              <li key={item.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-semibold text-slate-800">
                    #{idx + 1} · {item.minuta ?? "—"}
                    {item.prioridade && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                        PRIORIDADE
                      </span>
                    )}
                    {item.diaOffset === 0 && !item.empurrada_por_capacidade && (
                      <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-800">
                        HOJE
                      </span>
                    )}
                    {item.empurrada_por_capacidade && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                        NÃO CABE HOJE
                      </span>
                    )}
                    {!item.empurrada_por_capacidade && item.ultrapassa_capacidade && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                        CAPACIDADE
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.volume_motos} motos
                    {item.menor_vencimento
                      ? ` · Venc. ${formatPrevisaoDate(item.menor_vencimento)}`
                      : ""}
                  </p>
                  {item.capacidade_aviso && (
                    <p className="mt-1 flex items-start gap-1 text-xs font-medium text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {item.capacidade_aviso}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                  {formatPrevisaoDate(item.previsao_descarregamento)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
