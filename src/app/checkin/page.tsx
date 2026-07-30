"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useMotoristaGuard } from "@/hooks/useAuthGuard";
import {
  hasActiveCheckIn,
  getDeviceId,
  getUserAgent,
  getCheckinCooldownBlock,
  formatCheckinCooldownMessage,
} from "@/lib/checkin-rules";
import type { CheckinCooldownBlock } from "@/lib/checkin-rules";
import type { QueueEntry } from "@/lib/types";
import {
  COOLDOWN_MESSAGE,
  MOTORISTA_HOME,
  REMOTE_CHECKIN_INFO,
  VEHICLE_TYPES,
} from "@/lib/constants";
import { formatPhone, formatPlaca } from "@/lib/utils";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Info } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { PageLoader } from "@/components/ui/PageLoader";
import { MotoristaShell } from "@/components/layout/MotoristaShell";
import { PanelPageTitle } from "@/components/brand/PanelShellHeader";
import { CheckinCooldownAlert } from "@/components/motorista/CheckinCooldownAlert";
import { isValidPlaca, PLACA_MERCOSUL_HINT } from "@/lib/checkin-validation";

export default function CheckInPage() {
  const router = useRouter();
  const supabase = createClient();
  const { profile, checking, authError } = useMotoristaGuard();

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [eligibilityLoading, setEligibilityLoading] = useState(true);
  const [cooldownBlock, setCooldownBlock] = useState<CheckinCooldownBlock | null>(null);
  const [checkinLiberado, setCheckinLiberado] = useState(false);

  const [form, setForm] = useState({
    minuta: "",
    nome: "",
    telefone: "",
    transportadora: "",
    tipo_veiculo: "convencional",
    placa_cavalo: "",
    placa_carreta: "",
    placa_segunda_carreta: "",
    retorno_racks_vazios: "",
    observacoes: "",
  });

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    setForm((f) => ({
      ...f,
      nome: profile.full_name || f.nome,
      telefone: profile.telefone ? formatPhone(profile.telefone) : f.telefone,
    }));

    async function checkExisting() {
      const [{ data: entriesData }, { data: profileRow }] = await Promise.all([
        supabase
          .from("queue_entries")
          .select("id, status, token, created_at, driver_user_id")
          .eq("driver_user_id", profile!.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("profiles")
          .select("checkin_liberado")
          .eq("id", profile!.id)
          .single(),
      ]);
      if (cancelled) return;
      const entries = (entriesData as QueueEntry[]) ?? [];
      const liberado = profileRow?.checkin_liberado === true;
      setCheckinLiberado(liberado);
      const eligibilityProfile = { checkin_liberado: liberado };
      const active = hasActiveCheckIn(entries);
      if (active && !liberado) {
        router.replace(MOTORISTA_HOME);
        return;
      }
      setCooldownBlock(getCheckinCooldownBlock(entries[0] ?? null, eligibilityProfile));
      setEligibilityLoading(false);
    }
    setEligibilityLoading(true);
    void checkExisting();

    function onVisible() {
      if (document.visibilityState === "visible") {
        void checkExisting();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [profile, supabase, router]);

  const onCooldown = cooldownBlock != null;
  const canSubmit = !onCooldown;

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  }

  function validateForm(data = form): boolean {
    const e: Record<string, string> = {};
    if (!data.minuta.trim()) e.minuta = "Minuta obrigatória";
    if (!data.nome.trim()) e.nome = "Nome obrigatório";
    if (data.telefone.replace(/\D/g, "").length < 10) e.telefone = "Telefone inválido";
    if (!data.transportadora.trim()) e.transportadora = "Transportadora obrigatória";
    if (data.placa_cavalo.replace(/\W/g, "").length < 7) e.placa_cavalo = "Placa cavalo inválida";
    else if (!isValidPlaca(data.placa_cavalo)) e.placa_cavalo = PLACA_MERCOSUL_HINT;
    if (data.placa_carreta.replace(/\W/g, "").length < 7) e.placa_carreta = "Placa carreta inválida";
    else if (!isValidPlaca(data.placa_carreta)) e.placa_carreta = PLACA_MERCOSUL_HINT;
    if (data.tipo_veiculo === "bitrem") {
      if (data.placa_segunda_carreta.replace(/\W/g, "").length < 7)
        e.placa_segunda_carreta = "Placa 2ª carreta obrigatória";
      else if (!isValidPlaca(data.placa_segunda_carreta))
        e.placa_segunda_carreta = PLACA_MERCOSUL_HINT;
    }
    if (!data.retorno_racks_vazios) e.retorno_racks_vazios = "Selecione Sim ou Não";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submitCheckIn(formData: typeof form) {
    if (!validateForm(formData)) return;

    setSubmitting(true);
    setErrors({});

    let res: Response;
    let data: {
      error?: string;
      detail?: string;
      token?: string;
      message?: string;
      warning?: string;
    };

    try {
      res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          checkin_lat: null,
          checkin_lng: null,
          device_id: getDeviceId(),
          user_agent: getUserAgent(),
          retorno_racks_vazios: formData.retorno_racks_vazios === "sim",
        }),
      });
      data = await res.json();
    } catch {
      setSubmitting(false);
      setErrors({ form: "Falha de conexão. Verifique sua internet e tente novamente." });
      return;
    }

    setSubmitting(false);

    if (res.status === 409 && data.token) {
      router.push(MOTORISTA_HOME);
      return;
    }
    if (data.error === "placa_em_uso") {
      setErrors({
        placa_cavalo: data.message ?? "Esta placa já possui um check-in ativo na fila.",
      });
      return;
    }
    if (data.error === "cooldown") {
      setErrors({
        form:
          cooldownBlock != null
            ? formatCheckinCooldownMessage(cooldownBlock)
            : (data.message ?? COOLDOWN_MESSAGE),
      });
      return;
    }
    if (data.error === "Acesso negado") {
      setErrors({ form: "Conta sem permissão de motorista." });
      return;
    }
    if (data.error === "migration_required") {
      setErrors({
        form:
          data.message ??
          "Banco não atualizado. Execute supabase/migracao-em-viagem.sql no Supabase e tente novamente.",
      });
      return;
    }
    if (!res.ok) {
      const msg = data.message || data.detail || data.error || "Erro ao realizar check-in.";
      setErrors({
        form: msg.includes("Placa") ? `${msg}. ${PLACA_MERCOSUL_HINT}` : msg,
      });
      return;
    }

    const successParams = new URLSearchParams({ registrado: "1" });
    if (data.warning) successParams.set("warning", data.warning);
    router.push(`/motorista?${successParams.toString()}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitCheckIn(form);
  }

  if (authError) {
    return <PageLoader error={authError} onRetry={() => window.location.reload()} />;
  }

  if (checking || !profile || eligibilityLoading) {
    return <PageLoader message="Carregando…" />;
  }

  return (
    <MotoristaShell profile={profile} checkinNavEnabled>
      <div className="space-y-4">
        <PanelPageTitle
          title="Check-in de viagem"
          subtitle={
            onCooldown
              ? "Aguarde o prazo para um novo check-in."
              : "Registre após o carregamento em Belém."
          }
        />

        {checkinLiberado && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
            Check-in liberado pela administração. Você pode registrar uma nova viagem agora.
          </div>
        )}

        {cooldownBlock && <CheckinCooldownAlert block={cooldownBlock} />}

        <div className="alert-banner alert-banner--info flex gap-3 text-sm">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <p>{REMOTE_CHECKIN_INFO}</p>
        </div>

        <Card className="card-brand">
          <CardHeader>
            <CardTitle className="text-brand">Dados do check-in</CardTitle>
          </CardHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <fieldset disabled={!canSubmit || submitting} className="space-y-4 disabled:opacity-60">
            <Input label="Minuta *" value={form.minuta} onChange={(e) => updateField("minuta", e.target.value)} error={errors.minuta} className="text-lg py-3" />
            <Input label="Nome completo *" value={form.nome} onChange={(e) => updateField("nome", e.target.value)} error={errors.nome} className="text-lg py-3" />
            <Input label="Telefone *" value={form.telefone} onChange={(e) => updateField("telefone", formatPhone(e.target.value))} error={errors.telefone} className="text-lg py-3" />
            <Input label="Transportadora *" value={form.transportadora} onChange={(e) => updateField("transportadora", e.target.value)} error={errors.transportadora} className="text-lg py-3" />
            <Select label="Tipo de veículo *" value={form.tipo_veiculo} onChange={(e) => updateField("tipo_veiculo", e.target.value)} options={VEHICLE_TYPES.map((v) => ({ value: v.value, label: v.label }))} />
            <Input label="Placa cavalo *" value={form.placa_cavalo} onChange={(e) => updateField("placa_cavalo", formatPlaca(e.target.value))} error={errors.placa_cavalo} className="text-lg py-3 font-mono uppercase" placeholder="ABC1D23" />
            <Input label="Placa carreta *" value={form.placa_carreta} onChange={(e) => updateField("placa_carreta", formatPlaca(e.target.value))} error={errors.placa_carreta} className="text-lg py-3 font-mono uppercase" placeholder="ABC1D23" />
            {form.tipo_veiculo === "bitrem" && (
              <Input label="Placa 2ª carreta *" value={form.placa_segunda_carreta} onChange={(e) => updateField("placa_segunda_carreta", formatPlaca(e.target.value))} error={errors.placa_segunda_carreta} className="text-lg py-3 font-mono uppercase" placeholder="ABC1D23" />
            )}
            <Select label="Retornará com racks vazios? *" value={form.retorno_racks_vazios} onChange={(e) => updateField("retorno_racks_vazios", e.target.value)} options={[{ value: "", label: "Selecione" }, { value: "sim", label: "Sim" }, { value: "nao", label: "Não" }]} error={errors.retorno_racks_vazios} />
            <Textarea label="Observações" value={form.observacoes} onChange={(e) => updateField("observacoes", e.target.value)} />
            </fieldset>

            {errors.form && <p className="alert-error text-left">{errors.form}</p>}

            <Button type="submit" className="w-full py-4 text-lg" size="lg" disabled={!canSubmit || submitting}>
              {submitting ? (
                <Spinner size="md" className="h-5 w-5" />
              ) : onCooldown ? (
                "Check-in indisponível"
              ) : (
                "Confirmar check-in de viagem"
              )}
            </Button>
          </form>
        </Card>
      </div>
    </MotoristaShell>
  );
}
