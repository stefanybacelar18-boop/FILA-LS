"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useMotoristaGuard } from "@/hooks/useAuthGuard";
import { useMotoristaGeofence } from "@/hooks/useMotoristaGeofence";
import { hasActiveCheckIn, getDeviceId, getUserAgent } from "@/lib/checkin-rules";
import type { QueueEntry } from "@/lib/types";
import {
  COOLDOWN_MESSAGE,
  CHECKIN_SUCCESS,
  MOTORISTA_HOME,
  VEHICLE_TYPES,
} from "@/lib/constants";
import { formatPhone, formatPlaca } from "@/lib/utils";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { MapPin, CheckCircle2 } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { PageLoader } from "@/components/ui/PageLoader";
import { MotoristaShell } from "@/components/layout/MotoristaShell";
import { GeofenceStatusBanner } from "@/components/motorista/GeofenceStatusBanner";
import { isValidPlaca, PLACA_MERCOSUL_HINT } from "@/lib/checkin-validation";

export default function CheckInPage() {
  const router = useRouter();
  const supabase = createClient();
  const { profile, checking, authError } = useMotoristaGuard();
  const geo = useMotoristaGeofence(!!profile && !checking);
  const [redirecting, setRedirecting] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    setForm((f) => ({
      ...f,
      nome: profile.full_name || f.nome,
      telefone: profile.telefone ? formatPhone(profile.telefone) : f.telefone,
    }));

    async function checkExisting() {
      const { data } = await supabase
        .from("queue_entries")
        .select("*")
        .eq("driver_user_id", profile!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(10);
      const active = hasActiveCheckIn((data as QueueEntry[]) ?? []);
      if (active && !profile!.checkin_liberado) router.replace(MOTORISTA_HOME);
    }
    void checkExisting();
  }, [profile, supabase, router]);

  // Fora do pátio → volta para fila (acompanhar sem check-in)
  useEffect(() => {
    if (!profile || checking || geo.step === "loading") return;
    if (geo.isOutside && !geo.skipGeofence) {
      setRedirecting(true);
      router.replace(`${MOTORISTA_HOME}?motivo=fora`);
    }
  }, [profile, checking, geo.step, geo.isOutside, geo.skipGeofence, router]);

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
    if (!geo.canCheckIn || !geo.coords) {
      setErrors({ form: "Confirme sua localização no pátio antes de enviar." });
      return;
    }
    if (!validateForm(formData)) return;

    setSubmitting(true);
    setErrors({});

    let res: Response;
    let data: { error?: string; detail?: string; token?: string };

    try {
      res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          checkin_lat: geo.coords.lat,
          checkin_lng: geo.coords.lng,
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
    if (data.error === "cooldown") {
      setErrors({ form: COOLDOWN_MESSAGE });
      return;
    }
    if (data.error === "outside_geofence") {
      router.replace(`${MOTORISTA_HOME}?motivo=fora`);
      return;
    }
    if (data.error === "Acesso negado") {
      setErrors({ form: "Conta sem permissão de motorista." });
      return;
    }
    if (!res.ok) {
      const msg = data.detail || data.error || "Erro ao realizar check-in.";
      setErrors({
        form: msg.includes("Placa") ? `${msg}. ${PLACA_MERCOSUL_HINT}` : msg,
      });
      return;
    }

    router.push(`${CHECKIN_SUCCESS}?token=${encodeURIComponent(data.token ?? "")}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitCheckIn(form);
  }

  if (authError) {
    return <PageLoader error={authError} onRetry={() => window.location.reload()} />;
  }

  if (checking || !profile || redirecting || (geo.isOutside && !geo.skipGeofence)) {
    return <PageLoader message="Verificando localização…" />;
  }

  const canSubmit = geo.canCheckIn && !!geo.coords;

  return (
    <MotoristaShell profile={profile} checkinNavEnabled>
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-bold text-brand">Check-in</h1>
          <p className="mt-1 text-sm text-slate-500">
            Preencha os dados da carga para entrar na fila de descarga.
          </p>
        </div>

        <Card className="card-brand">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-brand">
              <MapPin className="h-5 w-5" /> Localização GPS
            </CardTitle>
          </CardHeader>
          {geo.step === "loading" && (
            <div className="flex items-center gap-3 text-slate-600">
              <Spinner size="md" className="h-5 w-5" /> Verificando GPS...
            </div>
          )}
          {(geo.step === "inside" || geo.step === "skipped") && (
            <div className="flex items-center gap-3 rounded-xl bg-green-50 p-4 text-success">
              <CheckCircle2 className="h-6 w-6" />
              <p className="font-medium">Localização confirmada no pátio!</p>
            </div>
          )}
          <GeofenceStatusBanner
            variant="checkin"
            step={geo.step}
            distanceLabel={geo.distanceLabel}
            onRetry={geo.retry}
          />
          {geo.skipGeofence && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Modo teste LAN: geofence desativado — remova antes da operação real.
            </p>
          )}
        </Card>

        <Card className="card-brand">
          <CardHeader>
            <CardTitle className="text-brand">Dados do check-in</CardTitle>
          </CardHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
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

            {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

            <Button type="submit" className="w-full py-4 text-lg" size="lg" disabled={!canSubmit || submitting}>
              {submitting ? <Spinner size="md" className="h-5 w-5" /> : "Confirmar check-in"}
            </Button>
          </form>
        </Card>
      </div>
    </MotoristaShell>
  );
}
