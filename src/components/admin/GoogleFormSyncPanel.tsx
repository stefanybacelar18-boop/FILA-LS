"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { RefreshCw, Sheet } from "lucide-react";

type SyncStatus = {
  webhookConfigured?: boolean;
  rowsInSheet?: number | null;
  lastSync?: {
    at?: string;
    created?: number;
    updated?: number;
    skipped?: number;
    totalRows?: number;
  } | null;
  sheetError?: string | null;
};

export function GoogleFormSyncPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/google-form/sync");
      const json = (await res.json()) as SyncStatus & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Erro ao carregar status.");
        return;
      }
      setStatus(json);
    } catch {
      setError("Falha ao carregar status da integração.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleSyncAll() {
    setSyncing(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/google-form/sync", { method: "POST" });
      const json = (await res.json()) as {
        error?: string;
        created?: number;
        updated?: number;
        unchanged?: number;
        skipped?: number;
        totalRows?: number;
        errors?: Array<{ row: number; error: string }>;
      };
      if (!res.ok) {
        setError(json.error ?? "Falha na sincronização.");
        return;
      }
      const errText =
        json.errors && json.errors.length > 0
          ? ` · ${json.errors.length} linha(s) com erro`
          : "";
      setMessage(
        `${json.totalRows ?? 0} linha(s) na planilha · ${json.created ?? 0} nova(s) · ${json.updated ?? 0} atualizada(s) · ${json.skipped ?? 0} ignorada(s)${errText}`
      );
      await loadStatus();
    } catch {
      setError("Tempo esgotado ou servidor indisponível.");
    } finally {
      setSyncing(false);
    }
  }

  const lastAt = status?.lastSync?.at
    ? new Date(status.lastSync.at).toLocaleString("pt-BR")
    : null;

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sheet className="h-5 w-5 text-brand" />
            Google Form → FilaDock
          </CardTitle>
          <p className="mt-1 text-sm text-slate-600">
            Respostas da planilha <strong>Respostas FORM VIG</strong> entram na fila automaticamente.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={loading || syncing} onClick={() => void loadStatus()}>
          {loading ? <Spinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>

      <div className="space-y-3 px-6 pb-6 text-sm">
        {loading && !status ? (
          <p className="text-slate-500">Carregando…</p>
        ) : (
          <ul className="space-y-1 text-slate-700">
            <li>
              Webhook instantâneo:{" "}
              <span className={status?.webhookConfigured ? "text-green-700 font-medium" : "text-amber-700 font-medium"}>
                {status?.webhookConfigured ? "configurado" : "pendente (secret na Vercel + Apps Script)"}
              </span>
            </li>
            <li>
              Linhas na planilha:{" "}
              <strong>{status?.rowsInSheet ?? "—"}</strong>
            </li>
            {lastAt && (
              <li>
                Última sync: {lastAt}
                {status?.lastSync?.created != null && (
                  <span className="text-slate-500">
                    {" "}
                    · {status.lastSync.created} nova(s) · {status.lastSync.updated} atualizada(s)
                  </span>
                )}
              </li>
            )}
            {status?.sheetError && (
              <li className="text-red-700">Erro ao ler planilha: {status.sheetError}</li>
            )}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button disabled={syncing} onClick={() => void handleSyncAll()}>
            {syncing ? <Spinner size="sm" /> : "Importar todas as linhas agora"}
          </Button>
          <span className="text-xs text-slate-500">
            Use na 1ª vez para trazer o histórico. Depois, novas respostas entram sozinhas.
          </span>
        </div>

        {message && <p className="text-green-700">{message}</p>}
        {error && <p className="text-red-700">{error}</p>}
      </div>
    </Card>
  );
}
