"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/components/auth/AuthGate";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AdminPageHeader } from "@/components/layout/AdminPageHeader";
import { StatCard } from "@/components/ui/StatCard";
import type { CapacityPlan, ExpedicaoDiaria } from "@/lib/minuta-intelligence";
import { formatPrevisaoDate } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";
import {
  Upload,
  FileSpreadsheet,
  Bike,
  AlertTriangle,
  CheckCircle2,
  Package,
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

function AdminMinutasContent({ profile }: { profile: { full_name: string } }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [expedicaoMotos, setExpedicaoMotos] = useState("");
  const [savingExpedicao, setSavingExpedicao] = useState(false);
  const [expedicaoSaved, setExpedicaoSaved] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expedicao, setExpedicao] = useState<ExpedicaoDiaria | null>(null);
  const [plan, setPlan] = useState<CapacityPlan | null>(null);
  const [totalImportadas, setTotalImportadas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const loadCapacity = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const { ok, json } = await fetchJson<{
        error?: string;
        expedicao?: ExpedicaoDiaria | null;
        plan?: CapacityPlan | null;
        totalImportadas?: number;
      }>("/api/admin/minutas/capacity");

      if (!ok) {
        setLoadError(json.error ?? "Erro ao carregar dados.");
        return;
      }

      setExpedicao(json.expedicao ?? null);
      setPlan(json.plan ?? null);
      setTotalImportadas(json.totalImportadas ?? 0);
      if (json.expedicao?.motos != null) {
        setExpedicaoMotos(String(json.expedicao.motos));
      }
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

      setImportResult(
        `${json.imported ?? 0} minuta(s) importada(s) (${formatLabel}) · ${json.totalMotos ?? 0} motos · ${json.matchedInQueue ?? 0} na fila · ${json.autoPriorities ?? 0} prioridade(s) · ${json.autoPrevisoes ?? 0} previsão(ões)${previewText}`
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

  async function saveExpedicao() {
    setSavingExpedicao(true);
    setExpedicaoSaved(null);
    const motos = Math.max(0, parseInt(expedicaoMotos, 10) || 0);

    try {
      const { ok, json } = await fetchJson<{ error?: string; autoPrevisoes?: number }>(
        "/api/admin/minutas/capacity",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motos }),
        }
      );

      if (!ok) {
        alert(json.error ?? "Erro ao salvar expedição.");
        return;
      }

      setExpedicaoSaved(
        `Expedição salva: ${motos} motos · ${json.autoPrevisoes ?? 0} previsão(ões) atualizada(s)`
      );
      await loadCapacity();
    } catch {
      alert("Tempo esgotado ao salvar. Reinicie o servidor e tente novamente.");
    } finally {
      setSavingExpedicao(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);

    try {
      const { ok, json } = await fetchJson<{
        error?: string;
        autoPriorities?: number;
        autoPrevisoes?: number;
      }>("/api/admin/minutas/sync", { method: "POST" });

      if (!ok) {
        alert(json.error ?? "Erro ao recalcular.");
        return;
      }

      setSyncResult(
        `Fila atualizada · ${json.autoPriorities ?? 0} prioridade(s) · ${json.autoPrevisoes ?? 0} previsão(ões)`
      );
      await loadCapacity();
    } catch {
      alert("Recálculo demorou demais. Reinicie o servidor e tente novamente.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <AppShell role="administrador" userName={profile.full_name}>
      <AdminPageHeader
        title="Inteligência de minutas"
        description="Importe Excel, defina expedição e recalcule prioridades e previsões"
      />

      {loadError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" disabled={syncing} onClick={() => void handleSync()}>
          {syncing ? <Spinner size="sm" /> : "Recalcular fila agora"}
        </Button>
        {syncResult && <span className="text-sm text-green-700">{syncResult}</span>}
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Minutas importadas" value={totalImportadas} accent="brand" />
        <StatCard
          title="Expedição (motos)"
          value={expedicao?.motos ?? "—"}
          subtitle="Capacidade diária"
          accent="blue"
        />
        <StatCard
          title="Minutas cabem hoje"
          value={plan?.minutasCabeHoje ?? "—"}
          subtitle={plan ? `${plan.motosCabeHoje} de ${plan.motosExpedicao} motos` : "Informe expedição"}
          accent="green"
        />
        <StatCard
          title="Motos na fila"
          value={plan?.motosNaFila ?? "—"}
          subtitle={plan ? `${plan.minutasNaFila} minuta(s) c/ volume` : undefined}
          accent="amber"
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
          <p className="mb-4 text-sm text-slate-600">
            Compatível com <strong>ConsultaGeralMotos</strong> (1 linha por moto). Agrupa por{" "}
            <strong>MINUTA</strong>, conta motos e calcula o menor <strong>VENCIMENTO NF</strong>.
          </p>

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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bike className="h-5 w-5 text-brand" />
              Expedição da noite
            </CardTitle>
          </CardHeader>
          <p className="mb-4 text-sm text-slate-600">
            Quantas motos saem na expedição (ex.: 500). Define a capacidade diária de descarga.
          </p>
          <Input
            label="Motos expedidas (capacidade diária)"
            type="number"
            min={0}
            value={expedicaoMotos}
            onChange={(e) => setExpedicaoMotos(e.target.value)}
            placeholder="Ex: 500"
          />
          <Button
            className="mt-4 w-full"
            disabled={savingExpedicao}
            onClick={() => void saveExpedicao()}
          >
            {savingExpedicao ? (
              <>
                <Spinner size="sm" />
                Salvando…
              </>
            ) : (
              "Salvar expedição"
            )}
          </Button>
          {expedicaoSaved && (
            <p className="mt-3 text-sm text-green-700">{expedicaoSaved}</p>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Previsão automática de descarga</CardTitle>
        </CardHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size="md" />
          </div>
        ) : !plan || plan.motosExpedicao <= 0 ? (
          <p className="text-sm text-slate-500">
            Informe a expedição e importe a planilha. Minutas na fila precisam bater com as importadas.
          </p>
        ) : plan.minutasSugeridas.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma minuta na fila hoje com volume importado. Confira se os números das minutas coincidem.
          </p>
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
                    {item.diaOffset === 0 && (
                      <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-800">
                        HOJE
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.volume_motos} motos
                    {item.menor_vencimento
                      ? ` · Venc. ${item.menor_vencimento.split("-").reverse().join("/")}`
                      : ""}
                  </p>
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
