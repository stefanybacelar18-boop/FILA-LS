"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_GEOFENCE } from "@/lib/constants";
import {
  clampGeofenceRadius,
  normalizeGeofenceConfig,
} from "@/lib/geofence";
import type { GeofenceConfig } from "@/lib/types";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AdminPageHeader } from "@/components/layout/AdminPageHeader";
import { StatCard, SectionHeader } from "@/components/ui/StatCard";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { PageLoader } from "@/components/ui/PageLoader";
import { Spinner } from "@/components/ui/Spinner";
import { GeofenceMapEditor } from "@/components/admin/GeofenceMapEditor";
import { GoogleFormSyncPanel } from "@/components/admin/GoogleFormSyncPanel";
import {
  MapPin,
  QrCode,
  RefreshCw,
} from "lucide-react";
import { usePublicAppUrl } from "@/hooks/usePublicAppUrl";

const QRCodeSVG = dynamic(
  () => import("qrcode.react").then((mod) => mod.QRCodeSVG),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-40 w-40 items-center justify-center rounded-xl bg-slate-50">
        <Spinner size="sm" />
      </div>
    ),
  }
);

export default function AdminPage() {
  const { profile, checking, authError } = useAuthGuard(["administrador"]);
  const supabase = useMemo(() => createClient(), []);
  const [geofence, setGeofence] = useState<GeofenceConfig>(DEFAULT_GEOFENCE);
  const [showGeofenceMap, setShowGeofenceMap] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [liberarEmail, setLiberarEmail] = useState("");
  const [liberarMsg, setLiberarMsg] = useState("");
  const [liberarError, setLiberarError] = useState("");
  const [liberando, setLiberando] = useState(false);
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const appUrl = usePublicAppUrl();

  const loadRoleCounts = useCallback(async () => {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("role, email")
      .is("deleted_at", null);

    const counts: Record<string, number> = {};
    for (const p of profiles ?? []) {
      counts[p.role] = (counts[p.role] ?? 0) + 1;
    }
    setRoleCounts(counts);
  }, [supabase]);

  async function handleRefreshOverview() {
    setRefreshing(true);
    await loadRoleCounts();
    setRefreshing(false);
  }

  useEffect(() => {
    if (!profile) return;

    async function load() {
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "geofence")
        .single();

      if (data?.value && typeof data.value === "object") {
        setGeofence(normalizeGeofenceConfig(data.value));
      }
    }
    load();
    void loadRoleCounts();
  }, [supabase, loadRoleCounts, profile]);

  async function liberarCheckin() {
    const email = liberarEmail.trim();
    if (!email) return;

    setLiberando(true);
    setLiberarMsg("");
    setLiberarError("");

    const res = await fetch("/api/admin/liberar-checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      email?: string;
      nome?: string;
      finalizados?: number;
    };

    setLiberando(false);

    if (!res.ok) {
      setLiberarError(json.error ?? "Não foi possível liberar o check-in.");
      return;
    }

    const finalizados = json.finalizados ?? 0;
    setLiberarMsg(
      `Check-in liberado para ${json.email ?? email}${
        finalizados > 0
          ? ` · ${finalizados} registro(s) ativo(s) encerrado(s) para novo teste`
          : ""
      }`
    );
    setLiberarEmail("");
  }

  async function saveGeofence() {
    const normalized = normalizeGeofenceConfig(geofence);
    setGeofence(normalized);
    setSaving(true);
    await supabase
      .from("settings")
      .upsert({ key: "geofence", value: normalized }, { onConflict: "key" });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
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
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <AdminPageHeader title="Administração" className="mb-0" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefreshOverview}
          disabled={refreshing}
          className="shrink-0 self-start sm:self-auto"
        >
          {refreshing ? <Spinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1.5">Atualizar</span>
        </Button>
      </div>

      <GoogleFormSyncPanel />

      <SectionHeader title="Equipe" />
      <div className="mb-10 grid gap-3 sm:grid-cols-3">
        <StatCard title="Empilhadores" value={roleCounts.empilhador ?? 0} accent="blue" />
        <StatCard title="Administradores" value={roleCounts.administrador ?? 0} accent="slate" />
        <StatCard title="Motoristas" value={roleCounts.motorista ?? 0} accent="green" />
      </div>

      <SectionHeader title="Configurações" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-brand" />
              Geofence
            </CardTitle>
          </CardHeader>

          <div className="space-y-4">
            <Input
              label="Nome do local"
              value={geofence.name}
              onChange={(e) =>
                setGeofence({ ...geofence, name: e.target.value })
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Latitude"
                type="number"
                step="any"
                value={geofence.lat}
                onChange={(e) =>
                  setGeofence({ ...geofence, lat: parseFloat(e.target.value) })
                }
              />
              <Input
                label="Longitude"
                type="number"
                step="any"
                value={geofence.lng}
                onChange={(e) =>
                  setGeofence({ ...geofence, lng: parseFloat(e.target.value) })
                }
              />
            </div>
            <Input
              label="Raio (metros)"
              type="number"
              min={50}
              max={5000}
              value={geofence.radius_meters}
              onChange={(e) =>
                setGeofence({
                  ...geofence,
                  radius_meters: clampGeofenceRadius(
                    parseInt(e.target.value, 10)
                  ),
                })
              }
            />

            <GeofenceMapEditor
              geofence={geofence}
              onChange={setGeofence}
              enabled={showGeofenceMap}
            />
            {!showGeofenceMap && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setShowGeofenceMap(true)}
              >
                Mostrar mapa
              </Button>
            )}

            <Button onClick={saveGeofence} disabled={saving}>
              {saving ? (
                <Spinner size="sm" />
              ) : saved ? (
                "Salvo!"
              ) : (
                "Salvar"
              )}
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-4 w-4 text-brand" />
              QR codes
            </CardTitle>
          </CardHeader>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-medium text-slate-700">Motorista</p>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <QRCodeSVG
                  value={`${appUrl}/login/motorista`}
                  size={160}
                  level="H"
                  includeMargin
                />
              </div>
              <p className="break-all text-center text-[11px] text-slate-400">
                {appUrl}/login/motorista
              </p>
            </div>

            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-medium text-slate-700">Operacional</p>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <QRCodeSVG
                  value={`${appUrl}/login`}
                  size={160}
                  level="H"
                  includeMargin
                />
              </div>
              <p className="break-all text-center text-[11px] text-slate-400">
                {appUrl}/login
              </p>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Liberar check-in</CardTitle>
          </CardHeader>
          <p className="mb-4 text-sm text-slate-500">
            Antecipa novo check-in e encerra fila ativa do motorista (testes).
          </p>
          <div className="flex flex-wrap gap-3">
            <Input
              label="E-mail do motorista"
              value={liberarEmail}
              onChange={(e) => setLiberarEmail(e.target.value)}
              placeholder="ex: motorista@gmail.com"
              className="max-w-sm"
            />
            <div className="flex items-end">
              <Button onClick={liberarCheckin} disabled={liberando}>
                {liberando ? <Spinner size="sm" /> : "Liberar"}
              </Button>
            </div>
          </div>
          {liberarError && <p className="mt-2 text-sm text-red-600">{liberarError}</p>}
          {liberarMsg && <p className="mt-2 text-sm text-success">{liberarMsg}</p>}
        </Card>
      </div>
    </AppShell>
  );
}
