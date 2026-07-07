"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import {
  computeEspacoDisponivel,
  computeMotosNoEstoque,
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
}: {
  variant?: Variant;
  className?: string;
  onSaved?: (config: EstoqueExpedicaoConfig) => void;
}) {
  const [capacidadeTotal, setCapacidadeTotal] = useState("");
  const [expedicao, setExpedicao] = useState("");
  const [savedConfig, setSavedConfig] = useState<EstoqueExpedicaoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const capacidadeNum = Math.max(0, parseInt(capacidadeTotal, 10) || 0);
  const expedicaoNum = Math.max(0, parseInt(expedicao, 10) || 0);
  const motosNoEstoque = useMemo(
    () => computeMotosNoEstoque(capacidadeNum, expedicaoNum),
    [capacidadeNum, expedicaoNum]
  );
  const cabeHoje = useMemo(
    () => computeEspacoDisponivel(capacidadeNum, expedicaoNum),
    [capacidadeNum, expedicaoNum]
  );

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { ok, json } = await fetchJson<{
        error?: string;
        expedicao?: EstoqueExpedicaoConfig | null;
      }>("/api/admin/minutas/capacity");

      if (!ok) {
        setLoadError((json as { error?: string }).error ?? "Erro ao carregar estoque.");
        return;
      }

      const config = json.expedicao ?? null;
      setSavedConfig(config);
      if (config?.capacidade_estoque != null) {
        setCapacidadeTotal(String(config.capacidade_estoque));
      }
      if (config?.expedicao != null) {
        setExpedicao(String(config.expedicao));
      }
    } catch {
      setLoadError("Tempo esgotado ao carregar configuração.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function handleSave() {
    if (capacidadeNum <= 0) {
      alert("Informe a capacidade total do galpão (ex.: 950).");
      return;
    }

    if (expedicaoNum > capacidadeNum) {
      alert("A expedição (motos que cabem hoje) não pode ser maior que a capacidade total.");
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
          expedicao: expedicaoNum,
        }),
      });

      if (!ok) {
        alert(json.error ?? "Erro ao salvar.");
        return;
      }

      const config: EstoqueExpedicaoConfig = {
        capacidade_estoque: capacidadeNum,
        expedicao: expedicaoNum,
        updated_at: new Date().toISOString(),
      };
      setSavedConfig(config);
      setSavedMsg(
        `Cabe hoje: ${cabeHoje} motos · ${json.autoPrevisoes ?? 0} previsão(ões) recalculada(s)`
      );
      onSaved?.(config);
    } catch {
      alert("Tempo esgotado ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const cabeHojeBox = (
    <div
      className={cn(
        "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3",
        variant === "compact" && "px-3 py-2.5"
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
        O que cabe de motos hoje
      </p>
      <p className={cn("font-bold text-emerald-950", variant === "compact" ? "text-xl" : "text-2xl")}>
        {capacidadeNum > 0 ? cabeHoje : "—"}
        <span className="ml-1 text-sm font-semibold text-emerald-800">motos</span>
      </p>
      <p className="mt-0.5 text-xs text-emerald-700">
        {capacidadeNum > 0
          ? `${capacidadeNum} − ${motosNoEstoque} = ${cabeHoje}`
          : "Capacidade total − motos no estoque"}
      </p>
    </div>
  );

  const fields = (
    <div
      className={cn(
        "grid gap-3",
        variant === "compact" ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2"
      )}
    >
      <Input
        label="Capacidade total (galpão cheio)"
        type="number"
        min={0}
        value={capacidadeTotal}
        onChange={(e) => setCapacidadeTotal(e.target.value)}
        placeholder="Ex: 950"
        disabled={loading || saving}
      />
      <Input
        label="Expedição (motos que cabem hoje)"
        type="number"
        min={0}
        value={expedicao}
        onChange={(e) => setExpedicao(e.target.value)}
        placeholder="Ex: 50"
        disabled={loading || saving}
      />
      {variant === "compact" && cabeHojeBox}
      <div className="flex items-end">
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Capacidade do estoque
            </p>
            <p className="text-sm text-slate-600">
              Informe a <strong>capacidade total</strong> e a <strong>expedição</strong> (motos que
              cabem hoje). Ex.: 950 − 900 no estoque = <strong>50</strong> motos.
            </p>
          </div>
          {savedConfig && (
            <p className="text-xs text-slate-500">
              Salvo: {savedConfig.capacidade_estoque} −{" "}
              {computeMotosNoEstoque(
                savedConfig.capacidade_estoque,
                savedConfig.expedicao
              )}{" "}
              = {computeEspacoDisponivel(savedConfig.capacidade_estoque, savedConfig.expedicao)}{" "}
              motos
            </p>
          )}
        </div>
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
          Capacidade e expedição
        </CardTitle>
      </CardHeader>
      <p className="mb-4 text-sm text-slate-600">
        Informe a <strong>capacidade total</strong> do galpão (ex.: 950 cheio) e a{" "}
        <strong>expedição do dia</strong> — quantas motos cabem hoje (ex.: 50). O sistema mostra{" "}
        <strong>950 − 900 no estoque = 50 motos</strong>. Se expediu 950 com galpão cheio, amanhã
        cabem 950 de novo.
      </p>
      {loadError && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      )}
      {fields}
      {variant === "card" && <div className="mt-4">{cabeHojeBox}</div>}
      {savedMsg && <p className="mt-3 text-sm text-green-700">{savedMsg}</p>}
    </Card>
  );
}
