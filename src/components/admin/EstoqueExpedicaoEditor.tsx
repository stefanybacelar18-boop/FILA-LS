"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import {
  computeMotosComportamDiaSeguinte,
  type EstoqueExpedicaoConfig,
} from "@/lib/minuta-intelligence";
import { cn } from "@/lib/utils";
import { Warehouse } from "lucide-react";

const API_TIMEOUT_MS = 60_000;

async function fetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; json: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const json = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, json };
  } finally {
    clearTimeout(timer);
  }
}

type Variant = "card" | "compact";

export function EstoqueExpedicaoEditor({
  variant = "card",
  className,
  onSaved,
  initialConfig,
  deferLoad = false,
}: {
  variant?: Variant;
  className?: string;
  onSaved?: (config: EstoqueExpedicaoConfig) => void;
  /** Dados já carregados pelo pai — evita fetch duplicado. */
  initialConfig?: EstoqueExpedicaoConfig | null;
  /** Aguarda o pai terminar de carregar antes de inicializar. */
  deferLoad?: boolean;
}) {
  const [capacidadeTotal, setCapacidadeTotal] = useState("");
  const [motosExpedidas, setMotosExpedidas] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const capacidadeNum = Math.max(0, parseInt(capacidadeTotal, 10) || 0);
  const expedidasNum = Math.max(0, parseInt(motosExpedidas, 10) || 0);
  const comportamAmanha = useMemo(
    () => computeMotosComportamDiaSeguinte(capacidadeNum, expedidasNum),
    [capacidadeNum, expedidasNum]
  );

  const applyConfig = useCallback((config: EstoqueExpedicaoConfig | null) => {
    if (config?.capacidade_estoque != null) {
      setCapacidadeTotal(String(config.capacidade_estoque));
    }
    if (config?.expedicao != null) {
      setMotosExpedidas(String(config.expedicao));
    }
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { ok, json } = await fetchJson<{
        error?: string;
        expedicao?: EstoqueExpedicaoConfig | null;
      }>("/api/admin/minutas/capacity");

      if (!ok) {
        setLoadError((json as { error?: string }).error ?? "Erro ao carregar.");
        return;
      }

      applyConfig(json.expedicao ?? null);
    } catch {
      setLoadError("Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [applyConfig]);

  useEffect(() => {
    if (deferLoad) return;
    if (initialConfig !== undefined) {
      applyConfig(initialConfig);
      setLoading(false);
      return;
    }
    void loadConfig();
  }, [deferLoad, initialConfig, applyConfig, loadConfig]);

  async function handleSave() {
    setValidationError(null);
    setSaveError(null);

    if (capacidadeNum <= 0) {
      setValidationError("Informe a capacidade do estoque.");
      return;
    }

    if (expedidasNum > capacidadeNum) {
      setValidationError("Motos expedidas não pode ser maior que a capacidade do estoque.");
      return;
    }

    setSaving(true);
    setSavedMsg(null);

    try {
      const { ok, json } = await fetchJson<{
        error?: string;
        autoPrevisoes?: number;
      }>("/api/admin/minutas/capacity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capacidade_estoque: capacidadeNum,
          expedicao: expedidasNum,
        }),
      });

      if (!ok) {
        setSaveError(json.error ?? "Erro ao salvar.");
        return;
      }

      setSavedMsg(
        `Salvo · ${json.autoPrevisoes ?? 0} previsão(ões) atualizada(s)`
      );
      onSaved?.({
        capacidade_estoque: capacidadeNum,
        expedicao: expedidasNum,
        updated_at: new Date().toISOString(),
      });
    } catch {
      setSaveError("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const resultadoBox = (
    <div
      className={cn(
        "flex h-full min-h-[4.5rem] flex-col justify-center rounded-xl border border-emerald-200/80 bg-emerald-50 px-4 py-3",
        variant === "compact" && "min-h-0 px-3 py-2.5"
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
        Comportam amanhã
      </p>
      <p className={cn("font-bold text-emerald-950", variant === "compact" ? "text-xl" : "text-2xl")}>
        {capacidadeNum > 0 ? comportamAmanha : "—"}
        <span className="ml-1 text-sm font-semibold text-emerald-800">motos</span>
      </p>
    </div>
  );

  const fields = (
    <div className="space-y-3">
      {(validationError || saveError) && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {validationError ?? saveError}
        </p>
      )}
      <div
        className={cn(
          "grid gap-3",
          variant === "card" ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"
        )}
      >
        <Input
          label="Capacidade do estoque"
          type="number"
          min={0}
          value={capacidadeTotal}
          onChange={(e) => {
            setCapacidadeTotal(e.target.value);
            setValidationError(null);
          }}
          placeholder="950"
          disabled={loading || saving}
          error={
            validationError?.includes("capacidade") ? validationError : undefined
          }
        />
        <Input
          label="Motos expedidas"
          type="number"
          min={0}
          value={motosExpedidas}
          onChange={(e) => {
            setMotosExpedidas(e.target.value);
            setValidationError(null);
          }}
          placeholder="0"
          disabled={loading || saving}
          error={
            validationError?.includes("expedidas") ? validationError : undefined
          }
        />
        {variant === "card" ? resultadoBox : variant === "compact" && resultadoBox}
      </div>
      <Button
        className="w-full"
        disabled={loading || saving}
        onClick={() => void handleSave()}
      >
        {saving ? (
          <>
            <Spinner size="sm" />
            Salvando…
          </>
        ) : (
          "Salvar e recalcular"
        )}
      </Button>
    </div>
  );

  if (variant === "compact") {
    return (
      <section
        className={cn(
          "mb-5 rounded-2xl border border-brand/12 bg-white p-4 shadow-[var(--shadow-card)]",
          className
        )}
      >
        {loadError && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
        )}
        {fields}
        {savedMsg && <p className="mt-2 text-sm text-green-700">{savedMsg}</p>}
      </section>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Warehouse className="h-5 w-5 text-brand" />
          Estoque e expedição
        </CardTitle>
      </CardHeader>
      {loadError && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      )}
      {fields}
      {savedMsg && <p className="mt-3 text-sm text-green-700">{savedMsg}</p>}
    </Card>
  );
}
