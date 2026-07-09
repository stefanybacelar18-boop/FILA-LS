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

function playCallSoundFallback() {
  if (typeof window === "undefined") return;
  const audioCtx =
    "AudioContext" in window
      ? new window.AudioContext()
      : "webkitAudioContext" in window
        ? new (window as Window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext()
        : null;
  if (!audioCtx) return;

  const pulse = (startAt: number, duration: number, frequency: number) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.25, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(startAt);
    osc.stop(startAt + duration);
  };

  const now = audioCtx.currentTime + 0.02;
  pulse(now, 0.22, 920);
  pulse(now + 0.28, 0.22, 1080);

  window.setTimeout(() => {
    void audioCtx.close().catch(() => {
      /* noop */
    });
  }, 1000);
}

function base64UrlToUint8Array(base64Url: string) {
  const padded = `${base64Url}${"=".repeat((4 - (base64Url.length % 4)) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = window.atob(padded);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
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
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPushPermission("unsupported");
      return;
    }
    setPushPermission(Notification.permission);
  }, []);

  async function enablePushAlerts() {
    if (pushBusy || typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushPermission("unsupported");
      return;
    }

    setPushBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPushPermission(perm);
      if (perm !== "granted") return;

      const keyRes = await fetch("/api/notifications/subscribe", { cache: "no-store" });
      const keyJson = (await keyRes.json().catch(() => ({}))) as {
        publicKey?: string | null;
        enabled?: boolean;
      };
      if (!keyRes.ok || !keyJson.enabled || !keyJson.publicKey) return;

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const subscription =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(keyJson.publicKey),
        }));

      await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
    } finally {
      setPushBusy(false);
    }
  }

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
    playCallSoundFallback();
    lastCallMarkerRef.current = marker;
  }, [entryId, calledAt]);

  useEffect(() => {
    if (!showCallAlert) return;

    const timer = window.setInterval(() => {
      if ("vibrate" in navigator) {
        navigator.vibrate([300, 120, 300, 120, 450]);
      }
      playCallSoundFallback();
    }, 3500);

    return () => window.clearInterval(timer);
  }, [showCallAlert]);

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
              <p className="text-sm font-semibold">Ative alertas com app fechado</p>
              <p className="mt-1 text-xs text-brand/80">
                Permita notificacoes para receber aviso mesmo fora da tela do app.
              </p>
              <button
                type="button"
                onClick={() => void enablePushAlerts()}
                disabled={pushBusy}
                className="mt-2 rounded-md border border-brand/40 bg-white px-3 py-1.5 text-xs font-semibold text-brand disabled:opacity-60"
              >
                {pushBusy ? "Ativando..." : "Ativar notificacoes"}
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
