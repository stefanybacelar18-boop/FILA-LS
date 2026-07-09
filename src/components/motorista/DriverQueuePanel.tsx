"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGate } from "@/components/auth/AuthGate";
import { useDriverQueueData } from "@/hooks/useDriverQueueData";
import { useMotoristaGeofence } from "@/hooks/useMotoristaGeofence";
import { countVehiclesAhead, resolveQueuePosition } from "@/lib/queue";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MotoristaQueueList } from "@/components/motorista/MotoristaQueueList";
import { CheckinBlockedAlert } from "@/components/motorista/CheckinBlockedAlert";
import { LinkButton } from "@/components/ui/LinkButton";
import { MotoristaShell } from "@/components/layout/MotoristaShell";
import { Spinner } from "@/components/ui/Spinner";
import { RefreshIconButton } from "@/components/ui/RefreshIconButton";
import { QueuePositionHero } from "@/components/ui/PageHeader";
import type { Profile, QueueEntry } from "@/lib/types";
import { MOTORISTA_CHECKIN, FILA_DESCARGA_PUBLIC } from "@/lib/constants";
import { formatPrevisaoDate } from "@/lib/utils";
import { ClipboardList, ArrowRight, BellRing } from "lucide-react";
import { ensureDriverPushSubscription, isDriverPushSupported } from "@/lib/driver-push-client";
import { playDriverCallAlert, unlockDriverCallSound } from "@/lib/driver-call-sound";
import { isPwaStandalone } from "@/lib/pwa-client";

export function DriverQueuePanel() {
  return (
    <AuthGate roles={["motorista"]} loginPath="/login/motorista">
      {(profile) => (
        <Suspense
          fallback={
            <MotoristaShell profile={profile}>
              <div className="flex justify-center py-16">
                <Spinner label="Carregando fila…" />
              </div>
            </MotoristaShell>
          }
        >
          <DriverQueueContent profile={profile} />
        </Suspense>
      )}
    </AuthGate>
  );
}

function DriverQueueFilaSection({
  entries,
  highlightId,
  searchQuery,
  onSearchChange,
  showStatus = false,
}: {
  entries: QueueEntry[];
  highlightId?: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  showStatus?: boolean;
}) {
  return (
    <MotoristaQueueList
      entries={entries}
      highlightId={highlightId}
      minimal
      showStatus={showStatus}
      searchQuery={searchQuery}
      onSearchChange={onSearchChange}
      searchPlaceholder="Buscar minuta…"
    />
  );
}

function buildHeroDetail(aFrente: number, previsaoLabel: string | null): string {
  const fila =
    aFrente > 0
      ? `${aFrente} veículo${aFrente !== 1 ? "s" : ""} à frente`
      : "Próximo da fila";
  if (previsaoLabel) return `${fila} · Previsão ${previsaoLabel}`;
  return fila;
}

function DriverQueueContent({ profile }: { profile: Profile }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { entry, allEntries, loading, refresh } = useDriverQueueData(profile);
  const geo = useMotoristaGeofence(!loading);
  const [minutaSearch, setMinutaSearch] = useState("");
  const [showCallAlert, setShowCallAlert] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">(
    "default"
  );
  const [pushBusy, setPushBusy] = useState(false);
  const [pushSyncError, setPushSyncError] = useState<string | null>(null);
  const [pushTestMsg, setPushTestMsg] = useState<string | null>(null);
  const [isStandaloneApp, setIsStandaloneApp] = useState(false);
  const initializedCallStateRef = useRef(false);
  const lastCallMarkerRef = useRef<string | null>(null);

  const hasEntry = !!entry;
  const checkinNavEnabled = hasEntry || geo.canCheckIn;
  const geoLoading = geo.step === "loading" && !geo.skipGeofence;
  const checkinBlocked = !hasEntry && !geo.canCheckIn && !geoLoading;
  const redirectedFromCheckin =
    searchParams.get("fila") === "1" || searchParams.get("motivo") === "fora";

  useEffect(() => {
    if (loading || geoLoading || hasEntry) return;
    if (geo.canCheckIn && !redirectedFromCheckin) {
      router.replace(MOTORISTA_CHECKIN);
    }
  }, [loading, geoLoading, hasEntry, geo.canCheckIn, router, redirectedFromCheckin]);

  const blockHint = checkinBlocked
    ? geo.step === "outside"
      ? "Check-in bloqueado — fora do pátio"
      : geo.step === "denied"
        ? "Check-in bloqueado — ative o GPS"
        : "Check-in bloqueado — valide a localização"
    : null;

  const showLoading = loading || (!hasEntry && geoLoading);
  const entries = allEntries as QueueEntry[];
  const entryId = entry?.id ?? null;
  const calledAt = entry?.called_at ?? null;
  const posicao = entry ? resolveQueuePosition(entry, entries) : null;
  const aFrente = entry ? countVehiclesAhead(entry, entries) : 0;
  const previsaoLabel = entry?.previsao_descarregamento
    ? formatPrevisaoDate(entry.previsao_descarregamento)
    : null;

  const listRefresh = <RefreshIconButton onRefresh={refresh} label="Atualizar fila" />;

  useEffect(() => {
    if (!isDriverPushSupported()) {
      setPushPermission("unsupported");
      return;
    }
    setPushPermission(Notification.permission);
    setIsStandaloneApp(isPwaStandalone());
  }, []);

  async function enablePush(requestPermission = true) {
    setPushBusy(true);
    setPushSyncError(null);
    setPushTestMsg(null);
    unlockDriverCallSound();
    try {
      const result = await ensureDriverPushSubscription({ requestPermission });
      setPushPermission(result);
      if (result === "denied") {
        setPushSyncError("Notificacoes bloqueadas no celular. Ative nas configuracoes do app.");
      } else if (result === "granted") {
        setPushTestMsg(
          isPwaStandalone()
            ? "Notificacoes ativas no app instalado. Feche o app e use Testar."
            : "Abra pelo icone instalado na tela inicial e ative de novo para avisos com app fechado."
        );
      }
    } catch (error) {
      setPushSyncError(error instanceof Error ? error.message : "Erro ao ativar notificacoes");
    } finally {
      setPushBusy(false);
    }
  }

  async function testPushNotification() {
    setPushBusy(true);
    setPushTestMsg(null);
    setPushSyncError(null);
    try {
      if (!isPwaStandalone()) {
        setPushSyncError(
          "Abra pelo icone FilaDock na tela inicial (app instalado), nao pela aba do Chrome."
        );
        return;
      }

      const res = await fetch("/api/notifications/test", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setPushSyncError(json.error ?? "Falha no teste de notificacao.");
        return;
      }

      if (document.visibilityState === "visible") {
        setPushTestMsg(
          "Push enviado. Agora feche o app instalado (remova dos recentes). O som aqui e so alerta interno — a notificacao real aparece na barra do celular com app fechado."
        );
      } else {
        setPushTestMsg("Push enviado. Verifique a barra de notificacoes do celular.");
      }
    } finally {
      setPushBusy(false);
    }
  }

  useEffect(() => {
    if (!isDriverPushSupported()) return;

    function onSwMessage(event: MessageEvent) {
      const data = event.data as { type?: string } | null;
      if (data?.type !== "DRIVER_CALLED") return;
      setShowCallAlert(true);
      if ("vibrate" in navigator) {
        navigator.vibrate([250, 120, 250]);
      }
      void playDriverCallAlert();
    }

    navigator.serviceWorker.addEventListener("message", onSwMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onSwMessage);
  }, []);

  useEffect(() => {
    const marker = entryId ? `${entryId}:${calledAt ?? ""}` : null;

    if (!initializedCallStateRef.current) {
      initializedCallStateRef.current = true;
      lastCallMarkerRef.current = marker;
      return;
    }

    if (!calledAt) {
      lastCallMarkerRef.current = marker;
      return;
    }

    if (lastCallMarkerRef.current === marker) return;

    setShowCallAlert(true);
    if ("vibrate" in navigator) {
      navigator.vibrate([250, 120, 250]);
    }
    void playDriverCallAlert();
    lastCallMarkerRef.current = marker;
  }, [entryId, calledAt]);

  return (
    <MotoristaShell
      profile={profile}
      checkinNavEnabled={checkinNavEnabled}
      checkinBlockHint={blockHint}
    >
      {showLoading ? (
        <div className="flex justify-center py-16" role="status" aria-live="polite">
          <Spinner label="Carregando fila…" />
        </div>
      ) : hasEntry ? (
        <div className="space-y-4">
          {pushPermission !== "granted" && pushPermission !== "unsupported" && (
            <div className="rounded-xl border border-brand/30 bg-brand-muted/40 px-4 py-3 text-brand">
              <p className="text-sm font-semibold">Ative alertas na barra do celular</p>
              <p className="mt-1 text-xs text-brand/80">
                Necessario para avisar com app fechado ou tela bloqueada.
              </p>
              {pushSyncError && (
                <p className="mt-1 text-xs font-medium text-red-700">{pushSyncError}</p>
              )}
              <button
                type="button"
                onClick={() => void enablePush(true)}
                disabled={pushBusy}
                className="mt-2 rounded-md border border-brand/40 bg-white px-3 py-1.5 text-xs font-semibold text-brand disabled:opacity-60"
              >
                {pushBusy ? "Ativando..." : "Permitir notificacoes"}
              </button>
            </div>
          )}

          {pushPermission === "granted" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <p className="font-medium">
                {isStandaloneApp
                  ? "Notificacoes ativas no app instalado."
                  : "Notificacoes ativas no navegador — abra pelo icone instalado para avisos com app fechado."}
              </p>
              {!isStandaloneApp && (
                <p className="mt-1 font-medium text-amber-800">
                  Feche a aba do Chrome e use o app FilaDock na tela inicial.
                </p>
              )}
              {pushSyncError && (
                <p className="mt-1 font-medium text-red-700">{pushSyncError}</p>
              )}
              {pushTestMsg && <p className="mt-1">{pushTestMsg}</p>}
              <button
                type="button"
                onClick={() => void testPushNotification()}
                disabled={pushBusy}
                className="mt-2 rounded-md border border-emerald-400 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-900 disabled:opacity-60"
              >
                {pushBusy ? "Enviando..." : "Testar notificacao (feche o app)"}
              </button>
            </div>
          )}

          {showCallAlert && (
            <div
              className="rounded-2xl border-2 border-emerald-500 bg-emerald-100 px-4 py-4 text-emerald-900 shadow-md ring-2 ring-emerald-300/70"
              role="status"
              aria-live="assertive"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-emerald-600 p-2 text-white animate-pulse">
                    <BellRing className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-base font-bold uppercase tracking-wide">
                      Voce foi chamado
                    </p>
                    <p className="mt-1 text-sm font-medium text-emerald-900">
                      Dirija-se ao ponto de operacao agora e aguarde orientacao da equipe.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-md border border-emerald-500 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-900"
                  onClick={() => setShowCallAlert(false)}
                >
                  Entendi
                </button>
              </div>
            </div>
          )}

          <QueuePositionHero
            label={`Minuta ${entry.minuta || "—"}`}
            value={posicao != null ? `${posicao}º` : "—"}
            detail={buildHeroDetail(aFrente, previsaoLabel)}
            trailing={listRefresh}
            footer={
              <div className="flex w-full justify-center">
                <StatusBadge status={entry.status} className="bg-white/95 shadow-sm" />
              </div>
            }
            className="hero-pattern"
          />

          <DriverQueueFilaSection
            entries={entries}
            highlightId={entry.id}
            searchQuery={minutaSearch}
            onSearchChange={setMinutaSearch}
            showStatus
          />
        </div>
      ) : checkinBlocked ? (
        <div className="space-y-4">
          <CheckinBlockedAlert
            step={geo.step}
            distanceLabel={geo.distanceLabel}
            geofenceName={geo.geofence.name}
            onRetry={geo.retry}
            redirectedFromCheckin={redirectedFromCheckin}
          />

          {entries.length > 0 ? (
            <DriverQueueFilaSection
              entries={entries}
              searchQuery={minutaSearch}
              onSearchChange={setMinutaSearch}
            />
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">Fila vazia no momento.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="panel-card">
            <div className="panel-card__icon">
              <ClipboardList className="h-7 w-7 text-brand" />
            </div>
            <h2 className="panel-card__title">Check-in no pátio</h2>
            <p className="panel-card__desc">Entre na fila de descarregamento.</p>
            <LinkButton href="/checkin" className="touch-target mt-5 w-full py-3.5 text-base">
              Iniciar check-in
              <ArrowRight className="h-4 w-4" />
            </LinkButton>
          </div>

          {entries.length > 0 && (
            <DriverQueueFilaSection
              entries={entries}
              searchQuery={minutaSearch}
              onSearchChange={setMinutaSearch}
            />
          )}
        </div>
      )}

      {!hasEntry && (
        <p className="mt-8 text-center text-xs text-slate-400">
          <Link href={FILA_DESCARGA_PUBLIC} className="text-brand hover:underline">
            Fila pública
          </Link>
        </p>
      )}
    </MotoristaShell>
  );
}
