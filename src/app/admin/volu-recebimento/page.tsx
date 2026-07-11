"use client";

import { useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/components/auth/AuthGate";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AdminPageHeader } from "@/components/layout/AdminPageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { CheckCircle2, Download, Upload } from "lucide-react";

const PAD = "SIF";

type SyncStats = {
  pad: string;
  monitoramentoRows: number;
  daysWithArrival: number;
  daysUpdated: number;
  totalMotos: number;
  totalCargas: number;
};

export default function AdminVoluRecebimentoPage() {
  return (
    <AuthGate roles={["administrador"]}>
      {(profile) => <AdminVoluContent profile={profile} />}
    </AuthGate>
  );
}

function FilePick({
  id,
  label,
  file,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  hint: string;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-800">{label}</p>
      <input
        id={id}
        type="file"
        accept=".xlsx,.xls"
        className="sr-only"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <label
        htmlFor={id}
        className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand/30 bg-brand-muted/40 px-4 py-5 text-sm font-semibold text-brand transition hover:border-brand/50 hover:bg-brand-muted/70"
      >
        <Upload className="h-5 w-5" />
        {file ? "Trocar arquivo" : "Selecionar Excel"}
      </label>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
      {file && (
        <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          {file.name} ({Math.max(1, Math.round(file.size / 1024))} KB)
        </p>
      )}
    </div>
  );
}

function AdminVoluContent({
  profile,
}: {
  profile: { full_name: string; email?: string | null };
}) {
  const [volu, setVolu] = useState<File | null>(null);
  const [monitoramento, setMonitoramento] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const downloadRef = useRef<string | null>(null);

  async function handleSync() {
    if (!volu || !monitoramento) return;
    setBusy(true);
    setError(null);
    setStats(null);
    if (downloadRef.current) {
      URL.revokeObjectURL(downloadRef.current);
      downloadRef.current = null;
    }

    try {
      const form = new FormData();
      form.set("volu", volu);
      form.set("monitoramento", monitoramento);

      const res = await fetch("/api/admin/volu-recebimento/sync", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        throw new Error(json.message || json.error || "Falha na sincronização.");
      }

      const statsHeader = res.headers.get("X-Volu-Stats");
      if (statsHeader) {
        setStats(JSON.parse(statsHeader) as SyncStats);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      downloadRef.current = url;
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `Volu_Recebimento_${PAD}_atualizado.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell role="administrador" userName={profile.full_name} userEmail={profile.email}>
      <AdminPageHeader title="Volu Recebimento" />

      <Card className="mb-6 max-w-3xl">
        <CardHeader>
          <CardTitle>Atualizar Volu com Monitoramento Descida</CardTitle>
        </CardHeader>
        <div className="space-y-4 text-sm text-slate-600">
          <p>
            Cruza o <strong>Monitoramento Descida LSL</strong> com o{" "}
            <strong>Volu Recebimento</strong> do PAD <strong>{PAD}</strong>.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Preenche <strong>Rodoviário</strong>, <strong>Qde Motos Recebidas</strong> e{" "}
              <strong>OBS</strong> (balsas) por data de CHEGADA PAD
            </li>
            <li>
              <strong>Consolidado</strong> e <strong>Saldo</strong> continuam nas fórmulas do
              Excel
            </li>
            <li>
              <strong>Expedidas</strong> e Cabotagem não são alteradas (você alimenta a
              expedição manualmente)
            </li>
          </ul>
        </div>
      </Card>

      <div className="grid max-w-3xl gap-6 lg:grid-cols-2">
        <Card>
          <FilePick
            id="volu-file"
            label="1. Volu Recebimento (SIF)"
            file={volu}
            onChange={(f) => {
              setVolu(f);
              setError(null);
              setStats(null);
            }}
            hint="Ex.: Volu Recebimento Secundário_LSL - JULHO -SIF.xlsx"
          />
        </Card>
        <Card>
          <FilePick
            id="mon-file"
            label="2. Monitoramento Descida"
            file={monitoramento}
            onChange={(f) => {
              setMonitoramento(f);
              setError(null);
              setStats(null);
            }}
            hint="Arquivo completo (vários MB). Evite cópias de 0 KB."
          />
        </Card>
      </div>

      <div className="mt-6 max-w-3xl space-y-3">
        <Button
          variant="primary"
          className="w-full sm:w-auto"
          disabled={!volu || !monitoramento || busy}
          onClick={() => void handleSync()}
        >
          {busy ? (
            <>
              <Spinner size="sm" />
              Processando…
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Gerar Volu atualizado
            </>
          )}
        </Button>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        {stats && (
          <p className="flex items-start gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              PAD {stats.pad}: {stats.monitoramentoRows} linhas · {stats.daysWithArrival} dias
              com chegada · {stats.daysUpdated} dias preenchidos no Volu ·{" "}
              {stats.totalCargas} cargas / {stats.totalMotos} motos. O download deve ter
              iniciado.
            </span>
          </p>
        )}
      </div>
    </AppShell>
  );
}
