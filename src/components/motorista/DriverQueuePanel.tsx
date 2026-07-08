"use client";

import { Suspense, useEffect } from "react";
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
import { ClipboardList, ArrowRight } from "lucide-react";

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

function DriverQueueContent({ profile }: { profile: Profile }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { entry, allEntries, loading, refresh } = useDriverQueueData(profile);
  const geo = useMotoristaGeofence(!loading);

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
  const posicao = entry ? resolveQueuePosition(entry, entries) : null;
  const aFrente = entry ? countVehiclesAhead(entry, entries) : 0;
  const previsaoLabel = entry?.previsao_descarregamento
    ? formatPrevisaoDate(entry.previsao_descarregamento)
    : null;

  const listRefresh = <RefreshIconButton onRefresh={refresh} label="Atualizar fila" />;

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
          <QueuePositionHero
            label="Sua posição na fila"
            value={posicao != null ? `${posicao}º` : "—"}
            detail={
              aFrente > 0
                ? `${aFrente} veículo${aFrente !== 1 ? "s" : ""} à frente`
                : "Você é o próximo da fila"
            }
            trailing={listRefresh}
            className="hero-pattern"
          />

          <div className="stat-strip" role="status">
            <div className="stat-strip__cell">
              <span className="stat-strip__value text-brand">{entry.minuta || "—"}</span>
              <span className="stat-strip__label">Minuta</span>
              <span className="stat-strip__hint">Seu check-in</span>
            </div>
            <div className="stat-strip__cell">
              <span className="stat-strip__value text-slate-700">{aFrente}</span>
              <span className="stat-strip__label">À frente</span>
              <span className="stat-strip__hint">Veículos</span>
            </div>
            <div className="stat-strip__cell">
              <span className="stat-strip__value text-base text-slate-800">
                {previsaoLabel ?? "—"}
              </span>
              <span className="stat-strip__label">Previsão</span>
              <span className="stat-strip__hint">Descarga</span>
            </div>
          </div>

          <div className="flex justify-center">
            <StatusBadge status={entry.status} className="px-4 py-1 text-sm" />
          </div>

          <MotoristaQueueList
            entries={entries}
            highlightId={entry.id}
            title="Fila do pátio"
            showStatus
          />

          <p className="text-center text-xs text-slate-400">Atualização em tempo real</p>
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
            <MotoristaQueueList
              entries={entries}
              title="Fila do pátio"
              headerAction={listRefresh}
            />
          ) : (
            <p className="text-center text-sm text-slate-500">Nenhum veículo na fila no momento.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="panel-card">
            <div className="panel-card__icon">
              <ClipboardList className="h-7 w-7 text-brand" />
            </div>
            <h2 className="panel-card__title">Faça seu check-in</h2>
            <p className="panel-card__desc">
              Você está no pátio. Preencha os dados da carga para entrar na fila.
            </p>
            <LinkButton href="/checkin" className="touch-target mt-6 w-full py-3.5 text-base">
              Iniciar check-in
              <ArrowRight className="h-4 w-4" />
            </LinkButton>
          </div>

          {entries.length > 0 && (
            <MotoristaQueueList
              entries={entries}
              title="Fila do pátio"
              headerAction={listRefresh}
            />
          )}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-slate-400">
        <Link href={FILA_DESCARGA_PUBLIC} className="font-semibold text-brand hover:underline">
          Ver fila pública
        </Link>
      </p>
    </MotoristaShell>
  );
}
