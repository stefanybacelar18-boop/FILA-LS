"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_GEOFENCE, ROLE_LABELS } from "@/lib/constants";
import { getTodayStartISO } from "@/lib/queue-day";
import type { GeofenceConfig, QueueEntry } from "@/lib/types";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { StatCard, AdminToolCard, SectionHeader } from "@/components/ui/StatCard";
import { PageHero } from "@/components/ui/PageHero";
import { computeDashboardStats } from "@/lib/dashboard-stats";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { PageLoader } from "@/components/ui/PageLoader";
import { Spinner } from "@/components/ui/Spinner";
import {
  MapPin,
  QrCode,
  ListOrdered,
  LayoutDashboard,
  History,
  Tv,
  Users,
  ClipboardList,
  Truck,
  UserCog,
  CheckCircle2,
  UserX,
  RefreshCw,
  FileSpreadsheet,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { usePublicAppUrl } from "@/hooks/usePublicAppUrl";

declare global {
  interface Window {
    google?: typeof google;
    initGoogleMap?: () => void;
  }
}

function GeofenceMapEditor({
  geofence,
  onChange,
  enabled,
}: {
  geofence: GeofenceConfig;
  onChange: (g: GeofenceConfig) => void;
  enabled: boolean;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const initMap = useCallback(() => {
    if (!mapRef.current || !window.google) return;

    const center = { lat: geofence.lat, lng: geofence.lng };

    if (!mapInstance.current) {
      mapInstance.current = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: 15,
        mapTypeControl: false,
        streetViewControl: false,
      });

      mapInstance.current.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
          onChange({
            ...geofence,
            lat: e.latLng.lat(),
            lng: e.latLng.lng(),
          });
        }
      });
    }

    if (markerRef.current) markerRef.current.setMap(null);
    markerRef.current = new window.google.maps.Marker({
      position: center,
      map: mapInstance.current,
      draggable: true,
    });
    markerRef.current.addListener("dragend", () => {
      const pos = markerRef.current!.getPosition()!;
      onChange({ ...geofence, lat: pos.lat(), lng: pos.lng() });
    });

    if (circleRef.current) circleRef.current.setMap(null);
    circleRef.current = new window.google.maps.Circle({
      map: mapInstance.current,
      center,
      radius: geofence.radius_meters,
      fillColor: "#2563eb",
      fillOpacity: 0.15,
      strokeColor: "#2563eb",
      strokeWeight: 2,
    });

    mapInstance.current.setCenter(center);
  }, [geofence, onChange]);

  useEffect(() => {
    if (!enabled || !apiKey) return;

    if (window.google) {
      initMap();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initGoogleMap`;
    script.async = true;
    window.initGoogleMap = initMap;
    document.head.appendChild(script);

    return () => {
      delete window.initGoogleMap;
    };
  }, [apiKey, initMap, enabled]);

  useEffect(() => {
    if (window.google && mapInstance.current) initMap();
  }, [geofence.lat, geofence.lng, geofence.radius_meters, initMap]);

  if (!enabled) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
        Clique em &quot;Mostrar mapa&quot; para carregar o Google Maps.
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">
        Configure NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para exibir o mapa.
        <br />
        Lat: {geofence.lat}, Lng: {geofence.lng}, Raio: {geofence.radius_meters}m
      </div>
    );
  }

  return <div ref={mapRef} className="h-64 w-full rounded-lg" />;
}

export default function AdminPage() {
  const { profile, checking, authError } = useAuthGuard(["administrador"]);
  const supabase = createClient();
  const [geofence, setGeofence] = useState<GeofenceConfig>(DEFAULT_GEOFENCE);
  const [showGeofenceMap, setShowGeofenceMap] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [liberarEmail, setLiberarEmail] = useState("");
  const [liberarMsg, setLiberarMsg] = useState("");
  const [liberarError, setLiberarError] = useState("");
  const [liberando, setLiberando] = useState(false);
  const [queueAtivos, setQueueAtivos] = useState(0);
  const [dayStats, setDayStats] = useState<ReturnType<typeof computeDashboardStats> | null>(null);
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const appUrl = usePublicAppUrl();

  const loadOverview = useCallback(async () => {
    const todayIso = getTodayStartISO();

    const { data: entriesToday } = await supabase
      .from("queue_entries")
      .select("*")
      .is("deleted_at", null)
      .gte("created_at", todayIso);

    const entries = (entriesToday ?? []) as QueueEntry[];
    const stats = computeDashboardStats(entries);
    setDayStats(stats);
    setQueueAtivos(stats.veiculosAguardando);

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
    await loadOverview();
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
        setGeofence(data.value as GeofenceConfig);
      }
    }
    load();
    loadOverview();

    const interval = setInterval(loadOverview, 60_000);
    return () => clearInterval(interval);
  }, [supabase, loadOverview, profile]);

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
    setSaving(true);
    await supabase
      .from("settings")
      .upsert({ key: "geofence", value: geofence }, { onConflict: "key" });
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

  const taxaConclusao =
    dayStats && dayStats.veiculosHoje > 0
      ? Math.round((dayStats.veiculosFinalizados / dayStats.veiculosHoje) * 100)
      : 0;

  return (
    <AppShell role="administrador" userName={profile.full_name}>
      <PageHero
        eyebrow="Central de administração"
        title="Painel LSL"
        description="Visão geral, ferramentas e configurações do sistema"
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefreshOverview}
          disabled={refreshing}
          className="border-white/30 bg-white/10 text-white hover:bg-white/20"
        >
          {refreshing ? (
            <Spinner size="sm" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-1.5 hidden sm:inline">Atualizar</span>
        </Button>
      </PageHero>

      <SectionHeader title="Indicadores do dia" subtitle="Operação de hoje" />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Ativos na fila" value={queueAtivos} icon={Truck} accent="brand" />
        <StatCard
          title="Finalizados"
          value={dayStats?.veiculosFinalizados ?? "—"}
          icon={CheckCircle2}
          accent="green"
        />
        <StatCard
          title="Taxa conclusão"
          value={dayStats ? `${taxaConclusao}%` : "—"}
          subtitle={
            dayStats
              ? `${dayStats.veiculosFinalizados} de ${dayStats.veiculosHoje}`
              : undefined
          }
          icon={LayoutDashboard}
          accent="green"
        />
        <StatCard
          title="Ausentes hoje"
          value={dayStats?.veiculosAusentes ?? "—"}
          icon={UserX}
          accent="amber"
        />
      </div>

      <SectionHeader title="Equipe cadastrada" subtitle="Usuários por perfil" />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard title="Empilhadores" value={roleCounts.empilhador ?? 0} icon={Users} accent="blue" />
        <StatCard title="Administradores" value={roleCounts.administrador ?? 0} icon={UserCog} accent="slate" />
        <StatCard title="Motoristas" value={roleCounts.motorista ?? 0} icon={Users} accent="green" />
      </div>

      <SectionHeader title="Ferramentas" subtitle="Acesso rápido às áreas do sistema" />
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AdminToolCard
          href="/admin/minutas"
          label="Inteligência de minutas"
          description="Importar Excel, vencimento, prioridade e capacidade"
          icon={FileSpreadsheet}
        />
        <AdminToolCard
          href="/admin/fila"
          label="Gerenciar fila"
          description="Prioridade, previsões, status e docas"
          icon={ListOrdered}
        />
        <AdminToolCard
          href="/admin/checkins"
          label="Registro de check-ins"
          description="Histórico de entradas no pátio"
          icon={ClipboardList}
        />
        <AdminToolCard
          href="/dashboard"
          label="Dashboard"
          description="Indicadores, gráficos e atividade do dia"
          icon={LayoutDashboard}
        />
        <AdminToolCard
          href="/historico"
          label="Histórico"
          description="Consulta completa de operações"
          icon={History}
        />
        <AdminToolCard
          href="/tv"
          label="Painel TV"
          description="Exibição para monitor no pátio"
          icon={Tv}
        />
      </div>

      <SectionHeader title="Configurações" subtitle="Geofence, QR codes e liberações" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-brand" />
              Papéis e permissões
            </CardTitle>
          </CardHeader>
          <ul className="space-y-3 text-sm text-slate-600">
            <li>
              <strong className="text-slate-800">{ROLE_LABELS.motorista}</strong> — login, check-in
              sem CPF, painel com posição e todas as minutas do dia.
            </li>
            <li>
              <strong className="text-slate-800">{ROLE_LABELS.empilhador}</strong> — fila, chama
              motorista via WhatsApp e altera status (vê prioridade definida pelo admin).
            </li>
            <li>
              <strong className="text-slate-800">{ROLE_LABELS.administrador}</strong> — controle
              total: fila, prioridade, previsões, geofence, QR code, histórico com dia de chegada e
              finalização, dashboard.
            </li>
          </ul>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-brand" />
              Perímetro Geográfico (Geofence)
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
              value={geofence.radius_meters}
              onChange={(e) =>
                setGeofence({
                  ...geofence,
                  radius_meters: parseInt(e.target.value) || 100,
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
                "Salvar Configurações"
              )}
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-brand" />
              QR Codes — celular
            </CardTitle>
          </CardHeader>

          <p className="mb-4 text-sm text-slate-600">
            Imprima ou exiba na portaria. Motoristas e empilhador acessam pelo celular
            na mesma Wi-Fi do servidor.
          </p>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm font-semibold text-slate-800">Motorista</p>
              <div className="rounded-xl border-2 border-slate-200 bg-white p-4">
                <QRCodeSVG
                  value={`${appUrl}/login/motorista`}
                  size={180}
                  level="H"
                  includeMargin
                />
              </div>
              <p className="break-all text-center text-xs text-slate-500">
                {appUrl}/login/motorista
              </p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <p className="text-sm font-semibold text-slate-800">Empilhador</p>
              <div className="rounded-xl border-2 border-slate-200 bg-white p-4">
                <QRCodeSVG
                  value={`${appUrl}/login`}
                  size={180}
                  level="H"
                  includeMargin
                />
              </div>
              <p className="break-all text-center text-xs text-slate-500">
                {appUrl}/login
              </p>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Liberar check-in (cooldown 6 dias)</CardTitle>
          </CardHeader>
          <p className="mb-4 text-sm text-slate-600">
            Permite novo check-in antes dos 6 dias e encerra fila ativa do motorista (para testes).
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
